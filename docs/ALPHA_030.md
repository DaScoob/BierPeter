# Alpha 0.3.0

## Abgestimmte Regeln

### Konto löschen

Unter Konto gibt es einen Warnhinweis und die Aktion „Konto endgültig löschen“. Eine ausdrückliche Bestätigung genügt. Es erfolgt keine erneute Passwortabfrage und keine Übergabe der Host-Rolle.

Eine gemeinsame Datenbanktransaktion entfernt das eigene Konto, sämtliche Login-Sitzungen, privaten verschlüsselten Speicher, öffentliche Schlüsselzuordnung, persönliche Geräteliste, Freundschaften, Blockierungen, direkte Einladungen, Anfragen und Teilnehmerpositionen. Alle selbst gehosteten Sessions samt Runden, Aufstellungen und zugeordneten Befehlen werden gelöscht. Das gilt auch für eine als laufend markierte eigene Runde; eine Kontolöschung ist eine ausdrückliche Beendigung dieser Session, kein Race-Timeout.

Fremde Sessions und Konten bleiben bestehen. Dort bereitgestellte physische Geräte werden nicht gelöscht; die Anbieterzuordnung zum gelöschten Konto wird entfernt. Andere Spieler behalten ihre Aufstellungen am Gerät. Der gelöschte Spieler wird aus Aufstellungen entfernt. Nach einem Neustart wird eine ausdrücklich entfernte Gerätezuordnung nicht als alte Migration wiederhergestellt.

Die Löschung betrifft die Live-Datenbank. Bereits lokal angelegte SQLite-Sicherungskopien werden nicht automatisch vernichtet; deren Aufbewahrung und eine eventuelle Wiederherstellung müssen Löschungen gesondert berücksichtigen. Daten, die andere Teilnehmer bereits rechtmäßig lokal gespeichert haben, können nicht nachträglich aus deren Speicher entfernt werden.

### Bekannte Spieler und Freunde

Bekannte Spieler werden aus vorhandenen gemeinsamen Session-Mitgliedschaften ermittelt. Eine bestätigte oder früher entfernte Mitgliedschaft gilt als gemeinsame Teilnahme; eine lediglich wartende oder abgelehnte Anfrage genügt nicht. Eine zusätzliche dauerhafte Begegnungshistorie wird nicht angelegt. Nach Löschen der ursprünglichen Session bleiben bereits gestellte Freundschaftsanfragen und angenommene Freundschaften erhalten.

- Anfrage aus der Lobby oder unter Konto senden.
- Eingehende Anfrage annehmen oder ablehnen.
- Eigene offene Anfrage zurückziehen.
- Freundschaft jederzeit beenden.
- Kontakt blockieren und die Blockierung später aufheben.

Eine Freundschaft gewährt keinen zusätzlichen Zugriff auf private Statistiken, persönliche Geräte oder den verschlüsselten Speicher. Die Kontaktübersicht liefert nur notwendige Konto-ID und Anzeigename, keine fremden Freundeslisten oder privaten Gerätedaten. Eine Blockierung beendet die Freundschaft und direkte Einladungen, verhindert weitere direkte Anfragen und Einladungen und lässt eine bestehende gemeinsame Session unverändert. Aufheben stellt keine Freundschaft automatisch wieder her.

Zum Schutz vor wiederholten Anfragen gilt eine Grenze von zehn neuen Freundschaftsanfragen pro Minute. Identische offene Anfragen sind idempotent und zählen nur einmal. Nach Ablehnung beziehungsweise Beendigung durch die Gegenseite muss der betroffene Absender 24 Stunden warten. Nach eigenem Zurückziehen gilt eine Minute. Die ablehnende oder beendende Person kann selbst eine neue Anfrage stellen. Überholte inaktive Kontaktzustände werden bei weiteren Kontaktaktionen nach 24 Stunden bereinigt.

### Freunde in eine Session einladen

Der Host kann eigene Freunde direkt einladen. Die Einstellung „Teilnehmer dürfen eigene Freunde einladen“ ist für bestehende und neue Sessions standardmäßig ausgeschaltet. Nur der Host kann sie ändern. Bei Freigabe können bestätigte Teilnehmer eigene Freunde in diese Session einladen, auch wenn sie selbst nicht Host sind.

Direkte Einladungen erscheinen unter Start und Konto. Sie funktionieren auch bei zunächst abgemeldetem Empfänger: Nach normaler Anmeldung erscheinen die gespeicherten Einladungen. Die Auswahl öffnet unmittelbar die wartende Lobby. Eine zusätzliche Host-Bestätigung bleibt für jeden neuen Teilnehmer erforderlich. Bereits bestätigte Teilnehmer bleiben bestätigt. Ablehnen ist ebenfalls möglich.

Beim Abschalten der Teilnehmer-Einladungen werden deren direkte Einladungen ungültig. Ebenso bei Blockierung, beendeter Freundschaft, Entfernung des Absenders, Konto- oder Session-Löschung. Es gelten höchstens 20 neue direkte Einladungen pro Minute. Wiederholtes Senden einer offenen Einladung erstellt keine Duplikate; nach Beantwortung gilt für dieselbe Einladungskonstellation eine Wartezeit von 24 Stunden.

Nicht freigegebene Teilnehmer erhalten keinen neuen Einladungslink aus der API beziehungsweise Oberfläche. Bereits früher kopierte allgemeine Links können weiterhin weitergegeben werden. Sie stellen keine freundschaftsgebundene Berechtigung dar; die Host-Bestätigung bleibt daher auch dort entscheidend. Ein Link aus einer bestehenden Session wird durch das Versionsupdate nicht automatisch ersetzt.

### Wiederherstellungsschlüssel

- Neuerzeugter Schlüssel, manuelle Eingabe und Dateiimport unterstützen Anzeigen/Verbergen und Kopieren.
- Standardmäßig verdeckte Anzeige. Kopieren über die Zwischenablage erfordert kein vorheriges Anzeigen.
- Der Dateiimport prüft Format, Kontozuordnung und Schlüsselgröße und füllt zunächst nur das lokale Schlüsselfeld. Es erfolgt noch keine Entschlüsselung.
- Entsperren geschieht ausschließlich über die entsprechende Schaltfläche oder Formularbestätigung.
- Bei verweigertem Zwischenablagezugriff wird der Schlüssel nach ausdrücklicher Kopieraktion sichtbar markiert, damit manuelles Kopieren möglich bleibt.
- Nach erfolgreichem Entsperren, Sperren, Abmelden, Kontolöschung oder Verlassen des Kontobereichs wird das Eingabefeld geleert. Ein falscher Schlüssel bleibt zur Korrektur stehen.
- Der Rohschlüssel wird nicht an die API gesendet. Eingabe und Sichtbarkeit liegen nur im Arbeitsspeicher dieses Browsers. Bereits in die Betriebssystem-Zwischenablage kopierte Werte unterliegen deren eigener Verwaltung.

## Datenschutz- und Sicherheitsstand

Die bestehende clientseitige Verschlüsselung privater Namen und Statistikdaten bleibt erhalten. Freundschaft erzeugt keine zusätzliche Schlüssel- oder Datenfreigabe. Gerätenamen werden weiterhin nur an zugelassene Session-Teilnehmer verschlüsselt geteilt.

Für die Durchsetzung von Kontakten, Blockierungen und Einladungen speichert die Alpha minimale **serverseitig lesbare Beziehungsmetadaten**: beteiligte Konto-IDs, Zustand, Session-Zuordnung sowie notwendige Zeit-/Zählerwerte. Private Statistik- und Geräteinhalte werden dabei nicht mitgespeichert. Es wäre falsch, dieses Kontaktmodell als vor dem Betreiber verborgen zu bezeichnen. Die vollständige serverunabhängige Lobby-/Kontaktarchitektur bleibt ausstehend; die bestehende Sicherheitsgrenze aus 0.2.2 gilt fort.

Die Funktionen sind In-App-Funktionen. Es werden keine E-Mails, externen Nachrichten oder Push-Mitteilungen versandt. Abfragen erfolgen authentifiziert; schreibende Aktionen verwenden den bestehenden Schutz vor fremden Anfrageursprüngen. Kontolöschung wirkt ausschließlich auf das angemeldete Konto und widerruft auch dessen andere Browser-Anmeldungen.

## Aktualisierung

Version API und Oberfläche: `0.3.0-alpha` beziehungsweise Alpha 0.3.0. Port 6017 bleibt erhalten. Das Update verwendet das bestehende Datenvolume und sichert die Datenbank vor der Migration. Konten und Sessions werden beim Update nicht gelöscht. Kontolöschung erfolgt ausschließlich durch die eigene bestätigte Aktion. Firmware und Funkprotokoll werden nicht verändert.

Eigener Code weiterhin AGPL-3.0-only. QR-Fremdkomponenten behalten ihre MIT-/Apache-2.0-Lizenzen. Das vollständige Quellcodeangebot wird zusammen mit den neuen Dateien aktualisiert.
