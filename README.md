# BierPeter · Alpha 0.3.0

Lokale Web-App mit gemeinsamer Session-Lobby, kontexterhaltenden Geräte-/Einladungslinks und einer Anbindung an das vorhandene ESP-Testfirmware-Protokoll.

## Neu in 0.3.0

Kontolöschung mit Warnhinweis und Bestätigung ohne Passwortabfrage; eigene Sessions werden mitgelöscht. Bekannte Spieler, Freundschaftsanfragen, widerrufbare Freundschaften, Blockierungen und direkte Freundeseinladungen mit Host-Erlaubnis und anschließender Host-Freigabe. Wiederherstellungsschlüssel anzeigen/verbergen/kopieren; Dateiimport wartet auf ausdrückliches Entsperren. Details und Grenzen: [docs/ALPHA_030.md](docs/ALPHA_030.md).

## Weiterhin enthalten aus 0.2.2

Session-QR, Geräte-Scan per Kamera oder Bild, Session-Löschung, verschlüsselte Namensfreigabe an zugelassene Mitspieler, tatsächliche Peer-Funde und Korrekturen der beobachteten Mehrfenster-/Lastfehler. Details und Grenzen: [docs/ALPHA_022.md](docs/ALPHA_022.md). Lizenz: **AGPL-3.0-only**, Fremdkomponenten unter MIT beziehungsweise Apache-2.0, siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Weiterhin enthalten aus 0.2.1

- Gemeinsames aktives Race für die gesamte Lobby, auch nach Neuladen.
- Geräte aus Sessions entfernen und Reihenfolge/Startgerät festlegen.
- Race-Entwürfe bearbeiten oder löschen; Moduswechsel setzt nur die betreffende Aufstellung zurück.
- Serverseitig begrenzte Spieleranzahl für Eins-gegen-eins und Training.
- Anzeige Online/Offline, Serververbindung und ESP-NOW-Pairingzustand getrennt.
- Kontobereich: eigene Gerätemerkliste, private Namen und editierbares Statistik-Dashboard.
- Private Gerätenamen und Dashboard-Einstellungen im Browser mit AES-256-GCM verschlüsselt; Wiederherstellungsschlüssel bleibt beim Nutzer.
- Erneute Beitrittsanfrage aus der wartenden/entfernten Lobby ohne Suche nach dem alten Einladungslink.
- LAN-Einladungsadresse über die Lobby oder die lokale `.env` konfigurierbar.

**Sicherheitsgrenze:** Der private Speicher ist ein Prototyp. Benutzernamen und gemeinsame Lobby-Daten verwenden weiterhin das bisherige Klartextmodell. Gerätenamen können jetzt für zugelassene Empfänger verschlüsselt geteilt werden. Beide privaten Bereiche müssen eingerichtet und entsperrt sein; Erstidentitäten benötigen einen unabhängigen Schlüsselvergleich. Getrennte Account-/Race-Dienste sind unter `security/` ausführbar, aber noch nicht an die laufende Lobby angeschlossen. Die Alpha ist nicht als vollständig Ende-zu-Ende-verschlüsseltes Produkt freigegeben.

## Private Daten und Dashboard

Unter Konto zuerst den privaten Bereich einrichten: Schlüssel erzeugen, Schlüsseldatei herunterladen und privat aufbewahren, dann den Bereich anlegen. Nach Neuladen oder auf einem anderen Gerät wird diese Schlüsseldatei zum Entsperren benötigt. Der Dateiimport befüllt zunächst das lokale Schlüsselfeld; Anzeigen, Kopieren und anschließendes ausdrückliches Entsperren sind getrennte Schritte. Ein Passwort-Reset kann den Inhalt nicht entschlüsseln. Es wird keine Kopie des Schlüssels auf dem Server gespeichert.

Eine persönliche Geräteverwaltung ist unabhängig von der Session. Entfernen aus der Session löscht keine Konto-Merkliste; Entfernen aus dem Konto verändert keine Session. Eine Merkliste beweist kein Eigentum. Gerätenamen werden nach Entsperren angezeigt und bei geöffneter Lobby für zugelassene Mitspieler verschlüsselt freigegeben. Auch Empfänger müssen ihren privaten Bereich eingerichtet und entsperrt haben. Bei noch fehlender Freigabe bleibt die Gerätekennung sichtbar.

Dashboard-Widgets: Überblick, Ergebnistabelle, Zeitverlauf und Spielmodi. Im Bearbeitungsmodus sind Sichtbarkeit und Reihenfolge änderbar; die Einstellungen werden verschlüsselt gespeichert. Ohne abgeschlossene, gewertete Races bleiben Statistiken leer. Es werden keine Ergebnisse erfunden. Ergebnisanbindung und Portabilität folgen später.

WebCrypto benötigt HTTPS oder localhost. Für HTTP-Zugriff über eine LAN-IP steht der private Speicher im Browser deshalb nicht zur Verfügung; die Lobby bleibt erreichbar. Die Schlüssel verbleiben nur im Arbeitsspeicher bis zum Sperren, Neuladen oder Abmelden.

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
node tests/ui-alpha021.cjs
node tests/ui-alpha022.cjs
node tests/ui-alpha030.cjs
node tests/qr-roundtrip.cjs
node tests/qr-lifecycle.cjs
python3 tests/stress-alpha022.py
node --check web/app.js
```

`tests/ui-flow.cjs` führt die echte Anwendungslogik gegen einen temporären HTTP-Server und eine isolierte Testdatenbank aus. Der DOM-Adapter prüft Benutzerwege, nicht grafisches Browserlayout.

## Umsetzung und Grenzen

Implementiert: Konten, Sessions, Host-Bestätigung, Einladungs-/Geräte-Kontext, automatische Lobby-Aktualisierung, Aufstellung, persistente Heartbeats, echte Gerätebefehle und Bestätigungen.

Nicht implementiert: neue Spielfirmware, Glasbereitschaft, Race-Start und Ergebniswertung, Trainings-Countdown, Turnierpläne, JSON-Portabilität, vollständige Account-Wiederherstellung. Kontolöschung ist seit 0.3.0 implementiert. Spielmodi sind als Vorbereitungsentwürfe wählbar. Es gibt keine simulierten Sensorereignisse oder Messzeiten.

Passwort-Hashes: scrypt mit Salt. Login-Tokens: gehasht, serverseitig maximal zwölf Stunden. HttpOnly-Cookie mit SameSite=Strict; bei HTTPS `BIERPETER_SECURE_COOKIE=1` verwenden. Keine externen Ressourcen oder Analyse. Der Standardbibliothek-Server ist eine lokale Entwicklungsfassung. Vor öffentlichem Dienstbetrieb sind Hosting-Härtung, Betreiberangaben, Datenschutz und vollständige Lösch-/Exportfunktionen zu vervollständigen.

## GitHub und POMPUI

Sicherheitsprototyp: `security/README.md` (isolierte Dienste, eigener Testlauf).

Quellstand: https://github.com/DaScoob/BierPeter

Updates werden als Git-Bundle übergeben und vom Betreiber gepusht. `github-upload.sh` dient ausschließlich einer Erstveröffentlichung aus einem Quellarchiv ohne Git-Metadaten; nicht für Updates verwenden.

Vorlagen in `infrastructure/` dienen der späteren POMPUI-Integration. Sie führen kein Deployment aus. Die Open-Source-Lizenz ist AGPL-3.0-only. Das korrespondierende Quellcodeangebot steht unter `/source.tar.gz` bereit.

## Lizenz

Copyright (C) 2026 BierPeter contributors. Eigener Code unter GNU Affero General Public License, Version 3 ausschließlich (SPDX: AGPL-3.0-only). Die Anwendung wird ohne Gewährleistung bereitgestellt; maßgeblich ist der vollständige Text in LICENSE. Abweichende Fremdlizenzen sind in THIRD_PARTY_NOTICES.md aufgeführt.
