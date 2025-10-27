# Theater Chat-Overlay (WhatsApp-Stil) + WebSocket-Server

Kompakter Overlay für Projektor/OBS. Läuft allein mit Demo-Timeline oder live über WebSocket. Transparenter Hintergrund optional. Steuerung per URL-Parametern.

## Start
- **Nur Demo:** Öffne `index.html` im Browser.
- **Mit Live-Steuerung:** `npm install` und dann `npm start` starten, dann `index.html` öffnen. In OBS als *Browser Source* einbinden.

**URL-Parameter:**
- `?ws=ws://localhost:8080`  WebSocket-URL
- `&theme=dark|light`
- `&bg=<Bild-oder-Video-URL>`
- `&transparent=1`  macht Hintergrund transparent (für OBS)
- `&customChat=<JSON|Base64|URL>`  eigene Demo-Sequenz laden (Array wie in `offline-chat.js`, Alias: `chat`)
- `&tone=<preset|custom>`  Nachrichtenton auswählen (`default`, `soft`, `click`, `chime` oder eigene URL via `toneUrl`)
- `&toneUrl=<https://…>`  eigene Audio-Quelle für den Ton (überschreibt `tone`)
- `&toneVolume=0.0-1.0`  Lautstärke für den Ton
- `&toneRate=0.5-2.0`  Wiedergabegeschwindigkeit (Pitch)

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
{ "type":"tone", "preset":"soft", "volume":0.6 }
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