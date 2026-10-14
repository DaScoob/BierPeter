# Anforderungsstand 14.10.2026

Die jüngsten Entscheidungen des Auftraggebers ersetzen frühere widersprechende Angaben.

- BierPeter ist das Projekt. Race Test ist ausschließlich die vorläufige Testumgebung.
- Session: Zusammenkunft einer Gruppe für mindestens ein Spiel; enthält mehrere Races.
- Race = Run = Spielrunde. Eine Spielrunde gehört genau zu einer Session.
- Standalone: Hardware ohne Smartphone, Konto, WLAN oder Server nutzbar; keine dauerhafte Ergebnisaufzeichnung.
- Vernetzt: lokale und servergestützte Mehrgeräte-Sessions; Internet ist nicht zwingend.
- Physischer Schalter: ausschließlich Standalone/vernetzt.
- Identifikation, dauerhafte Geräteverwaltung und Session-Gerätebereitstellung sind getrennt.
- Grundspiel: seitliche Glaserkennung, Anstoßerkennung oben, akustisches Startsignal, individuelle Zielerkennung beim Zurückstellen.
- Staffel: beide Mannschaften schreiten unabhängig fort. Freigabe des nächsten Teilnehmers nach Abschluss des Vorgängers.
- Mannschaftszeit läuft durchgehend vom gemeinsamen Anstoßen am Startgerät bis zum letzten zurückgestellten Glas der jeweiligen Mannschaft. Einzelzeiten werden zusätzlich erfasst; sie ersetzen diese Zeit nicht.
- Keine Zeitstrafen, keine Zwei-Sekunden-Regel, kein Race-Timeout. Unvollständige abgebrochene Races werden vollständig verworfen. Ohne Abschluss oder Abbruch läuft das Race unbegrenzt weiter.
- BierMarathon: Jeder gegen jeden. Generalbierjunge: fester Spieler gegen alle anderen. BierOlympiade: Rundenturnier zwischen Gruppen; konkrete Gruppenbegegnungen noch offen.
- Training gegen eigene Bestzeit; App löst akustischen Countdown am Gerät aus. Anstoßen entfällt.
- Ereignisse lokal messen und puffern; Zeitbasis abgleichen; verspätete und doppelte Übertragung darf Messergebnis nicht verfälschen.
- Selbsthosting, konfigurierbare Serveradresse, spätere JSON-Datenportabilität.
- Datensparsamkeit; konkrete Löschfristen, Auth-Wiederherstellung, Sichtbarkeit von Ergebnissen und Open-Source-Lizenz bleiben vor öffentlicher Produktfreigabe zu klären.

Alpha 0.1 implementiert nur Konten, Session-Verwaltung und Race-Vorbereitung. Die im Text beschriebenen Hardware- und Ergebnisfunktionen sind Anforderungen für nachfolgende Arbeit.
