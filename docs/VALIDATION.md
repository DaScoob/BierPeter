# Validierung Alpha 0.2

19 Python-API-/Integrationstests und acht JavaScript-/HTTP-Ablaufprüfungen bestanden. JavaScript-Syntax und Git-Diff-Prüfung bestanden.

## Regression und Integration

- Anmeldung/Abmeldung, Passwortminimum und Browser-Schreibschutz.
- Host-Rechte, freie Positionen, konkurrierende und doppelte Positionsbelegung.
- Persistenz mehrerer Races; Teilnehmerentfernung und Anfrageablauf.
- Wartende Lobby: nur Titel/Host/eigener Status, keine fremden Teilnehmer- oder Geräteinformationen.
- Aufruf einer Einladung verlängert eine noch laufende Beitrittsanfrage nicht.
- MAC-Normalisierung und idempotente Gerätebereitstellung; Geräteaufnahme unmittelbar bei Session-Erstellung.
- Authentifizierung der Firmware-Endpunkte; kein Online-Status ohne Heartbeat, Offline-Anzeige nach 15 Sekunden.
- Pairing nur bei aktuellen Heartbeats und kompatiblem Kanal der bestehenden Testfirmware.
- Echte Befehlswarteschlange, zielgebundene Bestätigung und gesonderter Peer-Status aus dem Heartbeat.
- Validierung von Heartbeats und Ereignissen.

## JavaScript gegen echten HTTP-Server

`node tests/ui-flow.cjs` prüft:

1. Registrierung aus einer Einladung führt direkt in die wartende Lobby.
2. Host-Freigabe öffnet automatisch dieselbe vollständige Lobby.
3. Bestehender Benutzer gelangt nach Login aus einer Einladung direkt hinein.
4. Roher Geräte-Link `?84F3EB52F7F9` bleibt durch Registrierung erhalten.
5. Neue Session enthält unmittelbar das gescannte Gerät.
6. Neuladen erhält den Lobby-Kontext.
7. Bestätigter Teilnehmer kann Gerät über Link in die Session bereitstellen.
8. Ungültige Einladung erzeugt eine verständliche Fehleransicht; Anmeldung und Link bleiben erhalten.

DOM-Adapter mit echter HTTP-Kommunikation, keine grafische Browserprüfung.

## Nicht lokal verifiziert

Docker und grafischer Browser stehen in dieser Entwicklungsumgebung nicht zur Verfügung. Keine Hardwareverbindung aus dieser Umgebung möglich. Das bestehende Geräteprotokoll wurde mit den Repository-Quellen der Race-Testfirmware abgeglichen und serverseitig getestet. Empfang echter Heartbeats sowie reales ESP-NOW-Pairing sind erst nach lokaler Schlüssel-/Adressprüfung nachweisbar.

## Lokale Abnahme

- Bekannte Konten und Session nach Update prüfen (Volume bleibt erhalten).
- Einladungslink in anderem Browser öffnen, registrieren und wartende Lobby prüfen.
- Als Host annehmen; automatischen Wechsel in die vollständige Lobby prüfen.
- Geräte-Link öffnen und Kennung nach Login/Registrierung in neue oder bestehende Session übernehmen.
- Geräteschlüssel lokal aus vorhandener Firmware übernehmen.
- Echte ESP-Heartbeats in der Lobby beobachten; bei kompatiblem Kanal Pairing anfordern und Peer-Meldungen prüfen.
