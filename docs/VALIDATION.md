# Validierung Alpha 0.2.2

42 API-, Migrations- und Konfigurationstests sowie fünf Tests des getrennten Sicherheitsprototyps bestanden. Zusätzlich bestehen drei JavaScript-/HTTP-Ablaufsuiten, ein tatsächlicher QR-Decodiertest und eine Kameralebenszyklus-Simulation.

## Neue Befunde und Nachweise

- Host kann eine Session löschen; fremde Teilnehmer dürfen es nicht. Runden, Mitglieder, Gerätebereitstellungen und Namensfreigaben werden bereinigt, Konten und persönliche Merkliste bleiben bestehen.
- Eine Datenbank mit zurückgesetzten alten Session-/Gerätespalten wird migriert. Ein bereits bestehender Einladungscode führt danach über Anfrage und Freigabe wieder in dieselbe Lobby. Codes werden nicht rotiert.
- Ein Race-A-Entwurf wird beim Wechsel zu Race B im zweiten Hostfenster nicht in dessen Formular übernommen. Ein ausdrücklich mit Race-A-ID abgesendetes Formular ändert weiterhin nur A.
- Zwei echte Konten tauschen mit WebCrypto verschlüsselte Namen über den HTTP-Testserver aus. Der Empfänger sieht den Namen, die API nur Chiffrate; Wiederverwendung in anderem Session-Kontext scheitert.
- Schlüsselidentitäten werden im privaten Bereich mitgespeichert und öffentliche Abdrücke angezeigt. Das ersetzt keinen unabhängigen Erstvergleich oder ein externes Sicherheitsaudit.
- Bei veralteter privater Revision schlägt persönliche Gerätelöschung vollständig fehl. Merkliste und verschlüsselter Namensspeicher bleiben zusammen erhalten.
- Eine parallele Race-Löschung während eines unterbrochenen Lobby-GET erzeugt eine konsistente Antwort aus demselben Lesesnapshot.
- Aktive tatsächliche Peers sowie explizite Nachbarmeldungen werden nur dem Nutzer des beobachtenden Geräts angeboten. Veraltete Meldungen verschwinden, unzulässige Meldungen werden abgewiesen.
- QR-Generator erzeugt echte Pixel für Einladung und zwei Gerätelink-Formen. Der tatsächlich ausgelieferte Decoder-Worker liest diese vollständig zurück.
- Kamerasimulation prüft Abbrechen, erfolgreichen Scan, abgelehnte Berechtigung und Ablehnung unsicheren HTTP-Kontexts. Keine reale Kameraaufnahme wurde vorgenommen.
- Quellcodeangebot als Archiv über HTTP geprüft: Programm und Lizenzen enthalten; keine Datenbanken, .env oder Geheimnisse aufgenommen.

## Lastprüfung

Aufruf: `python3 tests/stress-alpha022.py`. Rohdaten: `docs/STRESS_022.json`.

| Messung | Ergebnis des protokollierten Laufs |
| --- | --- |
| Gemischte Requests, 12 gleichzeitige Arbeiter | 240 von 240 mit HTTP 200 |
| Gesamtdauer | 3,86 s |
| Median / 95. Perzentil / Maximum | 116,5 / 580,6 / 995,8 ms |
| Gleichzeitige Positionsansprüche | 48; 24 erfolgreiche Wiederholungen desselben Gewinners, 24 Konflikte |
| Abschließende Belegung | Genau ein Teilnehmer; keine verwaisten Positionen |
| Korrekte Anmeldungen hinter derselben IP | 22 von 22 erfolgreich |
| Parallel gelöschtes Race | Aktive Race-ID und zurückgegebene Rundenliste konsistent |

Die Werte schwanken mit der Entwicklungsumgebung. Sie sind keine Zusage für ESP-Kommunikationslatenz oder den Zielserver. In früheren Läufen traten weiterhin einzelne längere Spitzen auf; die Warteschlangen- und Schreibzugriffsänderungen begrenzen sie im protokollierten Lauf auf ungefähr eine Sekunde. Weitere Messungen auf dem tatsächlichen Host bleiben erforderlich. Gerätezeitmessung wird daraus nicht abgeleitet.

## Anwendung

- Vorhandene API-Regressionen: Anmeldung, Host-Rechte, gleichzeitige Positionsbelegung, Beitritt, Heartbeats und Gerätebefehle.
- Neue API-Prüfungen: gemeinsame aktive Race-Auswahl, Neustart-Erhalt, Geräteentfernung mit Positionsbereinigung, getrennte Konto-Merkliste, explizite Gerätefolge und Validierung, Moduslimits, Race-Änderung/-Löschung, eigene verschlüsselte Speicherbereiche, Versionskonflikte, erneuter Beitritt und LAN-URL-Prüfung.
- Migration wurde zusätzlich gegen eine Datenbank mit den alten Tabellenformen aus 0.2 geprüft. Geräte, Session-Titel und Race bleiben erhalten; neue Felder werden additiv ergänzt.
- `tests/ui-flow.cjs`: bisherige Einstiegspfade gegen echten HTTP-Testserver.
- `tests/ui-alpha021.cjs`: neue Bedienwege gegen echten HTTP-Testserver und echte WebCrypto-Operationen. Gemeinsames Race, Reihenfolge, Korrektur, Löschung, LAN-Link, Geräteverwaltung, Name verschlüsseln, Dashboard ändern, Wiederherstellung, falscher Schlüssel, manipuliertes Chiffrat, Abmelden/Sperren und Abbruch der Geräteübernahme.
- DOM-Adapter prüft Abläufe, keine grafische Darstellung. Keine Browser-Installation oder grafische Browserprüfung in der Entwicklungsumgebung.

## Sicherheitsprototyp

Fünf separate Tests: tatsächliche Account-/Race-HTTP-Dienste, getrennte Speicher/Schlüssel, verschlüsselte Speicherung, Manipulations- und Falschschlüsselerkennung, JWT-Algorithmus/Audience/Ablaufprüfung, Benutzerdatentrennung und Neustart.

Die Tests sind keine unabhängige Sicherheitsprüfung. Die neue Namensfreigabe ist empfängerbezogen verschlüsselt. Vollständige Lobby-Verschlüsselung, vom Server unabhängige Erstidentifikation, Schlüsselwechsel und Migration der übrigen Lobby-Daten sind nicht abgeschlossen. Ein anderer Anmeldeschlüssel als der private Wiederherstellungsschlüssel wird verwendet; private Namen/Einstellungen werden nicht serverseitig entschlüsselt. Beim Browser-Neuladen ist erneut zu entsperren. Ausgeliefertes Browser-JavaScript ist weiterhin Teil des Vertrauensmodells.

## Lokal noch zu prüfen

- Docker-Build/-Start und Health-Warten im realen Betrieb.
- Darstellung und Tastatur-/Touchbedienung im tatsächlichen Browser.
- Datei-Download des Wiederherstellungsschlüssels sowie Entsperren mit dieser Datei.
- LAN-Erreichbarkeit der vorgeschlagenen Einladungsadresse vom Smartphone.
- Hardware-/Firmwareverhalten mit den vorhandenen ESPs; keine neue Spielfirmware in diesem Update.

## Speicher und Aktualisierung

Der bestehende Dienst auf 6017 und sein Datenvolume bleiben erhalten. Ein lokaler SQLite-Snapshot wird vor der Aktualisierung im selben Datenvolume angelegt. Das Update setzt keine bestehenden Benutzerdaten zurück. Die getrennten Sicherheitsdienste sind optional und werden nicht automatisch gestartet.
