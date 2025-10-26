# Theater Chat-Overlay (WhatsApp‑Stil) + WebSocket-Server

Kompakter Overlay für Projektor/OBS. Läuft allein mit Demo-Timeline oder live über WebSocket. Transparenter Hintergrund optional. Steuerung per URL-Parametern.

## Start
- **Nur Demo:** Öffne `index.html` im Browser.
- **Mit Live-Steuerung:** `node server.js` starten, dann `index.html` öffnen. In OBS als *Browser Source* einbinden.

**URL-Parameter:**
- `?ws=ws://localhost:8080`  WebSocket-URL
- `&theme=dark|light`
- `&bg=<Bild-oder-Video-URL>`
- `&transparent=1`  macht Hintergrund transparent (für OBS)

---

### `index.html`
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Theater Chat Overlay</title>
  <style>
    :root {
      --bg: #0b141a;           /* WhatsApp dark */
      --panel: #111a20cc;
      --bubble-me: #005c4b;    /* grün */
      --bubble-them: #202c33;  /* dunkelgrau */
      --text: #e9edef;
      --muted: #96a1a8;
      --accent: #25d366;
      --maxw: min(56rem, 92vw);
      --gap: 10px;
      --radius: 18px;
      --avatar: 36px;
      --shadow: 0 6px 20px rgba(0,0,0,.35);
    }
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif; background: var(--bg); color: var(--text); overflow:hidden; }
    .stage { position:fixed; inset:0; display:grid; grid-template-rows: 1fr auto; }
    .bg-media { position:absolute; inset:0; object-fit:cover; width:100%; height:100%; z-index:0; opacity:.18; pointer-events:none; }
    .scrim { position:absolute; inset:0; background: radial-gradient(120% 120% at 80% 20%, transparent 0, rgba(0,0,0,.35) 60%, rgba(0,0,0,.65) 100%); z-index:1; pointer-events:none; }

    .chat-wrap { position:relative; z-index:2; display:flex; justify-content:center; align-items:stretch; padding: 24px 16px; }
    .chat { width: var(--maxw); display:flex; flex-direction:column; gap: var(--gap); max-height: calc(100vh - 48px); overflow:hidden; }
    .scroll { flex:1 1 auto; overflow-y:auto; padding-right:2px; scroll-behavior:smooth; }
    .row { display:flex; align-items:flex-end; gap:8px; }
    .row.them { justify-content:flex-start; }
    .row.me { justify-content:flex-end; }

    .avatar { width: var(--avatar); height: var(--avatar); border-radius:50%; flex:0 0 var(--avatar); object-fit:cover; box-shadow: var(--shadow); }

    .bubble { max-width: min(72%, 680px); padding:10px 12px; border-radius: var(--radius); box-shadow: var(--shadow); line-height:1.25; font-size: clamp(16px, 2.2vh, 20px); position:relative; }
    .them .bubble { background: var(--bubble-them); border-top-left-radius: 6px; }
    .me .bubble { background: var(--bubble-me); border-top-right-radius: 6px; }

    .meta { display:flex; gap:8px; align-items:center; font-size:.78em; color: var(--muted); margin-top:6px; }
    .name { font-weight:600; }
    .time { opacity:.9; }

    .typing { display:inline-flex; gap:3px; align-items:center; }
    .dot { width:6px; height:6px; border-radius:50%; background:#b7c1c6; opacity:.25; animation: blink 1.2s infinite; }
    .dot:nth-child(2){ animation-delay:.15s }
    .dot:nth-child(3){ animation-delay:.3s }
    @keyframes blink { 0%,80%,100%{ opacity:.25 } 40%{ opacity:1 } }

    .media { margin-top:8px; border-radius:12px; overflow:hidden; max-height: 42vh; }
    .media img, .media video { display:block; max-width:100%; height:auto; }

    /* Top info bar */
    .topbar { z-index:2; position:fixed; top:8px; left:50%; transform:translateX(-50%); background: #0e171dcc; color: var(--text); border-radius: 999px; padding:8px 14px; font-size:14px; backdrop-filter: blur(6px); box-shadow: var(--shadow); }

    /* Control panel (toggle: press C) */
    .panel { position:fixed; right:12px; bottom:12px; z-index:3; width:min(420px, 92vw); background: var(--panel); border-radius:16px; box-shadow: var(--shadow); display:grid; gap:8px; padding:12px; font-size:14px; }
    .panel h3 { margin:0 0 4px; font-size:14px; opacity:.9; }
    .panel input, .panel textarea, .panel select, .panel button { width:100%; box-sizing:border-box; border:1px solid #22333b; background:#0c1419; color:#e1e6ea; border-radius:10px; padding:8px 10px; }
    .row2 { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
    .hidden { display:none; }

    /* Transparent mode for OBS */
    body.trans { background: transparent; }
  </style>
</head>
<body>
  <div class="stage" id="stage">
    <video id="bgVideo" class="bg-media" autoplay muted loop playsinline></video>
    <img id="bgImage" class="bg-media" alt="" />
    <div class="scrim" id="scrim"></div>

    <div class="topbar" id="topbar">Chat‑Overlay • <span id="status">offline</span></div>

    <div class="chat-wrap">
      <div class="chat">
        <div id="scroll" class="scroll"></div>
        <div id="typingRow" class="row them hidden">
          <img class="avatar" src="https://i.pravatar.cc/64?img=32" alt="avatar"/>
          <div class="bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div>
        </div>
      </div>
    </div>

    <div class="panel hidden" id="panel">
      <h3>Live Eingabe (Taste C ein/aus)</h3>
      <div class="row2">
        <select id="role">
          <option value="them">Publikum</option>
          <option value="me">Protagonist</option>
        </select>
        <input id="name" placeholder="Name" value="Anna" />
      </div>
      <textarea id="text" rows="3" placeholder="Nachricht…"></textarea>
      <div class="row2">
        <input id="avatar" placeholder="Avatar-URL" value="https://i.pravatar.cc/64?img=12" />
        <input id="media" placeholder="Medien-URL (Bild/Video)" />
      </div>
      <div class="row2">
        <button id="send">Senden</button>
        <button id="demo">Demo starten</button>
      </div>
      <div class="row2">
        <button id="clear">Leeren</button>
        <button id="bgbtn">Hintergrund setzen</button>
      </div>
      <input id="bgurl" placeholder="BG Bild/Video URL" />
    </div>
  </div>

  <audio id="snd" preload="auto" src="https://cdn.jsdelivr.net/gh/limitlessgreen/cdn-audio@main/ui/pop.mp3"></audio>

  <script>
    // ===== Utilities =====
    const qs = (k, d=null) => new URLSearchParams(location.search).get(k) ?? d;
    const statusEl = document.getElementById('status');
    const scrollEl = document.getElementById('scroll');
    const typingRow = document.getElementById('typingRow');
    const snd = document.getElementById('snd');
    const bgImg = document.getElementById('bgImage');
    const bgVid = document.getElementById('bgVideo');

    // Theme + transparency
    if(qs('theme') === 'light'){
      document.documentElement.style.setProperty('--bg', '#e5ddd5');
      document.documentElement.style.setProperty('--bubble-them', '#ffffff');
      document.documentElement.style.setProperty('--bubble-me', '#d9fdd3');
      document.documentElement.style.setProperty('--text', '#111');
      document.documentElement.style.setProperty('--panel', '#ffffffcc');
    }
    if(qs('transparent') === '1') document.body.classList.add('trans');

    // Optional start background
    const startBg = qs('bg');
    if(startBg) setBackground(startBg);

    // Panel toggle
    const panel = document.getElementById('panel');
    document.addEventListener('keydown', e=>{ if(e.key.toLowerCase()==='c'){ panel.classList.toggle('hidden'); }});

    // Demo timeline
    const demo = [
      {delay:400,  msg:{role:'them', name:'Tom', avatar:'https://i.pravatar.cc/64?img=33', text:'Bist du schon da?'}},
      {delay:1600, typing:true},
      {delay:1800, msg:{role:'me',   name:'Anna', avatar:'https://i.pravatar.cc/64?img=12', text:'Ja, Bühne steht. Stream gleich live.'}},
      {delay:900,  msg:{role:'them', name:'Tom', avatar:'https://i.pravatar.cc/64?img=33', text:'Publikum füllt sich 🎭'}},
      {delay:1100, msg:{role:'me',   name:'Anna', avatar:'https://i.pravatar.cc/64?img=12', text:'Hintergrund jetzt.'}},
    ];

    let ws, wsUrl = qs('ws');
    if(wsUrl) connectWS(wsUrl);

    function connectWS(url){
      try{
        ws = new WebSocket(url);
        ws.onopen   = ()=>{ statusEl.textContent = 'online'; };
        ws.onclose  = ()=>{ statusEl.textContent = 'offline'; setTimeout(()=>connectWS(url), 1200); };
        ws.onerror  = ()=>{ statusEl.textContent = 'error'; };
        ws.onmessage= (ev)=>{
          try{ handleCommand(JSON.parse(ev.data)); } catch(e){ console.warn('Bad payload', e); }
        };
      }catch(e){ console.error(e); }
    }

    // ===== Rendering =====
    function addMessage({role='them', name='Person', avatar='', text='', media=null, time=null}){
      const row = document.createElement('div');
      row.className = `row ${role}`;

      const av = document.createElement('img');
      av.className='avatar';
      av.src = avatar || 'https://i.pravatar.cc/64?u='+encodeURIComponent(name);
      av.alt = 'avatar';

      const bubble = document.createElement('div');
      bubble.className='bubble';
      bubble.innerHTML = sanitize(text).replace(/\n/g,'<br/>');

      if(media){
        const m = document.createElement('div');
        m.className='media';
        if(/\.(mp4|webm|mov)(\?|$)/i.test(media)){
          const v = document.createElement('video'); v.src = media; v.controls=false; v.autoplay=true; v.loop=true; v.muted=true; v.playsInline=true; m.appendChild(v);
        } else {
          const i = document.createElement('img'); i.src = media; i.alt='media'; m.appendChild(i);
        }
        bubble.appendChild(m);
      }

      const meta = document.createElement('div');
      meta.className = 'meta';
      const nameEl = document.createElement('span'); nameEl.className='name'; nameEl.textContent = name;
      const timeEl = document.createElement('span'); timeEl.className='time'; timeEl.textContent = time || nowStr();
      meta.append(nameEl, timeEl);
      bubble.appendChild(meta);

      if(role==='them'){ row.append(av, bubble); } else { row.append(bubble, av); }
      scrollEl.appendChild(row);
      requestAnimationFrame(()=>{ scrollEl.scrollTop = scrollEl.scrollHeight + 9999; });
      try { snd.currentTime = 0; snd.play().catch(()=>{}); } catch{}
    }

    function setTyping(on=true){ typingRow.classList.toggle('hidden', !on); requestAnimationFrame(()=>{ scrollEl.scrollTop = scrollEl.scrollHeight + 9999; }); }

    function clearChat(){ scrollEl.innerHTML=''; }

    function setBackground(url){
      if(!url){ bgImg.src=''; bgVid.src=''; return; }
      if(/\.(mp4|webm|mov)(\?|$)/i.test(url)){
        bgVid.src = url; bgVid.style.display='block'; bgImg.style.display='none';
      } else { bgImg.src = url; bgImg.style.display='block'; bgVid.style.display='none'; }
    }

    function nowStr(){
      const d=new Date(); return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    }

    function sanitize(s){
      return (s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    }

    // ===== Command handler =====
    function handleCommand(cmd){
      // Schema examples below
      switch(cmd.type){
        case 'msg':      addMessage(cmd); break;
        case 'typing':   setTyping(!!cmd.on); break;
        case 'clear':    clearChat(); break;
        case 'bg':       setBackground(cmd.url||''); break;
        case 'ping':     ws && ws.send(JSON.stringify({type:'pong'})); break;
        case 'demo':     runDemo(); break;
        default: console.warn('Unknown cmd', cmd);
      }
    }

    // ===== Demo runner =====
    let demoRun = null;
    function runDemo(){
      if(demoRun){ clearTimeout(demoRun.t); demoRun = null; }
      clearChat();
      let i=0; const step=()=>{
        if(i>=demo.length){ setTyping(false); return; }
        const item = demo[i++];
        demoRun = { t: setTimeout(()=>{
          if(item.typing) { setTyping(true); }
          if(item.msg) { setTyping(false); addMessage(item.msg); }
          step();
        }, item.delay) };
      }; step();
    }

    // ===== Local panel actions =====
    document.getElementById('send').onclick = ()=>{
      const payload = {
        type:'msg',
        role: document.getElementById('role').value,
        name: document.getElementById('name').value || 'Person',
        avatar: document.getElementById('avatar').value,
        text: document.getElementById('text').value,
        media: document.getElementById('media').value || null,
      };
      addMessage(payload);
      if(ws && ws.readyState===1) ws.send(JSON.stringify(payload));
      document.getElementById('text').value='';
      document.getElementById('media').value='';
    };
    document.getElementById('demo').onclick  = ()=> handleCommand({type:'demo'});
    document.getElementById('clear').onclick = ()=> handleCommand({type:'clear'});
    document.getElementById('bgbtn').onclick = ()=> handleCommand({type:'bg', url: document.getElementById('bgurl').value});

    // Auto-start demo if no WS
    if(!wsUrl) runDemo();
  </script>
</body>
</html>
```

---

### `server.js`
```js
// Minimaler WebSocket-Server für Live-Steuerung
// Nutzung: 1) npm init -y  2) npm i ws  3) node server.js

import { WebSocketServer } from 'ws';
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    // Broadcast an alle
    for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify(msg));
  });
  ws.on('close', () => clients.delete(ws));
  // Begrüßung + Ping
  ws.send(JSON.stringify({ type:'msg', role:'them', name:'System', text:'Verbunden. Sende {"type":"demo"} für Demo.' }));
});

console.log(`WS listening on ws://localhost:${PORT}`);

// Optional: CLI zum Senden
// Beispiele:
// node -e "(async()=>{const ws=new (await import('ws')).WebSocket('ws://localhost:8080');ws.on('open',()=>ws.send(JSON.stringify({type:'msg',role:'them',name:'Regie',text:'Los!'})));})();"
```

---

## Live-Kommandos (JSON)
Sende per WebSocket:
```json
{ "type":"msg", "role":"them", "name":"Lisa", "avatar":"https://…/lisa.jpg", "text":"Wir sind live.", "media":"https://…/foto.jpg" }
```
```json
{ "type":"typing", "on": true }
```
```json
{ "type":"clear" }
```
```json
{ "type":"bg", "url": "https://cdn.example.com/backdrops/forest.mp4" }
```
```json
{ "type":"demo" }
```

## OBS-Hinweise
- *Browser Source*: Breite×Höhe auf Leinwandauflösung stellen (z. B. 1920×1080).
- *Transparenz*: `?transparent=1` am URL anhängen.
- *Interaktion*: Panel mit Taste **C**.

## Erweiterungen
- OSC/MQTT Brücke (Node-RED) → WebSocket.
- Persistente Szenenlisten (JSON-Datei) aus der Regie laden.
- Multi-Screen via mehrere Browser Sources mit unterschiedlichen Filtern.

