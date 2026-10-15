# Firmware Alpha 0.3.3: Captive-Portal-Korrektur

Server und Web-App bleiben bei 0.3.1. Updatebasis ist Firmware 0.3.2.

## Änderungen

- Während der SoftAP angeboten wird, erfolgen keine selbstständigen ESP-NOW-Channel-Hopping-Wechsel. Eine neue, alleinstehende lokale Gruppe beginnt auf Kanal 11. Bestehende Gruppen und eine bestehende WLAN-Verbindung werden dafür nicht umgestellt.
- ESP-NOW auf dem aktuellen Kanal bleibt aktiv. Kanalübergreifende Erkennung pausiert während des Portalbetriebs. Ein ausdrücklich gestarteter WLAN-Verbindungstest, eine WLAN-Suche und die Wiederverbindung eines zuvor aktivierten Onlinebetriebs können weiterhin andere Kanäle verwenden. Diese Ein-Funkmodul-Grenze wird nicht durch asynchrone Programmierung aufgehoben.
- In der Ersteinrichtung erfolgen keine ungefragten WLAN-Neuanmeldungen. Die automatische Wiederverbindung eines zuvor aktivierten Onlinebetriebs bleibt erhalten, pausiert aber bei verbundenen SoftAP-Clients sowie während der Anmeldeschonfrist. Beim ausdrücklich gestarteten Verbindungstest gilt weiterhin dessen bestehender Ablauf.
- Keine WLAN-Suche beim Start des SoftAP. Die Oberfläche fordert die Suche nach dem Öffnen an. Die Firmware wartet mindestens acht Sekunden nach dem jüngsten Portalabruf und nach einer erkannten Zunahme der WLAN-Clients. Betriebssystem-Prüfanfragen allein starten keine Suche.
- Wildcard-DNS verwendet TTL 0 und eine fehlerfreie leere Antwort für nicht unterstützte Abfragetypen. Ein fehlgeschlagener DNS-Start wird nach einer Sekunde erneut versucht. Der DNS-Startstatus bedeutet nicht, dass eine Anfrage des Smartphones nachgewiesen wurde.
- HTTP-Aufrufe fremder Domains werden auch für den Pfad `/` ausdrücklich auf `http://192.168.4.1/` umgeleitet. Nur diese Adresse, optional mit Port 80, liefert die Konfigurationsseite aus. Bekannte Portal-Prüfpfade und unbekannte Pfade erhalten weiterhin die Weiterleitung. Zugriff über die Station-Schnittstelle bleibt gesperrt.
- HTML und Weiterleitungen erhalten Cache-Control-Header. Keine Nachbildung einer erfolgreichen Internetverbindung für die Betriebssystem-Prüfung.
- Portaldiagnose in der Oberfläche und alle fünf Sekunden über die serielle Schnittstelle mit 115200 Baud: Firmwareversion, DNS-Startstatus, Kanal, Clientzahl, Portalabrufe und Weiterleitungen. Keine Passwörter, Zugriffsschlüssel, aufgerufenen Domainnamen oder persönlichen Nutzdaten. Serielle Ausgabe pausiert bei vorbereiteten/laufenden Runs.

## Grenzen

Die Firmware unterstützt die Captive-Portal-Erkennung. Ein automatisches Anmeldefenster bei jeder WLAN-Anmeldung bleibt vom Betriebssystem abhängig. HTTPS wird nicht abgefangen, kein Zertifikatsfehler umgangen. Bei ausbleibendem Fenster bleibt `http://192.168.4.1/` der direkte Einstieg. Ein beliebiger unverschlüsselter HTTP-Aufruf sollte ebenfalls dort landen.

Konfiguration, Geräteidentität, Spiellogik, Ergebnisverschlüsselung und das ausdrückliche Speichern/Testen/Online-Schalten bleiben erhalten. Keine Dateisystemlöschung und kein Server-Neustart erforderlich.

## Validierung

- Native Prüfung der tatsächlich eingebundenen Portal-Routing- und Scanfreigabe-Funktionen: lokale Adresse, Port 80, fremde Hosts, täuschend ähnliche IP-Namen, Betriebssystem-Prüforigins, Stationszugriff und erneute Anmeldungen während der Scanwartezeit.
- Bestehende tatsächliche Portal-HTML/JavaScript-Prüfung in jsdom mit vorgegebenen Netzwerkantworten, einschließlich fehlerhafter Speicherung und Verbindungsprüfung.
- Native Spielsimulation, Setup-FSM und tatsächliche Embedded-/Browser-Kryptografie.
- Server-API-Regression und Firmware-Web-App-Test; ESP8266-, ESP32- und ESP32-S3-Builds. Buildwerte und Binärprüfsummen stehen in `BUILD_033.json`.
- Keine physische Funk- oder Smartphone-Prüfung in der Entwicklungsumgebung. Erfolgreiche Builds und Simulationen bestätigen keine zuverlässige automatische Portalöffnung.

## Gemeinsame Geräteabnahme

1. Zunächst nur einen BierPeter aktualisieren, den zweiten als Vergleich unverändert lassen.
2. Dreimal mit dem SoftAP verbinden, jeweils mindestens zehn Sekunden auf Portal-Erkennung warten. Beim zweiten und dritten Versuch das gespeicherte Netzwerk nicht löschen.
3. Falls kein Anmeldefenster erscheint: `http://192.168.4.1/` und danach `http://neverssl.com/` aufrufen. Auf automatische HTTPS-Aufwertung im Browser achten.
4. Diagnose prüfen: DNS bereit, Clientzahl mindestens 1, Kanal außerhalb einer Suche/eines Verbindungstests stabil, Weiterleitungen und Portalabrufe passend zunehmend. Diagnosewerte sind kumulativ seit Gerätestart.
5. WLAN-Liste, gespeicherte Werte, Speichern, Verbindungstest und bestätigten Onlinewechsel prüfen. Erst danach zweites Gerät aktualisieren.

## Quellcode-Update

`UPDATE-SOURCE.sh` erwartet einen sauberen `main` mit dem vollständigen Quellbaum von 0.3.2. Der Vergleich erfolgt anhand des Git-Baums, weil der lokal erzeugte Updatecommit eine andere Commitkennung als der Entwicklungsstand haben kann. Der Updater wendet ausschließlich den mitgelieferten Patch an, erstellt einen Commit und pusht über den vorhandenen Git-Zugang. Bei einer abweichenden Basis erfolgt ein Abbruch ohne Überschreiben vorhandener Änderungen. Das Flashen erfolgt anschließend separat.
