# Alpha 0.2.2: gemeinsame Befunde und Umsetzung

## Bedienung

- Session-Einladung enthält denselben Link als Text und standardkonformen QR-Code. Keine externen QR-Dienste, CDNs oder Kamera-Uploads.
- Alte Session-Codes werden bei der Migration nicht ersetzt. Einladung, Anmeldung/Registrierung, Wartelobby und Host-Freigabe werden zusammen geprüft. Eine nicht mehr vorhandene Session erhält eine verständliche Fehlermeldung. Eine vom Smartphone unerreichbare Adresse bleibt ein Netzwerkproblem; die Basisadresse ist in der Lobby korrigierbar.
- Hosts können Sessions mit Rundenentwürfen und Aufstellungen löschen. Konten, persönliche Merkliste und privater Speicher bleiben erhalten. Eine tatsächlich als laufend markierte Runde verhindert die Löschung, bis sie beendet/abgebrochen wurde. Kein automatischer Spielabbruch und kein Race-Timeout.
- Eigene Geräte können nach dem Entsperren des privaten Bereichs umbenannt werden. Die Oberfläche zeigt den nötigen Einstieg direkt am Gerät.
- Geräte können aus der Session entfernt und umsortiert werden. Für die aktuelle Staffel ergibt sich das Startgerät aus dem ersten tatsächlich aufgestellten Gerät in dieser Reihenfolge.
- Live-Geräte-QR-Scan und QR-Fotoauswahl im Konto und in der Lobby. Der Inhalt wird ausschließlich als Gerätekennung ausgewertet; die Anwendung navigiert nicht zu einer eingescannten fremden Adresse. Live-Kamera benötigt HTTPS oder localhost und eine Browserberechtigung. Eine Bilddatei kann auch bei lokalem HTTP helfen.

## Namensfreigabe

Der verschlüsselte private Speicher erhält eine zufällige ECDH-Identität auf P-256. Der private Schlüssel liegt innerhalb des bisherigen AES-256-GCM-Umschlags. Im Browser werden verwendete CryptoKeys nicht exportierbar importiert. Ein öffentlicher Schlüssel wird mit dem Konto verknüpft; Änderungen werden serverseitig nicht stillschweigend ersetzt.

Für jeden zugelassenen Empfänger werden die Namen der vom Absender bereitgestellten Geräte separat verschlüsselt: ECDH, HKDF-SHA-256 mit getrenntem Kontext, AES-256-GCM mit zufälligem 96-Bit-IV und 128-Bit-Tag. Session, Absender und Empfänger sind kryptografisch gebunden. Der Server erhält nur Umschläge sowie Zuordnungs-/Versionsmetadaten. Falsch zugeordnete Gerätenamen werden beim Empfänger ignoriert. Eine alte Browserrevision darf keine neuen Namen publizieren.

Beide Teilnehmer müssen ihren privaten Bereich eingerichtet und entsperrt haben. Der mitbringende Nutzer muss seine Lobby nach Aufnahme eines neuen Empfängers noch einmal öffnen oder geöffnet lassen. Danach wird automatisch freigegeben. Offline liegende Geräteidentitäten werden nicht durch erfundene Namen ersetzt. Fehlt die Freigabe oder ein Schlüssel, bleibt die Gerätekennung sichtbar.

Bereits gesehene öffentliche Schlüssel werden zusätzlich im verschlüsselten privaten Speicher gemerkt. Ein späterer Austausch hält die Namensfreigabe an. Beim ersten Kontakt gilt zunächst Vertrauen in die vom Server gelieferte Zuordnung. Die Oberfläche zeigt SHA-256-Schlüsselabdrücke für einen unabhängigen Vergleich. Ohne diesen Vergleich besteht keine vom Server unabhängige Erstidentifikation. Ein kompromittierter Webserver kann außerdem veränderten JavaScript-Code ausliefern. Diese Alpha garantiert daher nicht, dass ein aktiv bösartiger Betreiber niemals Daten mitlesen könnte.

Benutzernamen, übrige Lobby-Inhalte und Metadaten bleiben im bisherigen Servermodell. Die zwei getrennten Sicherheitsdienste bleiben ein optionaler Prototyp. Vollständige Lobby-E2EE, Web-Client-Vertrauensmodell und Netzwerktransport der Geräte sind hiermit nicht als abgeschlossen erklärt.

## Tatsächliche Gerätefunde

Die Lobby zeigt frische, vom eigenen gemerkten oder selbst bereitgestellten BierPeter gemeldete Nachbarn. Bereits vorhandene Heartbeats mit `peer_active=true` und einer Peer-MAC werden als tatsächlicher ESP-NOW-Fund verarbeitet, auch wenn das beobachtende gemerkte Gerät noch nicht zur Session hinzugefügt wurde.

Zusätzlich akzeptiert `/api/v1/heartbeat` optional maximal 32 `neighbors`:

```json
{
  "device_id": "84F3EB52F7F9",
  "firmware": "discovery-capable-version",
  "wifi_rssi": -55,
  "wifi_channel": 6,
  "uptime_ms": 1000,
  "peer_mac": "",
  "peer_active": false,
  "neighbors": [
    {"device_id": "AABBCCDDEEFF", "transport": "esp-now", "channel": 6, "rssi": -60}
  ]
}
```

`transport` ist `esp-now` oder `wifi`. `rssi` darf null sein. Es ist weiterhin der vorhandene Geräteschlüssel erforderlich. Meldungen werden anhand tatsächlicher Empfangszeit begrenzt und nach 15 Sekunden nicht mehr als aktuell angeboten. Das ist eine Geräteanzeige, kein Spielzeitlimit. Eine übermittelte Kennung beweist weder Eigentum noch manipulationssichere Hardwareidentität.

Die vorhandene Testfirmware liefert noch keine vollständige Nachbarliste und erhält durch dieses Web-App-Update keine neue Suchfunktion. Sie kann bereits aktive Peers sichtbar machen. Umfassende Broadcast-Erkennung, Channel-Hopping und dynamische Kanalwahl benötigen die spätere Firmware. Für weitere Geräte steht jetzt der QR-Scan zur Verfügung. Es werden nicht pauschal alle am Server angemeldeten Geräte als lokale Nachbarn angezeigt.

## Zusammengeführte Fehlerkorrekturen

- Ein Race-Formular behält seine feste Race-ID. Polling überträgt Entwürfe nicht auf ein anderes aktives Race. Positionsauswahl trägt ebenfalls ihre Race-ID.
- Entfernen persönlicher Geräte und Aktualisieren ihres verschlüsselten Speichers erfolgen in einer gemeinsamen Transaktion. Bei Versionskonflikt bleibt beides unverändert.
- Gemeinsame Lobby-Antworten stammen aus einem konsistenten SQLite-Snapshot. Paralleles Löschen mischt keine alte aktive Race-ID mit einer neuen Rundenliste.
- SQLite-WAL und gezielte Indizes ermöglichen parallele Lesezugriffe. Der App-Server erhält eine größere Verbindungswarteschlange. Schreibtransaktionen werden im Prozess geordnet, statt viele gleichzeitige SQLite-Schreibversuche gegeneinander laufen zu lassen. Langsame Passwortberechnung hält keine globale Schreibtransaktion mehr offen.
- Erfolgreiche Anmeldungen verbrauchen kein Budget für Fehlversuche. Fehlversuche werden je Konto sowie mit höherer IP-Grenze begrenzt; Registrierung besitzt eine eigene Grenze.
- Loopback-Varianten, unspezifische und Multicast-Adressen werden als geteilte Einladungsbasis abgelehnt. Konfigurationsskript und API verwenden dieselbe Prüfung.

## Lizenz und Auslieferung

Eigener Code: AGPL-3.0-only. QR-Generator und Scanner: MIT. Im Scanner enthaltener Decoder: Apache-2.0. Originalhinweise, Prüfsummen und Quellcodeangebot werden mitgeliefert. Kommerzielle Nutzung bleibt gemäß der Open-Source-Entscheidung erlaubt.

Das Update verwendet Port 6017, erhält das bestehende Datenvolume und legt vor der Migration einen lokalen SQLite-Snapshot an. Ein privater Wiederherstellungsschlüssel wird nicht ersetzt und nicht übertragen. Die bestehenden geheimen Firmwaredateien werden nicht verändert und keine Geräte automatisch geflasht.
