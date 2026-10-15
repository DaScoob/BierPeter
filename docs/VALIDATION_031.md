# Validierung Alpha 0.3.1 / Firmware Alpha 0.3

## Automatisch geprüft

- Vollständige Python-API-Suite: 60 Tests bestanden, einschließlich neuer Run-Autorisierung, Parameterprüfung, eindeutiger Geräte-/Sessionzuordnung, verschlüsselter Ergebnisannahme, empfängerbezogenem Zugriff, idempotenter Wiederholung, verschlüsselter Geräteweiterleitung und explizitem Verwerfen.
- Vorhandene UI-/HTTP-Suites für Lobby-Einstieg, Registrierung, Einladung, Geräteverwaltung, Reihenfolge, privaten Tresor, Namensfreigabe, Kontakte, Kontolöschung und Wiederherstellungsschlüssel bestanden.
- Neue UI-/HTTP-Suite: tatsächlicher Demo-Befehl an die Gerätewarteschlange, X25519/HKDF/AES-GCM-Entschlüsselung im Browser, Sperren und erneutes Entsperren, Kontext-Replay abgewiesen, keine Demo-Ergebnisse in regulären Statistiken.
- QR-Rundlauf mit dem tatsächlich eingebundenen Decoder bestanden.
- Nativer C++-Spielkern: 20.000 Runs mit 133.275 Einzelmessungen, bis zu acht Geräten, beiden Seiten und ungleichen Aufstellungen. Zusätzlich sehr kurze Messung, lange Runde ohne Timeout, doppelte Abschlüsse und Übergabeverzögerung geprüft.
- Native Kryptografie: derselbe C++-HKDF-/X25519-Code und dieselbe Crypto-Bibliothek wie im Firmware-Build erzeugen einen AES-GCM-Umschlag, der vom tatsächlichen Browsermodul entschlüsselt wird. All-Zero-Peer und Kontext-Replay werden abgewiesen.
- ESP8266-, ESP32- und ESP32-S3-Firmware erfolgreich mit PlatformIO gebaut. Statische Speicherangaben stehen in `BUILD_031.json`. Statische RAM-Belegung ist keine Messung des freien Heaps im laufenden Funkbetrieb.
- Bestehender HTTP-Stresstest mit 240 gemischten Anfragen und zwölf parallelen Clients, konkurrierenden Platzbelegungen und konsistenten SQLite-Snapshots. Messwerte in `STRESS_031.json`.

## Nicht durch diese Tests belegt

Kein physischer ESP, keine angeschlossenen Sensoren und kein Docker-Daemon standen für diese Abnahme zur Verfügung. Die UI-Suites führen Anwendungs-JavaScript und echte HTTP-Anfragen mit einem minimalen DOM-Adapter aus. Sie ersetzen keine Prüfung in einem echten Mobilbrowser und keine visuelle Layout-Abnahme.

Die native Simulation prüft den Spielkern, nicht die reale Funkzustellung. Channel-Hopping, gleichzeitiger SoftAP-/Stationsbetrieb, tatsächliche Reconnects, Funklatenz, Uhrendrift, Stromausfall und Heap-Verbrauch müssen mit den Geräten nach `FIRMWARE_030.md` geprüft werden. Erfolgreiche Firmware-Builds sind kein Nachweis eines bereits erfolgreich auf Hardware gelaufenen Demo-Runs.

## Reproduktion

```bash
cd ~/BierPeter
python3 -m unittest discover -s tests -v
node --check web/app.js
node tests/ui-flow.cjs
node tests/ui-alpha021.cjs
node tests/ui-alpha022.cjs
node tests/ui-alpha030.cjs
node tests/ui-firmware.cjs
node tests/qr-roundtrip.cjs
python3 firmware/test/check-native.py
python3 tests/stress-alpha022.py
```

Für den nativen Kryptografietest zuerst die über `firmware/platformio.ini` festgelegten Bibliotheken mit PlatformIO installieren. Vollständiger Firmware-Build:

```bash
cd ~/BierPeter
python3 -m venv firmware/.venv
firmware/.venv/bin/python -m pip install 'platformio==6.2.0'
firmware/.venv/bin/pio run -d firmware
```
