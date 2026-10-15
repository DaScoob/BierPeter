# Änderungen

## 0.2.0-alpha · 2026-10-15

- Gemeinsame Lobby mit sichtbarer Vorbereitungsreihenfolge statt Verwaltungs-Tabs.
- Einladungs-/Gerätelinks erhalten ihren Kontext bei Anmeldung, Registrierung und Neuladen.
- Direkte wartende Lobby, automatische Anzeige nach Host-Freigabe.
- Echte Firmware-Heartbeat- und Gerätebefehls-Endpunkte; keine erfundenen Online-Meldungen.
- Teilnehmer können Geräte bereitstellen; MAC-Kennungen werden normalisiert.
- Port 6017 für Rechner und LAN-Geräte; bestehendes Datenvolume bleibt erhalten.
- Lokale Übernahme des vorhandenen Firmware-Schlüssels ohne Ausgabe des Geheimnisses.


## 0.1.0-alpha · 2026-10-14

- Eigenständige BierPeter-App im Stil der freigegebenen Designstudie.
- Echte lokale Konten und Session-Verwaltung mit SQLite.
- Mehrere Race-Vorbereitungen pro Session; sechs auswählbare Modusentwürfe.
- Einladungslinks, Host-Bestätigung und linke/rechte Positionszuweisung.
- Explizit ungeprüfte Geräteverbindung; keine simulierten Messwerte.
- Separate Docker-Konfiguration mit localhost-Port 6018.
- Keine Strafzeiten und keine automatische Race-Zeitgrenze.
