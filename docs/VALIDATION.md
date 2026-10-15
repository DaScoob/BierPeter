# Validierung Alpha 0.2.1

32 API-, Migrations- und Konfigurationstests sowie fünf Tests des Sicherheitsprototyps bestanden. Die bisherigen und erweiterten JavaScript-/HTTP-Abläufe einschließlich echter WebCrypto-Operationen sind bestanden.

## Anwendung

- Vorhandene API-Regressionen: Anmeldung, Host-Rechte, gleichzeitige Positionsbelegung, Beitritt, Heartbeats und Gerätebefehle.
- Neue API-Prüfungen: gemeinsame aktive Race-Auswahl, Neustart-Erhalt, Geräteentfernung mit Positionsbereinigung, getrennte Konto-Merkliste, explizite Gerätefolge und Validierung, Moduslimits, Race-Änderung/-Löschung, eigene verschlüsselte Speicherbereiche, Versionskonflikte, erneuter Beitritt und LAN-URL-Prüfung.
- Migration wurde zusätzlich gegen eine Datenbank mit den alten Tabellenformen aus 0.2 geprüft. Geräte, Session-Titel und Race bleiben erhalten; neue Felder werden additiv ergänzt.
- `tests/ui-flow.cjs`: bisherige Einstiegspfade gegen echten HTTP-Testserver.
- `tests/ui-alpha021.cjs`: neue Bedienwege gegen echten HTTP-Testserver und echte WebCrypto-Operationen. Gemeinsames Race, Reihenfolge, Korrektur, Löschung, LAN-Link, Geräteverwaltung, Name verschlüsseln, Dashboard ändern, Wiederherstellung, falscher Schlüssel, manipuliertes Chiffrat, Abmelden/Sperren und Abbruch der Geräteübernahme.
- DOM-Adapter prüft Abläufe, keine grafische Darstellung. Keine Browser-Installation oder grafische Browserprüfung in der Entwicklungsumgebung.

## Sicherheitsprototyp

Fünf separate Tests: tatsächliche Account-/Race-HTTP-Dienste, getrennte Speicher/Schlüssel, verschlüsselte Speicherung, Manipulations- und Falschschlüsselerkennung, JWT-Algorithmus/Audience/Ablaufprüfung, Benutzerdatentrennung und Neustart.

Die Tests sind keine unabhängige Sicherheitsprüfung. Gruppenverschlüsselung, Teilnehmer-Schlüsselidentität, Schlüsselrotation und Migration der bisherigen Lobby-Daten sind nicht abgeschlossen. Ein anderer Anmeldeschlüssel als der private Wiederherstellungsschlüssel wird verwendet; die privaten Namen/Einstellungen werden nicht serverseitig entschlüsselt. Beim Browser-Neuladen ist erneut zu entsperren.

## Lokal noch zu prüfen

- Docker-Build/-Start und Health-Warten im realen Betrieb.
- Darstellung und Tastatur-/Touchbedienung im tatsächlichen Browser.
- Datei-Download des Wiederherstellungsschlüssels sowie Entsperren mit dieser Datei.
- LAN-Erreichbarkeit der vorgeschlagenen Einladungsadresse vom Smartphone.
- Hardware-/Firmwareverhalten mit den vorhandenen ESPs; keine neue Spielfirmware in diesem Update.

## Speicher und Aktualisierung

Der bestehende Dienst auf 6017 und sein Datenvolume bleiben erhalten. Ein lokaler SQLite-Snapshot wird vor der Aktualisierung im selben Datenvolume angelegt. Das Update setzt keine bestehenden Benutzerdaten zurück. Die getrennten Sicherheitsdienste sind optional und werden nicht automatisch gestartet.
