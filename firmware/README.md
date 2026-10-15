# BierPeter Firmware Alpha 0.3

Gemeinsamer Quellcode für ESP8266 (NodeMCU v2, 4 MiB Flash), ESP32 DevKit und ESP32-S3 DevKitC-1. Andere Platinen benötigen einen passenden Board-Eintrag. Die erzeugten Binärdateien sind chipspezifisch.

## Einrichtung

1. Passende Firmware per USB übertragen. Das Skript installiert PlatformIO in einer eigenen virtuellen Python-Umgebung. Vorhandene Einstellungen bleiben bei einem normalen Anwendungs-Upload erhalten. Kein `erase_flash` und kein `uploadfs` verwenden.
2. Mit dem WLAN `BierPeter-XXXXXX` verbinden. Die Kennung entspricht den letzten sechs Zeichen der Geräte-MAC.
3. Captive Portal öffnen, gegebenenfalls direkt `http://192.168.4.1/` aufrufen.
4. WLAN-SSID, WLAN-Passwort, lokale Serveradresse und vorhandenen Geräteschlüssel eintragen. Beispiel einer Serveradresse: `http://192.168.42.20:6017`. Auf dem ESP bezeichnet `127.0.0.1` den ESP selbst und ist keine Serveradresse.
5. Nach Verbindung erscheinen echte Heartbeats und tatsächliche Nachbarmeldungen in der Web-App.

Vollständiges Beispiel für einen ESP8266 am Anschluss `/dev/ttyUSB0`:

```bash
cd ~/BierPeter
bash firmware/FLASH.sh esp8266 /dev/ttyUSB0
```

Für ESP32-S3 am Anschluss `/dev/ttyACM0`:

```bash
cd ~/BierPeter
bash firmware/FLASH.sh esp32-s3 /dev/ttyACM0
```

Das Portal ist nur über die SoftAP-Schnittstelle erreichbar. Maximal vier Smartphones; acht Geräte pro Session, bis zu 16 belegte Seiten beziehungsweise Ergebnisempfänger. Die Werte begrenzen Ressourcen und sind keine Zusage eines bereits physisch geprüften Funkverbunds dieser Größe.

## Demo über den Server

Zwei zugelassene Konten, private Bereiche entsperrt, ein vorbereiteter 1vs1- oder Staffel-Entwurf und eine gültige Aufstellung sind erforderlich. Ein BierPeter besitzt zwei Seiten. Beim Staffellauf ergibt die Session-Gerätereihenfolge die Reihenfolge jeder belegten Seite. Nicht belegte Seiten werden übersprungen.

In der Lobby stehen Echtzeit-Demo und beschleunigter Demo zur Verfügung. Die Web-App erzeugt ausschließlich Steuerbefehle. Zufallszeiten entstehen auf den beteiligten ESPs. Ergebnisse werden auf dem Host verschlüsselt und erst im Browser entschlüsselt. Demo-Ergebnisse verändern keine Bestzeiten.

Der zusätzliche administrative Endpunkt lautet `POST /api/admin/demo`. Er benötigt `X-Admin-Key`, konfiguriert über `BIERPETER_ADMIN_KEY`. Der Aufruf enthält `device_id`, optional `session` bei eindeutiger Zuordnung und optional `realtime` (Standard `true`). Der Administrationsschlüssel ist vom Geräteschlüssel getrennt. Keine Schlüssel im Repository ablegen.

Beispiel mit interaktiver Schlüsselabfrage, ohne Schlüssel in der Shell-Historie:

```bash
cd ~/BierPeter
python3 - <<'PY'
import getpass,json,urllib.request
host=input('Host-Gerätekennung: ').strip()
key=getpass.getpass('Administrationsschlüssel: ')
request=urllib.request.Request(
    'http://127.0.0.1:6017/api/admin/demo',
    data=json.dumps({'device_id':host,'realtime':True}).encode(),
    headers={'Content-Type':'application/json','X-Admin-Key':key},
)
with urllib.request.urlopen(request,timeout=10) as response:
    print(json.load(response))
PY
```

Ein Run wird auf den Geräten vorbereitet. Der Host wartet auf die Bereitschaft aller beteiligten Geräte, startet und koordiniert die zwei Seiten. Clients erzeugen eigene virtuelle Sensorereignisse. Der beschleunigte Modus verwendet eine logische Zeitbasis, ohne die Trinkzeiten abzuwarten. Funkzustellung und Verschlüsselung benötigen weiterhin reale Rechen- und Übertragungszeit.

## Lokaler Betrieb

Ohne Server werden Geräte über ESP-NOW entdeckt. Bevorzugter Suchkanal ist 11. Ein bestehender früher gestarteter Host hat Vorrang; nahezu gleichzeitige Starts verwenden die Gerätekennung als Tie-Breaker. Aufnahme in die Staffel erfolgt in Aufnahme-Reihenfolge. Der Host kann die Aufnahme sperren oder die Auswahl über seine lokale Oberfläche manuell festlegen. Diese Session-Zusammenstellung liegt ausschließlich im RAM.

Die Oberfläche zeigt Geräte, Reihenfolge, Bereitschaft, lokale Sensorzustände und aktuelle Ergebnisse. Solange keine reale Sensorquelle angeschlossen ist, bleibt eine reguläre Offline-Runde ohne Sensorereignisse in Vorbereitung. Es existiert absichtlich kein zusätzlicher Offline-Demo-Start. Die Software-Schnittstelle `SensorSource` und der gemeinsame Ereigniseingang sind für die spätere Sensoranbindung vorhanden.

Ein laufender Run besitzt kein Timeout. Funkpakete werden bestätigt, bei Verlust wiederholt und nach Run/Sequenz dedupliziert. Aufstellung, Kanalwechsel, WLAN-Neuverbindung und Flash-Schreibvorgänge werden während eines Runs zurückgestellt. SoftAP-Webanfragen werden asynchron bearbeitet; Status wird als Snapshot mit höchstens zwei Aktualisierungen pro Sekunde erstellt. Dauerhafter Strom- oder Geräteausfall kann eine Runde unvollständig machen; diese wird nicht gewertet.

## Daten und Verschlüsselung

Dauerhaft im LittleFS-Dateisystem: WLAN-Konfiguration, Serveradresse, Geräteschlüssel und der eigene Geräteschlüssel für X25519. Die Gerätekennung stammt aus der Stations-MAC. Session, Aufstellung, aktuelle Messungen und Offline-Ergebnisse sind flüchtig. Ausstehende verschlüsselte Ergebnisse serververwalteter Runs bleiben im RAM bis zur Bestätigung. Neue Runs sind während ausstehender Ergebnisübertragung gesperrt; Neustarts verwerfen den RAM.

Ergebnisse und serververmittelte Gerätepakete: X25519, HKDF-SHA-256 nach RFC 5869, AES-256-GCM mit 96-Bit-Zufallsnonce und 128-Bit-Tag. Run, Sender, Empfänger und bei Gerätepaketen Sequenz sind im authentifizierten Kontext gebunden. Der Server speichert keine privaten Entschlüsselungsschlüssel. Ergebnisempfänger-Schlüssel werden im Browser erzeugt und nur im bestehenden verschlüsselten privaten Tresor gesichert.

**Vertrauensgrenze:** Ersteinrichtung und öffentliche Schlüsselzuordnung müssen vertrauenswürdig erfolgen. Die Web-App merkt Geräteschlüssel im verschlüsselten Tresor und erkennt Änderungen. Der unabhängige Vergleich ist über die SoftAP-Oberfläche möglich. Ein Server, der bereits bei der Ersteinrichtung Schlüssel austauscht oder manipuliertes Browser-JavaScript ausliefert, liegt außerhalb dieser Zusage. Vollständiger Schutz vor einem aktiv bösartigen Auslieferungsserver wird nicht behauptet. Bestehende Konto-, Kontakt- und Verbindungsmetadaten sind weiterhin für den Server sichtbar.

Der Servertransport dieser lokalen Alpha verwendet asynchrones HTTP über TCP. ESP-NOW und SoftAP benötigen nach Vorgabe keine zusätzliche Inhaltsverschlüsselung. HTTPS-Adressen werden abgewiesen, niemals auf HTTP zurückgestuft. Serverzugang deshalb nur im vertrauenswürdigen LAN betreiben. TLS/WSS für den späteren externen Betrieb ist eine gesonderte Ausbaustufe; es gibt keinen unsicheren TLS-Modus.

## Messbasis und Validierung

Im Echtzeit-Demo wird vor dem Start ein Zeitversatz anhand einer bestätigten Host-Client-Rundreise geschätzt. Einzelzeiten entstehen aus lokalen monotonen Zeitstempeln. Teamzeiten laufen auf einer gemeinsamen Host-Zeitbasis vom Start bis zur letzten Rückgabe. Übergabe- und Zustellverzögerungen zählen mit. Funkasymmetrie und Uhrendrift sind ohne physische Messreihe noch nicht quantifiziert. Keine Genauigkeitszusage aus Simulationen ableiten.

Weitere Angaben und Hardware-Abnahme: `docs/FIRMWARE_030.md` und `docs/VALIDATION.md`. Eigener Code ist AGPL-3.0-only. Abhängigkeiten und Herkunft stehen in `DEPENDENCIES.md`.

## Vorabkonfiguration für fabrikneue Geräte

`config.example.json` beschreibt das Konfigurationsformat. Eine vorab angepasste Datei kann bei der erstmaligen Provisionierung als `firmware/data/config.json` in ein LittleFS-Abbild aufgenommen werden. Dieses Verzeichnis ist vom Git-Upload ausgeschlossen. Ein Dateisystem-Upload überschreibt den bestehenden Dateisystembereich und ist deshalb ausschließlich für diese Ersteinrichtung geeignet. Reguläre Updates verwenden nur `FLASH.sh` beziehungsweise das PlatformIO-Ziel `upload`.

## Firmware 0.3.2: neuer Einrichtungsablauf

WLAN aus der Liste auswählen, Einstellungen speichern, Verbindung testen und erst anschließend den Onlinebetrieb bestätigen. Nach der Bestätigung wird der SoftAP abgeschaltet. Die vorhandenen WLAN-Daten und die Geräteidentität bleiben beim regulären Firmware-Upload erhalten. Der Server bleibt bei Version 0.3.1. Vollständiger Ablauf und Testgrenzen: [docs/FIRMWARE_032.md](../docs/FIRMWARE_032.md).

Die im Abschnitt „Einrichtung“ genannten Felder heißen jetzt ausdrücklich „Server-Zugriffsschlüssel“ und „Serveradresse“. `DEVICE_API_KEY` ist nicht der öffentliche Geräteschlüssel. Ohne ausdrücklich gestarteten Onlinebetrieb werden keine normalen Serverbefehle abgeholt. Bereits gespeicherte Zugangsdaten werden bei der Migration übernommen; das neue Verfahren verlangt vor dem ersten Onlinewechsel einen Verbindungstest.
