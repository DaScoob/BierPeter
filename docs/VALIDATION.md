# Validierung Alpha 0.1

## Ausgeführt

- Python 3.12: zehn HTTP/API-Integrationstests bestanden.
- Geprüft: Anmeldung/Abmeldung, Passwortminimum, Schutz vor fremden Browser-Schreibanfragen, Host-Berechtigungen, mehrere Races und SQLite-Erhalt, konkurrierende Positionsbelegung, Doppelbelegung, Teilnehmerentfernung, abgelaufene Anfragen, Teilnehmer-Sichtbarkeit und Eingabevalidierung.
- Fünf JavaScript-Renderprüfungen in einer DOM-Testattrappe bestanden (Start, Session, Staffel-Aufstellung, Einladung, Datenschutz).
- `node --check web/app.js` bestanden.
- `bash -n github-upload.sh` bestanden.

## Nicht ausgeführt

- Grafische Browserprüfung auf Mobilgerät/Desktop.
- Docker-Build oder Containerstart: Docker ist in der Entwicklungsumgebung nicht verfügbar.
- Ausführung des Upload-Skripts: GitHub CLI ist in der Entwicklungsumgebung nicht verfügbar; Repository-Anlage und Push erfolgen durch den Betreiber.
- Hardware-/Firmware-Tests; die Alpha enthält keine Firmware.

## Erster lokaler Abnahmedurchlauf

1. Alpha starten und Health-Endpunkt prüfen.
2. Hostkonto erstellen, Session und Einladung anlegen.
3. Zweites Konto im privaten Browserfenster erstellen und Beitritt anfragen.
4. Anfrage als Host bestätigen.
5. Gerätekennung aufnehmen, zwei Races anlegen und Positionen vergeben.
6. Container neu starten, Erhalt der Session und Aufstellung prüfen.

Nicht jedes bereitgestellte Gerät muss im jeweiligen Race benutzt werden. Automatische Bereitschaftsprüfung und Hardwareausführung folgen später.
