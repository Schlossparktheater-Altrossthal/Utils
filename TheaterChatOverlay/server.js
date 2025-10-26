// Minimaler WebSocket-Server für Live-Steuerung
// Nutzung: 1) npm init -y  2) npm i ws  3) node server.js

import { WebSocketServer } from 'ws';
const PORT = process.env.PORT || 8081;
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
// node -e "(async()=>{const ws=new (await import('ws')).WebSocket('ws://localhost:8081');ws.on('open',()=>ws.send(JSON.stringify({type:'msg',role:'them',name:'Regie',text:'Los!'})));})();"