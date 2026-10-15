# Getrennter Account-/Race-Prototyp

Isolierter Evaluationsstand, nicht das Anmeldebackend der Alpha-Web-App.

```bash
cd ~/BierPeter
docker compose -f compose.security.yaml up -d --build
curl --fail http://127.0.0.1:6019/health
curl --fail http://127.0.0.1:6020/health
```

Accountdienst: eigene SQLite, eigene Ed25519-Signaturdatei, keine Race-Daten. Racedienst: eigene SQLite und ausschließlich öffentlicher Prüfschlüssel, keine Passwort- oder Signaturdateien. Eine Kompromittierung des gemeinsamen Hosts bleibt außerhalb dieser Isolation.

`POST :6019/register` mit `login` und `password`, anschließend `POST :6019/token` mit denselben Angaben. Das signierte JWT enthält pseudonymes `sub`, `iss`, `aud`, `iat`, `exp` und `scope`, keine Anzeigenamen. Der Racedienst prüft ausschließlich EdDSA, erwarteten Herausgeber und Empfänger sowie die fünfminütige Gültigkeit ohne Rückfrage beim Accountdienst. JWTs sind signiert, nicht verschlüsselt; ihre Kennungen bleiben sichtbar.

`GET/POST :6020/vault` verwendet `Authorization: Bearer ...`. Der Dienst speichert nur AES-GCM-Umschläge. Die Clientschlüssel werden nicht an die Dienste übertragen. Der Browser-Prototyp in `web/vault.js` wird im normalen Kontobereich für private Daten benutzt, ist aber noch nicht an diese getrennten Dienste angeschlossen.

Tests: `python3 -m venv .venv-security`, `.venv-security/bin/pip install -r security/requirements.txt`, `.venv-security/bin/python -m unittest discover -s security -p 'test_*.py' -v`. Testdaten sind temporär und unabhängig von Alpha-Konten.

Ausstehend vor Migration: überprüfbare Session-Teilnehmeridentitäten, Gruppenprotokoll/Schlüsselfreigabe und Rotation, authentifizierte Geräteergebnisse, Wiederherstellungs- und Mehrgeräteablauf, Schutz gegen Missbrauch, Migrationskonzept für bisherige Klartextdaten, unabhängige Sicherheitsprüfung. Der Prototyp verwendet lokales HTTP ausschließlich für Tests; Produktbetrieb benötigt HTTPS. Kein Versprechen, dass der aktuelle Web-App-Server keine Lobby-Daten lesen kann. Vom Server ausgelieferter manipulierter Clientcode und Verbindungsmetadaten bleiben Teil des Bedrohungsmodells.
