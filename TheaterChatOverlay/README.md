# Theater Chat-Overlay (WhatsApp-Stil)

Moderner Chat-Overlay mit Präsentationsansicht im WhatsApp-Stil. Läuft lokal mit Demo-Timeline, lässt sich aber auch fast
serverless – inspiriert von [VDO.Ninja](https://vdo.ninja/) – in beliebig vielen Räumen steuern. Ein Director hostet die
Runde, während Overlays, Gäste und Beobachter per WebRTC-Datenkanal direkt angebunden werden.

## Schnellstart
- **Nur Demo ansehen:** `index.html` im Browser öffnen.
- **Chat Studio:** `editor.html` ermöglicht das Zusammenstellen eigener Timelines (Import/Export via JSON/Base64).
- **Serverless Regie:** Raum-URL generieren (siehe unten), Overlay im Browser/OBS laden und Director-Link öffnen.
- **Signalisierung:** `npm install` und `npm start` starten den minimalistischen WebSocket-Signalserver (`ws://localhost:8081`).
  Alternativ kann jeder eigene Broadcast-/Signalisierungsdienst genutzt werden (Parameter `?signal=`).

## WebRTC-Räume à la VDO.Ninja
Die Raum-Backplane nutzt reine WebRTC-Datenkanäle. Ein Director fungiert als Host, Overlays und Gäste verbinden sich via
STUN/TURN zu ihm. Die Signalisierung (Offer/Answer/ICE) erfolgt über einen simplen WebSocket-Broadcast – damit ist die
Architektur praktisch serverlos.

1. **Signalserver starten:** `npm start` läuft auf `ws://localhost:8081` und broadcastet alle Nachrichten an verbundene
   Clients. Für produktiven Betrieb lässt sich derselbe Code (oder ein eigener Dienst) leicht hinter HTTPS/WSS deployen.
2. **STUN/TURN konfigurieren:** `webrtc/ice-config.example.js` zu `webrtc/ice-config.js` kopieren und – falls vorhanden – eigene
   TURN-Server eintragen. Standardmäßig werden öffentliche Google-STUNs verwendet.
3. **Räume teilen:** `index.html?room=myshow` öffnet sofort den Overlay-Client für den Raum `myshow`. Der Director-Link baut
   automatisch die Host-Verbindung auf und verteilt Kommandos an die Peers.

### Rollen & Links
Die Panel-Schaltflächen erzeugen passende Deep-Links inkl. Signalisierungs- und ICE-Parametern:

| Modus (`mode`)| Zweck | Beispiel-Link |
| --- | --- | --- |
| `overlay` (Standard) | Reiner Anzeige-Client für Bühne/OBS | `index.html?room=myshow&mode=overlay` |
| `director` | Regie-Ansicht mit voller Kontrolle | `index.html?room=myshow&mode=director` |
| `participant` / `guest` | Remote-Gäste oder Sprecher:innen, die live eintippen | `index.html?room=myshow&mode=participant&displayName=Anna` |

Alle Links lassen sich über das Panel kopieren. Der Director behält die Vorschau der Bühne, während Overlays automatisch in
Readonly gehen. Gäste bekommen den Chat-Composer, senden Nachrichten direkt in den Raum und sehen Live-Feedback.

### Raum-Funktionen
- Synchronisierte Chat-Historie, Hintergründe und Demo-Sequenzen über WebRTC-Datenkanäle.
- Präsenzliste im Header (Anzeige der aktiven Clients, inkl. Gäste, Director, Overlay) via Peer-Heartbeat.
- Heartbeat-basierte Anwesenheitsverwaltung ohne zentralen Server.
- Optionaler WebSocket-Fallback für reine Demo-/Studio-Szenarien.

## WebSocket-Signalisierung & Fallback
Der mitgelieferte `server.js` kümmert sich ausschließlich um das Verteilen der Signalisierungsnachrichten (Offer/Answer/ICE,
Presence). Fällt WebRTC aus, kann dasselbe WebSocket auch wie früher als Broadcast-Backplane dienen.

```bash
npm install
npm start   # startet server.js auf ws://localhost:8081
```

Über `?ws=ws://localhost:8081` lässt sich der Overlay weiterhin als klassischer Broadcast-Client betreiben.

## Wichtige URL-Parameter
- `?room=<name>` Raum-ID (aktiviert die WebRTC-Backplane).
- `&mode=overlay|director|participant|guest` Rolle des Clients.
- `&displayName=Anna` Voreinstellung für Name/Präsenz.
- `&panel=1` Panel sofort einblenden (Director-Modus öffnet es automatisch).
- `&theme=dark|light|auto`
- `&bg=<Bild- oder Video-URL>`
- `&transparent=1` Transparenter Hintergrund für OBS.
- `&customChat=<JSON|Base64|URL>` Eigene Demo-Sequenz (Alias: `chat`).
- `&tone=<preset|custom>` (`default`, `soft`, `click`, `chime` oder eigene URL via `toneUrl`).
- `&toneVolume=0.0-1.0`, `&toneRate=0.5-2.0`
- `&signal=wss://example.com/signal` Eigener Signalisierungs-Endpunkt.
- `&ice=<Base64|JSON>` Zusätzliche ICE-Server-Definition (überschreibt lokale Datei).
- `&stun=stun:example.com:3478` bzw. `&turn=turn:example.com:3478?transport=tcp` Kurzlinks für einzelne ICE-Server.

Alle Parameter funktionieren weiterhin ohne Serverless-Raum.

## Live-Kommandos
Director, Gäste oder externe Automationen senden JSON-Kommandos über den WebRTC-Datenkanal (automatisch per
`webrtc/mesh-client.js`) oder – bei reinem Legacy-Betrieb – über den WebSocket-Fallback. Relevante Felder:

```json
{ "type": "msg", "role": "them", "name": "Lisa", "avatar": "https://…/lisa.jpg", "text": "Wir sind live." }
{ "type": "typing", "on": true }
{ "type": "clear" }
{ "type": "bg", "url": "https://cdn.example.com/backdrops/forest.mp4" }
{ "type": "tone", "preset": "soft", "volume": 0.6 }
{ "type": "demo" }
```

## Chat Studio (editor.html)
- Timeline-Ansicht mit Drag-&-Drop, Duplizieren und Schnellbearbeitung einzelner Nachrichten.
- Lokale Projektverwaltung (`localStorage`) inkl. Projekt-Snapshots.
- Import/Export per JSON/Base64 für die Übergabe an `index.html?customChat=…`.

## OBS-Hinweise
- **Browser Source:** Auf Projektionsauflösung (z. B. 1920×1080) stellen.
- **Transparenz:** `?transparent=1` anhängen.
- **Panel:** Über `C` ein- und ausblendbar (nur Director/Gäste).

## Ideen & Erweiterungen
- OSC/MQTT-Bridge (z. B. Node-RED) → WebRTC- oder WS-Signalisierung.
- TURN-Autoprovisionierung (z. B. mittels coturn REST API).
- Mehrere Browser Sources mit unterschiedlichen Filtern für Multi-Screen-Produktionen.
