# BierPeter · Alpha 0.1

Eigenständige lokale Web-App zur Vorbereitung von Sessions und Races. Grundlage ist das freigegebene mobile Konzept vom 14.10.2026. Race Test bleibt eine separate Testumgebung.

## Enthalten

- Registrierung und Anmeldung (Benutzername, Passwort ab 12 Zeichen)
- Session-Erstellung, Einladungslink und Beitrittsanfrage
- Host-Freigabe, Ablehnung und Entfernung; Anfragen laufen nach 15 Minuten ab
- Manuelle Aufnahme von Gerätekennungen, ausdrücklich ohne behauptete Verbindung
- Mehrere Races pro Session, Spielmodusauswahl und Aufstellung links/rechts
- Host-Zuweisung oder freie Positionswahl mit serverseitigem Schutz vor Doppelbelegung
- Dauerhafte SQLite-Speicherung, ohne externe Python-Pakete oder Browser-Dienste
- KI-Hinweis sowie vorläufige Datenschutz- und Impressumsansichten

## Lokal mit Docker starten

Im Projektverzeichnis:

```bash
docker compose up -d --build
curl --fail http://127.0.0.1:6018/api/health
```

Browser: http://127.0.0.1:6018

Port 6018 ist absichtlich vom bestehenden Race-Test-Port 6017 getrennt. Die Alpha hört standardmäßig nur auf localhost. Das benannte Volume erhält Konten und Sessions über Container-Neustarts hinweg. `docker compose down -v` würde die Daten löschen und ist kein normaler Aktualisierungsschritt.

## Ohne Docker

Python 3.12 oder neuer genügt:

```bash
python3 server.py
```

Browser: http://127.0.0.1:8080

## Prüfen

```bash
python3 -m unittest discover -s tests -v
node --check web/app.js
node tests/ui-smoke.cjs
```

Zweiter Browser oder privates Fenster: zweites Konto erstellen, Einladung öffnen, Anfrage als Host bestätigen und freie Position wählen. Ein zweites Race darf Teilnehmer und Geräte der Session nicht löschen.

## GitHub

Vom entpackten Quellverzeichnis aus:

```bash
bash github-upload.sh
```

Voraussetzungen: `git`, `gh`, vorhandene GitHub-Anmeldung und konfigurierte Git-Identität. Das Skript erstellt einen lokalen Commit und anschließend das öffentliche Repository `BierPeter` unter dem bei `gh` angemeldeten Konto. Vorhandene Repositories werden nicht überschrieben. Zugangsdaten, SQLite und Laufzeitdateien bleiben ausgeschlossen.

## Grenzen dieser Alpha

Keine Firmware-Anbindung, Sensorereignisse, Hardware-Zeitmessung, automatischer Race-Start, Countdown, Ergebniswertung, Turnierplanung, Kontowiederherstellung oder JSON-Datenportabilität. Die Spielmodi sind als Vorbereitungsentwürfe wählbar. Geräteaufnahme ersetzt keinen Erreichbarkeitstest. Keine permanente Gerätebindung ist implementiert.

Lokaler Alpha-Server auf Basis der Python-Standardbibliothek; noch keine produktive Internetbereitstellung. Passwort-Hashes verwenden scrypt mit individuellem Salt. Login-Tokens werden gehasht serverseitig gespeichert und gelten zwölf Stunden. Die Anmeldung verwendet ein HttpOnly-Sitzungscookie mit SameSite=Strict. Für HTTPS muss `BIERPETER_SECURE_COOKIE=1` gesetzt sein. Kein Tracking, kein localStorage und keine externen Ressourcen. Anmeldung ist begrenzt; weitere Maßnahmen gegen Missbrauch, Wiederherstellung, Löschung und die endgültigen Rechtsinformationen sind vor öffentlichem Betrieb erforderlich.

Die Vorlagen unter `infrastructure/` unterstützen eine spätere POMPUI-Integration; sie wurden nicht auf einem POMPUI-Host ausgeführt. Keine Änderungen am global-proxy sind in diesem Paket automatisch vorgesehen.

## Lizenz

Die Open-Source-Lizenz ist noch nicht festgelegt. Vor der weiteren Verbreitung muss eine konkrete Lizenz ergänzt werden. Ein öffentliches Repository allein gewährt keine allgemeine Nutzungslizenz.
