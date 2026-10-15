# Firmware Alpha 0.3.2: geführte lokale Einrichtung

Server und Web-App bleiben bei 0.3.1. Die vorhandenen Health- und Heartbeat-Endpunkte reichen für die Einrichtung aus. Spiellogik, Messformat und Ergebnisverschlüsselung bleiben unverändert.

## Ablauf

1. Mit `BierPeter-XXXXXX` verbinden. Mehrere übliche Captive-Portal-Prüfpfade erhalten eine Weiterleitung auf `http://192.168.4.1/`. Das Channel-Hopping pausiert bei verbundenen SoftAP-Clients. Eine automatische Portalöffnung hängt trotzdem vom Betriebssystem ab; manueller Zugang bleibt verfügbar.
2. Beim Portalstart erfolgt eine asynchrone WLAN-Suche. Bis zu 16 unterschiedliche SSIDs werden nach Empfangsstärke angezeigt; erneutes Suchen und manuelle Eingabe versteckter SSIDs bleiben möglich. Keine Suche während eines vorbereiteten oder laufenden Runs.
3. Bereits gespeicherte SSID und Serveradresse werden eingesetzt. Passwort und Server-Zugriffsschlüssel werden niemals zurückgeliefert; leere Felder behalten die vorhandenen Werte. Beim Wechsel zu einer anderen SSID mit vorhandenem Passwort ist eine neue Passworteingabe oder die ausdrückliche Auswahl eines offenen WLANs erforderlich.
4. Speichern schreibt eine temporäre Konfigurationsdatei, liest sie zur Kontrolle erneut und ersetzt die bisherige Datei erst danach. Schreibfehler ergeben keine Erfolgsmeldung. Die bisherige Konfiguration bleibt nach Möglichkeit als Rückfallkopie erhalten. Ein vollständiger Stromausfallschutz wird daraus nicht abgeleitet.
5. `Verbindung testen` prüft separat WLAN-Verbindung, BierPeter-Health-Antwort und Geräteanmeldung über einen echten Heartbeat mit `DEVICE_API_KEY`. Ein öffentlicher Geräteschlüssel oder ein erfolgreicher Health-Aufruf allein reicht nicht aus. Der Test besitzt eigene begrenzte Wartezeiten; diese sind keine Race-Timeouts.
6. Während des Tests sind Eingaben und normale Spielstandaktualisierung pausiert. Ein separater Statusabruf wird wiederholt. Bei kurzem Funkabbruch kann sich das Smartphone erneut mit dem Geräte-WLAN verbinden; die laufende Seite setzt den Statusabruf fort.
7. Nach erfolgreichem Test pausiert die reguläre Serverkommunikation. Es wird nicht automatisch ein Spielbefehl abgerufen. Änderungen an gespeicherten Einstellungen machen das Testergebnis ungültig.
8. `Onlinebetrieb starten` öffnet zuerst die Hinweisseite. Erst die weitere Bestätigung speichert den Onlinebetrieb und schaltet nach einer Übergangsfrist von sechs Sekunden den SoftAP ab. Das Smartphone muss bei lokalem Server ins Heimnetz wechseln. Der Serverlink und eine Kopiermöglichkeit sind vorher sichtbar.
9. Automatische Weiterleitung nach einem erkannten Netzwechsel ist optional. Der manuelle Serverlink bleibt erforderlich, weil Captive-Browser keine verlässliche Netzwechselgarantie bieten.
10. Bestätigter Onlinebetrieb wird als Konfiguration gespeichert und beim Neustart wiederhergestellt. Nach längerem WLAN-Ausfall wird das Portal wieder angeboten. Bestehende 0.3.0-Konfigurationen behalten SSID, Passwort, Serveradresse, Zugriffsschlüssel und Geräteidentität; nach dem ersten 0.3.2-Start wird der neue Verbindungstest einmalig verlangt.

## Status und Datenschutz

`GET /setup` enthält nur Konfigurationshinweise und aktuellen Zustand, niemals WLAN-Passwort oder Server-Zugriffsschlüssel. WLAN verbunden und Server online sind getrennte Anzeigen. Server online benötigt eine tatsächliche bestätigte Geräteanmeldung und eine bestehende WLAN-Verbindung; ein gespeicherter Schlüssel oder öffentliches Schlüsselmaterial genügt nicht.

`POST /config`, `/test`, `/online`, `/scan` und `/session` werden im Hauptloop bearbeitet. Die HTTP-Antwort enthält zunächst eine Anfragekennung. Die Seite wartet auf das dazu passende Verarbeitungsergebnis; HTTP 202 wird nicht als erfolgreiches Speichern dargestellt. JSON-Anfragen dürfen aus mehreren TCP-Fragmenten bestehen. Alle lokalen Konfigurationszugriffe bleiben auf die SoftAP-Schnittstelle beschränkt.

Die vorhandene Sicherheitsgrenze bleibt bestehen: asynchrones HTTP im vertrauenswürdigen LAN, verschlüsselte Run-Messdaten, vertrauenswürdige öffentliche Erstschlüssel und vertrauenswürdiger Browsercode. Keine neue HTTPS-/WSS-Unterstützung in diesem Schritt.

## Auslieferung

Das kompakte Paket enthält vorkompilierte Firmware für ESP8266/ESP32/ESP32-S3, ein Flash-Skript mit Prüfsummenprüfung, vollständigen eigenen Firmwarequellcode, benötigte Bibliotheksquellen und einen Quellcode-Patch ab Repository-Stand `d6a7d6c0f99ef5493809293057d7c5c9e5cc62f6` (Server/Web-App 0.3.1). Kein Git-Bundle und kein Server-Neustart sind erforderlich.

Der Source-Updater verändert nur einen passenden, sauberen `main`-Checkout und pusht über den vorhandenen Git-Zugang. Das Flashen erfolgt separat und ausdrücklich für Zielchip und seriellen Anschluss. Der Dateisystembereich mit Konfiguration und Geräteidentität wird nicht überschrieben.

## Validierung

- Nativer Test des tatsächlichen `SetupFlow` prüft Stufen, Fehlerfälle, Wartezeiten, Run-Sperre, ungültig gewordene Testergebnisse, expliziten Onlinewechsel und verspätete Antworten.
- Die tatsächliche HTML-/JavaScript-Portalseite wird mit jsdom 26.1.0 geprüft: Datenübernahme ohne Geheimnisrückgabe, WLAN-Auswahl, Speicherfehler, Verbindungsstufen, Verbindungsunterbrechung, falscher Schlüssel und bestätigte Übergabe. Netzwerkantworten sind dabei Testvorgaben; dies ersetzt keine Funkprüfung.
- Derselbe native Spielkern und die Embedded-/Browser-Kryptografie werden erneut geprüft.
- Erfolgreiche Firmware-Builds und Prüfsummen stehen in `BUILD_032.json`.
- Physisch noch zu prüfen: automatische Portalöffnung auf dem Smartphone, echtes Scannen, Kanalwechsel/Reconnect, Speicherpersistenz, echte Serveranmeldung und SoftAP-Abschaltung. Kein ESP ist in der Entwicklungsumgebung angeschlossen.

Reproduktion der Portalprüfung, Testabhängigkeit außerhalb des Repositorys:

```bash
cd ~/BierPeter
npm install --prefix /tmp/bierpeter-portal-test --no-audit --no-fund jsdom@26.1.0
BIERPETER_JSDOM=/tmp/bierpeter-portal-test/node_modules/jsdom node tests/portal-alpha032.cjs
python3 firmware/test/check-native.py
```
