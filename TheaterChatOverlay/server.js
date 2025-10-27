// Minimaler, gehärteter WebSocket-Broadcast-Server
// Nutzung: 1) npm init -y  2) npm i ws  3) node server.js

import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT || 8081;
const MAX_BYTES = 64 * 1024; // 64 KiB
const HEARTBEAT_INTERVAL = 30_000;

const wss = new WebSocketServer({ port: PORT });

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const payloadText = typeof data === 'string' ? data : data.toString();
    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    if (size > MAX_BYTES) return;

    let msg;
    try {
      msg = JSON.parse(payloadText);
    } catch {
      return;
    }

    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > MAX_BYTES) continue;
      try {
        client.send(payload);
      } catch {
        /* ignore send errors */
      }
    }
  });

  ws.on('close', () => {
    ws.isAlive = false;
  });

  ws.on('error', () => {
    /* swallow */
  });

  ws.send(
    JSON.stringify({
      type: 'msg',
      role: 'them',
      name: 'System',
      text: 'Verbunden. Sende {"type":"demo"} für Demo.'
    })
  );
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(heartbeatTimer));

console.log(`WS listening on ws://localhost:${PORT}`);
