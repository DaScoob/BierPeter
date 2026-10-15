# Firmware Alpha 0.3 und Server Alpha 0.3.1

## Umfang

Die neue Firmware liegt getrennt von der bisherigen Prüffirmware unter `firmware/`. Die vorhandene Testumgebung wird nicht verändert. Server und Web-App werden von 0.3.0 auf 0.3.1 aktualisiert; die Firmware trägt die Version 0.3.0-alpha.

| Anforderung | Umsetzung |
|---|---|
| Gemeinsame Spiellogik | Portabler C++-Spielkern, ein Sensorereignispfad |
| 1vs1 und Staffel | Zwei Seiten; pro Seite eine eigene Staffelreihenfolge |
| Virtuelle Sensorik | Lokaler Zufall 3–15 s; normale Bereitschaft, Anstoßen, Anheben, Rückgabe |
| Echtzeit / beschleunigt | Monotone Gerätezeit / logische Zeit, gleicher Spielkern |
| Lokale Koordination | Host, Aufnahme-Reihenfolge, manuelle Auswahl, Aufnahmesperre |
| Funkerkennung | Broadcast-Beacons, Kanal 11 bevorzugt, Suche zwischen Runs |
| Zustellung | Sequenzen, ACK, Wiederholung, Fragmentierung, Deduplizierung |
| Server-Ausweichweg | Verschlüsselte Pakete zwischen bekannten Run-Geräten |
| SoftAP | Captive DNS, asynchrone mobile Oberfläche, Konfiguration und aktueller Status |
| Persistenz | LittleFS nur für Konfiguration und Geräteidentität, Session und Ergebnisse im RAM |
| Wiederanbindung | Automatische WLAN-Neuverbindung außerhalb laufender Runs, Heartbeat und RAM-Nachlieferung |
| Server-Demo | Autorisierter administrativer POST oder Sessionhost-Aktion in der Lobby |
| Ergebnisdarstellung | Empfängerbezogene verschlüsselte Umschläge, Entschlüsselung im Browser |

## Protokoll

- Gerätekennung: zwölf Hex-Zeichen der Stations-MAC, ohne Trennzeichen.
- `POST /api/v1/heartbeat`: bestehende Felder, ergänzt um öffentlichen X25519-Schlüssel, tatsächlichen Spielzustand und Bereitschaft. Nachbarn stammen aus empfangenen ESP-NOW-Beacons.
- `GET /api/v1/commands?device_id=…`: bisherige Antwort, ergänzt um `payload`. Neue Aktionen: `demo`, `abort`. Bestehendes `pair` bleibt kompatibel.
- `POST /api/v1/commands/ack`: bestehende Bestätigung.
- `POST /api/admin/demo`: `device_id`, optional `session`, optional boolesches `realtime`. Separater Administrationsschlüssel. Keine simulierten Messungen auf dem Server.
- `POST /api/sessions/{session}/demo`: angemeldeter Sessionhost, gleicher Geräteablauf.
- `POST /api/v1/relay`, `GET /api/v1/relay?device_id=…`, `POST /api/v1/relay/ack`: begrenzter, empfängerbezogener Transport verschlüsselter Gerätepakete. Kein Spiellogik-Ersatz auf dem Server.
- `POST /api/v1/run-result`: Gerätekennung, Run-ID, Empfänger und verschlüsselter Umschlag. Nur der konfigurierte Host dieses Runs darf Ergebnisse abliefern. Doppelte identische Ergebnisse sind zulässig, abweichende werden abgewiesen.
- `POST /api/account/run-key`: öffentlicher browserseitiger Ergebnisschlüssel. Privater Schlüssel verbleibt im verschlüsselten Tresor.
- `POST /api/sessions/{session}/run-abort`: explizites Verwerfen, keine Wertung und keine automatische Zeitgrenze.

## Speichergrenzen

Maximal acht Geräte, 16 Ergebnisempfänger, zwölf ausstehende Gerätepakete, zehn Empfangsplätze und zwei Fragment-Reassemblierungen. Die vollständigen Messungen des aktuellen Runs sowie höchstens zwei versandfertige Ergebnisumschläge werden im RAM gehalten. Weitere Empfängerumschläge entstehen schrittweise nach Übertragungsbestätigung. Ein weiterer verwalteter Run wird erst nach bestätigter Übertragung angenommen. Kein dauerhafter Offline-Spool.

Serverseitige Weiterleitung ist auf 256 gleichzeitig ausstehende Pakete je Run begrenzt. Identische Wiederholungen belegen keinen zusätzlichen Platz. Neues Run-Setup entfernt den alten Weiterleitungspuffer der Session. Löschen von Sessions oder Konten räumt zugehörige Run-Daten auf.

## Vertraulichkeit und Grenzen

Messdaten werden mit X25519, HKDF-SHA-256 und AES-256-GCM auf dem Host verschlüsselt. Serververmittelte Geräteereignisse werden ebenso vor dem Upload verschlüsselt. ESP-NOW und lokale SoftAP-Anzeige bleiben gemäß Vorgabe ohne zusätzliche Inhaltsverschlüsselung.

Ein passiver Zugriff auf die Serverdatenbank reicht nicht zur Entschlüsselung der Messungen. Das ist keine Zusage gegen einen aktiv manipulierten Auslieferungsserver. Initiale öffentliche Schlüssel und Web-App-Code bleiben Vertrauensanker; Schlüsselvergleich und verschlüsseltes Pinning machen spätere Geräte-Schlüsseländerungen erkennbar. Konto-, Kontakt-, Sessionzuordnungen und Übertragungszeitpunkte bleiben Metadaten des bestehenden Systems.

HTTP ist in dieser Ausführung auf das vertrauenswürdige lokale Netz beschränkt. Kein TLS-Handshake und keine blockierenden HTTPClient-Aufrufe liegen im Spielpfad. Externer HTTPS/WSS-Betrieb ist noch nicht enthalten. Eine gemessene Ende-zu-Ende-Latenz unter 50 ms wird nicht zugesichert.

## Physische Abnahme nach dem Flashen

Diese Prüfungen benötigen reale Geräte und sind durch Host-Simulationen nicht ersetzt:

1. Je Zielplatine USB-Flash, Neustart, MAC-Kennung, SoftAP und Konfigurationspersistenz nach erneutem Anwendungs-Upload prüfen.
2. Zwei bis acht Geräte nacheinander und gleichzeitig starten; automatische Aufnahme, Reihenfolge, manuelle Auswahl und Sperre prüfen.
3. Suche ohne Router, mit Router auf Kanal 11 und auf einem anderen zulässigen Kanal prüfen. Während des Runs dürfen keine Such-Kanalwechsel auftreten.
4. 1vs1 auf einer beziehungsweise zwei Stationen, Staffel mit unterschiedlichen belegten Seiten, Echtzeit und beschleunigt starten. Lokal erzeugte Einzelzeiten und kontinuierliche Teamzeiten vergleichen.
5. WLAN beziehungsweise Server während eines Runs vorübergehend abschalten. Run lokal abschließen, anschließend Wiederverbindung und genau eine Ergebnisübernahme prüfen.
6. ESP-NOW kurz unterbrechen; Wiederholungen und verspätete Pakete prüfen. Keine Doppelwertung. Bei dauerhaftem Ausfall kein erfundenes Ergebnis erzeugen.
7. ESP-NOW zwischen zwei online erreichbaren Stationen verhindern und die verschlüsselte Serverweiterleitung prüfen.
8. Bis zu vier Smartphones am Host-SoftAP, Speicherverbrauch, Watchdog und Messabweichung mit und ohne Statusabruf prüfen.
9. Echtzeit-Messbasis gegen eine unabhängige Referenz und asymmetrische Funkverzögerung prüfen. Erst danach Genauigkeitsangaben festlegen.
10. Spätere reale Sensorquelle über `EventSensors` einspeisen. Ohne Sensorhardware ist ihre physische Zuverlässigkeit noch nicht bewertbar.
