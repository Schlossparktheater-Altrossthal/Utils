# Aufzeichnen der Offline‑Demo

Diese Datei beschreibt mehrere einfache Wege, wie du die Offline‑Demo deines Theater Chat Overlays als Video aufzeichnen kannst. Ich habe dafür bereits zwei Support‑Skripte ins Repo gelegt:

- `record-playwright.js` — empfohlen: nutzt Playwrights eingebautes Video‑Recording (WebM). Optional konvertiert es mit ffmpeg nach MP4.
- `record-demo.js` — Screenshot‑basiertes Skript (Puppeteer) das Frames macht und mit ffmpeg zu MP4 zusammenfügt.

Außerdem beschreibe ich die manuelle Methode mit OBS (empfohlen wenn du Audio brauchst).

---

## Voraussetzungen

- Node.js (>=14)
- npm
- ffmpeg (nur nötig, wenn du MP4 erzeugen oder WebM → MP4 konvertieren möchtest)
- optional: Playwright (wird per `npm install` installiert) oder Puppeteer (falls du `record-demo.js` verwenden willst)

Wenn du Playwright benutzt, installiere zusätzlich die Browser via:

```powershell
npx playwright install
```

Wenn du ffmpeg auf Windows brauchst, kannst du z. B. Chocolatey oder Scoop verwenden:

```powershell
choco install ffmpeg
# oder
scoop install ffmpeg
```

---

## Empfohlene (automatisierte) Methode: Playwright (schnell & zuverlässig)

Vorteile:
- Einfach einzurichten.
- Browser‑Video wird direkt aufgezeichnet (WebM).
- Sehr stabil für Headless‑Recording.

Nutzung (PowerShell):

1) Abhängigkeiten installieren

```powershell
cd 'C:\Users\JB\workspace\Theater\Utils\TheaterChatOverlay'
npm install
npx playwright install
```

2) Video aufnehmen (WebM):

```powershell
node .\record-playwright.js demo-playwright.webm 1280 720 25
```

3) Optional: Konvertiere WebM → MP4 (falls du MP4 brauchst und ffmpeg installiert ist):

```powershell
# Das Playwright‑Script kann direkt MP4 ausgeben, wenn ffmpeg gefunden wird.
node .\record-playwright.js demo-playwright.mp4 1280 720 25
```

Hinweis: Playwright nimmt die Page auf, nicht das System‑Audio. Wenn du Ton brauchst, nutze OBS (siehe unten) oder nehme Audio separat auf.

---

## Alternative (älter): Puppeteer + ffmpeg (Screenshot → Frames → MP4)

Das Repo enthält `record-demo.js` (Puppeteer‑basiert). Erzeugt viele PNG‑Frames und assemblert sie mit ffmpeg.

Beispiel:

```powershell
cd 'C:\Users\JB\workspace\Theater\Utils\TheaterChatOverlay'
npm install puppeteer
node .\record-demo.js demo-record.mp4 1280 720 25
```

Vorteile:
- Sehr kontrolliert (Frame‑by‑frame).
Nachteile:
- Erzeugt viele Dateien (Tmp‑Frames).
- Langsamer und speicherintensiver als Playwright‑Video.

Tipp: Verwende diese Methode nur, wenn du sehr präzise Frame‑Control brauchst.

---

## Manuelle, hochwertige Methode: OBS Studio (für Audio + Qualität)

Wenn du Ton (Systemaudio, Mikrofon) oder feinere Kontrolle über Codec/Bitrate brauchst, empfehle ich OBS.

Kurz‑Anleitung:
1) Installiere OBS: https://obsproject.com
2) Erstelle eine neue Szene.
3) Füge eine Quelle "Browser" oder "Window Capture" hinzu und lade `index.html` (lokale Datei) oder öffne die Seite in einem Browser und wähle das Browser‑Fenster.
4) Wähle Aufnahme‑Einstellungen (Auflösung, Encoder: x264 oder NVENC, Container: mp4/mkv) und starte Aufnahme.

Vorteile:
- Natives Audio, hohe Qualität, Live‑Monitoring
- Einfache GUI‑Konfiguration

Nachteile:
- Nicht headless/automatisiert. (Du kannst OBS mit obs‑websocket steuern, aber das ist ein eigener Workflow.)

---

## Hinweise zu file:// vs http://

Manche Browser und Browser‑APIs (z. B. fetch) verhalten sich unterschiedlich mit `file://`‑URLs. Wenn du Probleme hast, starte einen einfachen HTTP‑Server im Projektordner:

```powershell
# kleines statisches HTTP mit http-server
npx http-server -p 8080
# dann öffne http://localhost:8080/index.html
```

Das ist oft robuster für Medien und relative Pfade.

---

## Audio in automatisierten Aufnahmen

Automatische Browser‑Recordings (Playwright, Puppeteer) zeichnen normalerweise kein System‑Audio auf. Optionen:

- Verwende OBS für Audio (einfachste Option).
- Wenn die Seite WebAudio verwendet, könntest du im Browser einen Recorder implementieren (MediaRecorder des AudioContext) und die Audiodaten als WAV/OGG exportieren, dann mit ffmpeg muxen.
- Oder nimm Audio extern (z. B. Mikrofon) separat auf und muxe anschließend per ffmpeg:

```powershell
ffmpeg -i video.webm -i audio.wav -c:v copy -c:a aac final.mp4
```

---

## Troubleshooting & Tipps
- Wenn Playwright kein Video ausgibt: prüfe `playwright` Version und Browser‑Install (npx playwright install).
- Wenn ffmpeg nicht gefunden: stelle sicher, dass `ffmpeg` im PATH ist (Starte Shell neu nach Installation).
- Für deterministische Ergebnisse sorge dafür, dass keine Netzwerk‑abhängigen Inhalte während der Demo geladen werden.

---

Falls du möchtest, erstelle ich noch:
- Ein kurzes `README.md`‑Update, das das npm‑Script `record:playwright` erklärt (kann ich auch direkt ins Haupt‑README integrieren), oder
- ein Playwright‑Preset, das die Seite per `http://localhost:8080` lädt (automatisches Starten eines dev‑servers vor Aufnahme).

Sag mir kurz, welche Ergänzung du willst — und ob Audio wichtig ist. Ich kann das sofort hinzufügen. 
