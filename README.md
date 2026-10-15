# BierPeter · Alpha 0.2

Lokale Web-App mit gemeinsamer Session-Lobby, kontexterhaltenden Geräte-/Einladungslinks und einer Anbindung an das vorhandene ESP-Testfirmware-Protokoll.

## Einstieg und Lobby

- `http://127.0.0.1:6017/?84F3EB52F7F9` oder `/?device=84F3EB52F7F9`: Gerätekennung bleibt bei Anmeldung und Registrierung erhalten. Danach eine vorhandene Session wählen oder eine neue Lobby direkt mit diesem Gerät eröffnen.
- `/?device=84F3EB52F7F9&session=SESSION_ID`: Gerät unmittelbar in die betreffende Session übernehmen, sofern die Teilnahme bestätigt ist.
- `/?join=EINLADUNGSCODE`: Anmeldung/Registrierung führt direkt in die wartende Lobby. Nach Host-Freigabe öffnet sich automatisch die vollständige Lobby. Bereits bestätigte Teilnehmer gelangen sofort hinein.
- Die URL erhält den Kontext auch beim Neuladen. Kein localStorage erforderlich.
- Die Lobby führt durch Gruppe → Race → Geräte/Aufstellung → Bereitschaft. Teilnehmer, Anfragen, Geräte und Positionen stehen gemeinsam auf einer Seite.
- Eine Session enthält mehrere Races. SQLite erhält Konten, Teilnehmer und Aufstellungen über Updates und Neustarts hinweg.

## Lokal starten

```bash
cd ~/BierPeter
docker compose up -d --build
curl --fail http://127.0.0.1:6017/api/health
```

Browser: http://127.0.0.1:6017

Für Smartphones und ESPs die LAN-IP des Rechners statt `127.0.0.1` verwenden. Die Compose-Konfiguration veröffentlicht den Testdienst auf Port 6017 an den Host-Netzwerkschnittstellen. Der bisherige Race-Test-Container muss diesen Port freigegeben haben. `BIERPETER_BIND=127.0.0.1` in `.env` beschränkt den Dienst optional auf den Rechner; ESP-Zugriff über LAN ist damit nicht möglich.

Das vorhandene benannte Volume wird weiterverwendet. Kein `docker compose down -v` für Updates verwenden.

## Vorhandene ESP-Testfirmware verbinden

Der Server unterstützt das bestehende Protokoll mit `X-Device-Key`:

- `GET /api/v1/health`
- `POST /api/v1/heartbeat`
- `POST /api/v1/events`
- `GET /api/v1/commands?device_id=...`
- `POST /api/v1/commands/ack`

Der bereits in der Firmware konfigurierte `DEVICE_API_KEY` muss lokal übernommen werden. Er wird weder neu erzeugt noch veröffentlicht:

```bash
cd ~/BierPeter
python3 configure-device-key.py
docker compose up -d --force-recreate
```

Das Hilfsskript sucht in naheliegenden Projektordnern nach `secrets.h` und Race-/BierPeter-`.env`-Dateien. Bei mehreren unterschiedlichen Schlüsseln wird keiner ausgewählt. Alternativ den vollständigen Pfad der passenden Datei als Argument übergeben. Die Ausgabe enthält niemals den Schlüsselwert. `.env` wird mit Dateirechten 0600 gespeichert und ist Git-ignoriert. Ein vorhandener Schlüssel in der BierPeter-`.env` hat Vorrang.

Die Serveradresse in der Firmware muss auf die LAN-IP dieses Rechners und Port 6017 zeigen. Bei unveränderter Adresse und demselben Schlüssel ist dafür kein neues Flashen erforderlich. Ob die Geräte noch auf diese Adresse eingestellt sind, ist lokal zu prüfen.

Eine Gerätekennung oder ein QR-Link allein erzeugt keinen Online-Status. Erst ein authentifizierter Heartbeat setzt das Gerät für 15 Sekunden auf online. Das ist ausschließlich die Verbindungsanzeige, keine Spielzeitgrenze und keine Aussage zur Glasbereitschaft.

Bei genau zwei Geräten in der Lobby kann der Host echte ESP-NOW-Pairing-Befehle anfordern. Die vorhandene Firmware ruft die Befehle ab und bestätigt deren Anwendung. Eine aktive Funkverbindung wird zusätzlich nur anhand der `peer_active`-Gerätemeldung angezeigt. Die bisherige Testfirmware benötigt dabei passende WLAN-Kanäle. Channel-Hopping/dynamische Kanalwahl bleiben Anforderungen für die spätere Firmware; es wird kein zweites Funkmodul vorausgesetzt.

## Testen

Python 3.12 und Node.js genügen, keine zusätzlichen Pakete:

```bash
cd ~/BierPeter
python3 -m unittest discover -s tests -v
node tests/ui-flow.cjs
node --check web/app.js
```

`tests/ui-flow.cjs` führt die echte Anwendungslogik gegen einen temporären HTTP-Server und eine isolierte Testdatenbank aus. Der DOM-Adapter prüft Benutzerwege, nicht grafisches Browserlayout.

## Umsetzung und Grenzen

Implementiert: Konten, Sessions, Host-Bestätigung, Einladungs-/Geräte-Kontext, automatische Lobby-Aktualisierung, Aufstellung, persistente Heartbeats, echte Gerätebefehle und Bestätigungen.

Nicht implementiert: neue Spielfirmware, Glasbereitschaft, Race-Start und Ergebniswertung, Trainings-Countdown, Turnierpläne, JSON-Portabilität, Kontowiederherstellung und Kontolöschung. Spielmodi sind als Vorbereitungsentwürfe wählbar. Es gibt keine simulierten Sensorereignisse oder Messzeiten.

Passwort-Hashes: scrypt mit Salt. Login-Tokens: gehasht, serverseitig maximal zwölf Stunden. HttpOnly-Cookie mit SameSite=Strict; bei HTTPS `BIERPETER_SECURE_COOKIE=1` verwenden. Keine externen Ressourcen oder Analyse. Der Standardbibliothek-Server ist eine lokale Entwicklungsfassung. Vor öffentlichem Dienstbetrieb sind Hosting-Härtung, Betreiberangaben, Datenschutz, Lösch-/Exportfunktionen und Lizenz zu vervollständigen.

## GitHub und POMPUI

Quellstand: https://github.com/DaScoob/BierPeter

Updates werden als Git-Bundle übergeben und vom Betreiber gepusht. `github-upload.sh` dient ausschließlich einer Erstveröffentlichung aus einem Quellarchiv ohne Git-Metadaten; nicht für Updates verwenden.

Vorlagen in `infrastructure/` dienen der späteren POMPUI-Integration. Sie führen kein Deployment aus. Die konkrete Open-Source-Lizenz bleibt festzulegen.
