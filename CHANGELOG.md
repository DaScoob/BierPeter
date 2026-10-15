# Änderungen

## 0.3.0-alpha · 2026-10-15

- Konto löschen mit Warnung und Bestätigung, ohne erneute Passwortabfrage; eigene Sessions werden gelöscht, keine Host-Übergabe.
- Bekannte Spieler aus bestehenden gemeinsamen Sessions, Freundschaftsanfragen, Annahme/Ablehnung, Zurückziehen und Beenden.
- Blockieren/Aufheben und Schutz vor wiederholten Anfragen.
- Direkte Freundeseinladungen, Host-Erlaubnis für Teilnehmer und weiterhin getrennte Beitrittsfreigabe. Keine zusätzlichen Statistik-/Geräterechte.
- Schlüsselanzeigen und Kopieren bei Erzeugung, Eingabe und Dateiimport; Entsperren erst nach ausdrücklicher Aktion, Zwischenablage-Fallback und Leeren des Eingabefeldes.
- Live-Datenlöschung einschließlich anderer Login-Sitzungen und Kontaktverknüpfungen atomar; fremde Sessions behalten Geräte ohne gelöschte Anbieterzuordnung.
- Kontaktmetadaten bleiben im aktuellen Servermodell lesbar; vollständige E2EE wird nicht behauptet.


## 0.2.2-alpha · 2026-10-15

- Standard-QR für Einladungen; lokaler Kamera-/Foto-Scan für Geräte.
- Session-Löschung durch den Host, mit Erhalt persönlicher Daten.
- Verschlüsselte Namensfreigabe pro zugelassenem Empfänger, gebunden an Session und Konten; Schlüsselabdrücke und Erkennung nachträglichen Schlüsseltauschs.
- Frische Gerätefunde aus tatsächlichen aktiven Peers und optionalen Nachbarlisten. Keine neue Suchfirmware oder erfundene Erkennung.
- Race-Formulare und Positionsauswahl an feste Race-ID gebunden; atomare persönliche Gerätelöschung; konsistente SQLite-Lesesnapshots.
- Staffel-Startgerät aus tatsächlich besetzter Aufstellung; URL-Prüfung und Anmeldung hinter gemeinsamer IP korrigiert.
- WAL, Indizes und größere Server-Warteschlange; Passwortberechnung außerhalb globaler Schreibsperre.
- AGPL-3.0-only, lokale QR-Abhängigkeiten samt MIT-/Apache-2.0-Hinweisen und Quellcodeangebot.


## 0.2.1-alpha · 2026-10-15

- Gemeinsame aktive Spielrunde, Modusprüfung, Race-Bearbeitung und Löschung.
- Geräteentfernung und explizite Reihenfolge in der Lobby.
- Konto-Gerätemerkliste und private, clientseitig verschlüsselte Gerätenamen.
- Statistik-Dashboard mit verschlüsselt gespeicherter Widget-Anordnung.
- Online/Offline sowie getrennte Server-/ESP-NOW- und Pairing-Anzeigen.
- LAN-Einladungsadresse, Geräteübernahme abbrechen, erneute Beitrittsanfrage.
- Isolierter Account-/Race-Sicherheitsprototyp mit EdDSA-JWT und getrennten Datenbanken.
- Additive Datenmigration ohne Verlust vorhandener Alpha-Konten und Sessions.
- Vollständige Gruppenverschlüsselung der bestehenden Lobby bleibt ausstehend.


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

## 0.3.1-alpha / Firmware 0.3.0-alpha
- New shared ESP8266/ESP32/ESP32-S3 firmware with local 1vs1/relay engine, per-device virtual sensors, ESP-NOW discovery, reliable framed messages and asynchronous SoftAP configuration/status.
- Server-triggered real-time or accelerated demos, encrypted server fallback between devices and recipient-specific encrypted results displayed in the existing lobby.
- Persistent device configuration/identity, volatile sessions/results, bounded reconnect buffers, no race timeout or penalties.
- Browser-generated X25519 keys in the existing encrypted vault, HKDF-SHA-256/AES-256-GCM interoperability checks, device-key pinning and separate demo presentation.

## Firmware 0.3.2-alpha (Server/Web-App unchanged at 0.3.1)
- Guided SoftAP setup with async WLAN selection, stored SSID/server prefill and clear server API key explanation.
- Confirmed persistent saves, staged WLAN/server/authentication test and explicit online handoff before shutting down SoftAP.
- Separate live setup status, short-outage recovery, stale-test invalidation, captive probe redirects and no channel hopping while portal clients are connected.
- Compact firmware/script/source-patch delivery without a new Git bundle.
