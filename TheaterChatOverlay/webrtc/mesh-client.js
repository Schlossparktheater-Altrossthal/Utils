const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

const noop = () => {};

export function createLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'client-' + Math.random().toString(36).slice(2, 10);
}

function safeParse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

async function loadIceServers(overrides) {
  if (Array.isArray(overrides) && overrides.length > 0) {
    return overrides;
  }

  if (typeof window !== 'undefined') {
    try {
      const module = await import('./ice-config.js');
      const servers = module.default ?? module.ICE_SERVERS ?? module.iceServers;
      if (Array.isArray(servers) && servers.length > 0) {
        return servers;
      }
    } catch (err) {
      console.debug('[mesh-client] Keine ice-config.js gefunden – verwende Fallback.', err);
    }
  }

  return DEFAULT_ICE_SERVERS;
}

function guessSignalUrl() {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    return 'ws://localhost:8081';
  }
  try {
    const current = new URL(window.location.href);
    const param = current.searchParams.get('signal');
    if (param) return param;
    const proto = current.protocol === 'https:' ? 'wss:' : current.protocol === 'http:' ? 'ws:' : 'ws:';
    return `${proto}//${current.host}/signal`;
  } catch (err) {
    return 'ws://localhost:8081';
  }
}

function createPresenceEntry({
  id,
  displayName,
  role,
  connected = false,
  self = false
}) {
  return {
    id,
    displayName: displayName || null,
    role: role || 'overlay',
    connected: Boolean(connected),
    self,
    lastSeen: Date.now()
  };
}

function stringifyPacket(data) {
  if (!data) return '';
  try {
    return JSON.stringify(data);
  } catch (err) {
    console.warn('[mesh-client] Paket konnte nicht serialisiert werden', err);
    return '';
  }
}

export async function createMeshClient({
  roomId,
  role = 'overlay',
  clientId = createLocalId(),
  displayName = null,
  signalUrl = null,
  iceServers = null,
  onCommand = noop,
  onPresence = noop,
  onStatus = noop
} = {}) {
  if (!roomId || typeof roomId !== 'string') {
    throw new Error('roomId ist erforderlich');
  }

  const trimmedRoom = roomId.trim();
  if (!trimmedRoom) {
    throw new Error('roomId darf nicht leer sein');
  }

  const isDirector = role === 'director';
  const servers = await loadIceServers(iceServers);
  const endpoint = signalUrl || guessSignalUrl();

  const peers = new Map();
  const presence = new Map();
  const pendingSignals = [];

  let ws = null;
  let wsReady = false;
  let heartbeatTimer = null;
  let hostId = null;
  let disposed = false;

  const localPresence = createPresenceEntry({
    id: clientId,
    displayName,
    role,
    connected: true,
    self: true
  });
  presence.set(clientId, localPresence);

  function emitPresenceUpdate() {
    const list = Array.from(presence.values()).map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      role: entry.role,
      connected: entry.connected,
      self: entry.self ?? false,
      lastSeen: entry.lastSeen
    }));
    try {
      onPresence(list);
    } catch (err) {
      console.error('[mesh-client] Fehler im onPresence-Handler', err);
    }
    if (isDirector) {
      queueSignal({
        type: 'presence',
        roomId: trimmedRoom,
        list,
        from: clientId
      });
      flushSignalQueue();
    }
  }

  function updatePresence(id, partial) {
    if (!id) return;
    const current = presence.get(id) || createPresenceEntry({ id });
    presence.set(id, { ...current, ...partial, lastSeen: Date.now() });
    if (isDirector || id === clientId) {
      emitPresenceUpdate();
    }
  }

  function removePresence(id) {
    if (!id || id === clientId) return;
    if (presence.has(id)) {
      presence.delete(id);
      emitPresenceUpdate();
    }
  }

  function queueSignal(payload) {
    if (!payload) return;
    pendingSignals.push(payload);
  }

  function flushSignalQueue() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    while (pendingSignals.length > 0) {
      const payload = pendingSignals.shift();
      try {
        ws.send(stringifyPacket({
          ...payload,
          roomId: trimmedRoom,
          clientId,
          role,
          displayName
        }));
      } catch (err) {
        console.warn('[mesh-client] Senden über Signalisierung fehlgeschlagen', err);
        break;
      }
    }
  }

  function broadcastCommand(command, { exclude } = {}) {
    if (!command || typeof command !== 'object') return;
    const packet = stringifyPacket({
      kind: 'command',
      payload: command,
      sourceId: command.sourceId || exclude || clientId,
      sentAt: Date.now()
    });
    for (const [id, peer] of peers.entries()) {
      if (exclude && id === exclude) continue;
      if (!peer.channel) continue;
      if (peer.channel.readyState === 'open') {
        try {
          peer.channel.send(packet);
        } catch (err) {
          console.warn('[mesh-client] Konnte Kommando nicht senden', err);
        }
      } else {
        peer.queue.push(packet);
      }
    }
  }

  function handleInboundPacket(fromId, data) {
    if (!data) return;
    let text = '';
    if (typeof data === 'string') {
      text = data;
    } else if (data instanceof ArrayBuffer) {
      if (typeof TextDecoder !== 'undefined') {
        try {
          text = new TextDecoder().decode(new Uint8Array(data));
        } catch (err) {
          text = '';
        }
      }
    }
    if (!text) return;
    const parsed = safeParse(text);
    if (!parsed) return;
    if (parsed.kind === 'command' && parsed.payload) {
      const src = parsed.sourceId || fromId;
      if (src && src === clientId) return; // eigenes Kommando
      try {
        onCommand(parsed.payload, { from: fromId, sourceId: src });
      } catch (err) {
        console.error('[mesh-client] Fehler im onCommand-Handler', err);
      }
      if (isDirector) {
        const forwarded = { ...parsed.payload, sourceId: src };
        broadcastCommand(forwarded, { exclude: fromId });
      }
    }
  }

  function attachChannel(peer, channel) {
    peer.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      peer.open = true;
      updatePresence(peer.id, { connected: true });
      while (peer.queue.length > 0) {
        const queued = peer.queue.shift();
        try {
          channel.send(queued);
        } catch (err) {
          console.warn('[mesh-client] Fehler beim Senden aus Warteschlange', err);
          break;
        }
      }
    };
    channel.onclose = () => {
      peer.open = false;
      updatePresence(peer.id, { connected: false });
    };
    channel.onmessage = (event) => handleInboundPacket(peer.id, event.data);
    channel.onerror = (err) => console.warn('[mesh-client] Datenkanalfehler', err);
  }

  function ensurePeer(remoteId, info = {}) {
    if (!remoteId || remoteId === clientId) return null;
    let peer = peers.get(remoteId);
    if (peer) return peer;

    const pc = new RTCPeerConnection({ iceServers: servers });
    const meta = {
      id: remoteId,
      pc,
      queue: [],
      info
    };
    peers.set(remoteId, meta);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        queueSignal({
          type: 'candidate',
          to: remoteId,
          candidate: event.candidate
        });
        flushSignalQueue();
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        setTimeout(() => {
          if (peers.get(remoteId) !== meta) return;
          peers.delete(remoteId);
          removePresence(remoteId);
        }, 0);
      }
    };

    if (isDirector) {
      const channel = pc.createDataChannel('chat', { ordered: true });
      attachChannel(meta, channel);
      pc.onnegotiationneeded = async () => {
        if (pc.signalingState === 'stable') {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            queueSignal({ type: 'offer', to: remoteId, sdp: pc.localDescription });
            flushSignalQueue();
          } catch (err) {
            console.warn('[mesh-client] Offer fehlgeschlagen', err);
          }
        }
      };
      // Sofort starten
      pc.onnegotiationneeded?.call(pc);
    } else {
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        attachChannel(meta, channel);
      };
    }

    return meta;
  }

  async function handleOfferMessage(message) {
    if (isDirector) return;
    const { from, sdp } = message;
    if (!from || !sdp) return;
    const peer = ensurePeer(from, { role: message.role, displayName: message.displayName });
    hostId = from;
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      queueSignal({ type: 'answer', to: from, sdp: peer.pc.localDescription });
      flushSignalQueue();
    } catch (err) {
      console.warn('[mesh-client] Antwort auf Offer fehlgeschlagen', err);
    }
  }

  async function handleAnswerMessage(message) {
    if (!isDirector) return;
    const { from, sdp } = message;
    if (!from || !sdp) return;
    const peer = peers.get(from);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.warn('[mesh-client] SetRemoteDescription fehlgeschlagen', err);
    }
  }

  async function handleCandidateMessage(message) {
    const targetId = message.to === clientId ? message.from : message.to;
    const peerId = isDirector ? message.from : hostId || message.from;
    if (!peerId) return;
    const peer = peers.get(peerId);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(message.candidate);
    } catch (err) {
      console.warn('[mesh-client] ICE-Kandidat konnte nicht hinzugefügt werden', err);
    }
  }

  function handleHello(message) {
    if (message.clientId === clientId) return;
    if (message.roomId !== trimmedRoom) return;
    updatePresence(message.clientId, {
      displayName: message.displayName,
      role: message.role,
      connected: false
    });
    if (isDirector) {
      const peer = ensurePeer(message.clientId, { role: message.role, displayName: message.displayName });
      if (peer && peer.pc && peer.pc.signalingState === 'stable') {
        peer.pc.onnegotiationneeded?.call(peer.pc);
      }
    } else if (message.role === 'director') {
      hostId = message.clientId;
    }
  }

  function handlePresenceMessage(message) {
    if (message.from === clientId) return;
    if (!Array.isArray(message.list)) return;
    if (!isDirector && hostId && message.from !== hostId) return;
    try {
      onPresence(message.list);
    } catch (err) {
      console.error('[mesh-client] Fehler im Presence-Handler', err);
    }
  }

  function handleBye(message) {
    if (!message || !message.clientId) return;
    const peer = peers.get(message.clientId);
    if (peer && peer.pc) {
      try {
        peer.pc.close();
      } catch (err) {}
      peers.delete(message.clientId);
    }
    removePresence(message.clientId);
  }

  function setupWebSocket() {
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket wird nicht unterstützt.');
    }
    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(endpoint);
      } catch (err) {
        reject(err);
        return;
      }

      ws.onopen = () => {
        wsReady = true;
        announce();
        if (isDirector) {
          queueSignal({ type: 'director-ready' });
          flushSignalQueue();
        }
        flushSignalQueue();
        onStatus({ type: 'signal-open', url: endpoint });
        resolve();
      };

      ws.onerror = (err) => {
        if (!wsReady) {
          reject(err);
        }
        onStatus({ type: 'signal-error', error: err });
      };

      ws.onclose = () => {
        wsReady = false;
        onStatus({ type: 'signal-close' });
        if (!disposed) {
          setTimeout(() => setupWebSocket().catch((e) => console.warn('Reconnect fehlgeschlagen', e)), 1500);
        }
      };

      ws.onmessage = (event) => {
        const message = typeof event.data === 'string' ? safeParse(event.data) : safeParse(event.data?.toString?.());
        if (!message || message.roomId !== trimmedRoom) return;
        if (message.clientId === clientId) return;

        switch (message.type) {
          case 'hello':
            handleHello(message);
            break;
          case 'director-ready':
            if (!isDirector) announce();
            break;
          case 'offer':
            handleOfferMessage(message);
            break;
          case 'answer':
            handleAnswerMessage(message);
            break;
          case 'candidate':
            handleCandidateMessage(message);
            break;
          case 'presence':
            handlePresenceMessage(message);
            break;
          case 'bye':
            handleBye(message);
            break;
          default:
            break;
        }
      };
    });
  }

  function announce() {
    queueSignal({ type: 'hello' });
    flushSignalQueue();
  }

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      announce();
    }, 15_000);
  }

  function dispose() {
    disposed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    queueSignal({ type: 'bye' });
    flushSignalQueue();
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch (err) {}
    }
    for (const peer of peers.values()) {
      try {
        peer.channel?.close();
      } catch (err) {}
      try {
        peer.pc?.close();
      } catch (err) {}
    }
    peers.clear();
    presence.clear();
  }

  await setupWebSocket();
  startHeartbeat();
  emitPresenceUpdate();

  async function publish(command) {
    if (!command || typeof command !== 'object') return;
    const payload = { ...command };
    payload.sourceId = payload.sourceId || clientId;

    if (isDirector) {
      try {
        onCommand(payload, { local: true, sourceId: clientId });
      } catch (err) {
        console.error('[mesh-client] Fehler im lokalen onCommand', err);
      }
      broadcastCommand(payload, { exclude: payload.excludeSource });
      return;
    }

    const hostPeer = hostId ? peers.get(hostId) : null;
    if (!hostPeer || !hostPeer.channel) {
      throw new Error('Noch keine Verbindung zur Regie.');
    }
    const packet = stringifyPacket({
      kind: 'command',
      payload,
      sourceId: payload.sourceId,
      sentAt: Date.now()
    });
    if (hostPeer.channel.readyState === 'open') {
      hostPeer.channel.send(packet);
    } else {
      hostPeer.queue.push(packet);
    }
  }

  async function updateMetadata() {
    // WebRTC-Implementierung synchronisiert Metadaten über Kommandos
    return Promise.resolve();
  }

  return {
    sourceId: clientId,
    publish,
    updateMetadata,
    dispose,
    getPresence: () => Array.from(presence.values())
  };
}

export function buildRoomLink(roomId, mode = 'overlay', baseUrl = null, extraParams = {}) {
  if (!roomId) return '';
  const href = typeof window !== 'undefined' ? window.location.href : 'https://example.com/index.html';
  const url = new URL(baseUrl || href);
  url.searchParams.set('room', roomId);
  url.searchParams.set('mode', mode);
  const persistKeys = ['signal', 'stun', 'turn', 'ice'];
  for (const key of persistKeys) {
    const value = extraParams[key] ?? (typeof window !== 'undefined'
      ? new URL(window.location.href).searchParams.get(key)
      : null);
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export default {
  createMeshClient,
  buildRoomLink,
  createLocalId
};
