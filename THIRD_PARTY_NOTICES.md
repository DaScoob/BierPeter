# Open-Source-Lizenzen

Der eigene BierPeter-Programmcode und die zugehörige Dokumentation stehen unter **AGPL-3.0-only**. Vollständiger Text: `LICENSE`. Kommerzielle Nutzung ist erlaubt. Die Lizenz begründet insbesondere Pflichten zur Bereitstellung des korrespondierenden Quellcodes; sie verbietet keine Gewinnerzielung. Bestehende Fremdcode-Hinweise bleiben gültig.

## Lokal mitgelieferte QR-Komponenten

| Bestandteil | Version / Herkunft | Lizenz | Mitgelieferter Text |
| --- | --- | --- | --- |
| Project Nayuki QR Code generator | v1.8.0, `nayuki/QR-Code-generator`, TypeScript-Fassung | MIT | Lizenzkopf in `web/vendor/qrcodegen.ts` und `.js` |
| Nimiq QR Scanner | package 1.4.2, Commit `abcfe1bce2703721408d8ce7ebde94a359998506` | MIT | `web/vendor/qr-scanner.LICENSE` |
| jsQR-es6 im Scanner-Worker | 1.4.0-1, `danimoh/jsQR`, Fork von `cozmo/jsQR` | Apache-2.0 | `web/vendor/jsQR-es6.LICENSE` und `web/vendor/jsQR.LICENSE` |

Copyright des QR-Generators: Project Nayuki. Copyright des Scanners: 2017 Nimiq, danimoh. Der Worker enthält den jsQR-es6-Decoder. Die Apache-Lizenz wird zusätzlich zur MIT-Lizenz des Scanners ausgeliefert. Keine Umdeklaration dieser Komponenten als eigener Code.

Quellen:

- https://github.com/nayuki/QR-Code-generator/tree/v1.8.0
- https://github.com/nimiq/qr-scanner/tree/abcfe1bce2703721408d8ce7ebde94a359998506
- https://www.npmjs.com/package/jsqr-es6/v/1.4.0-1
- https://github.com/danimoh/jsQR

`web/vendor/SHA256SUMS` dokumentiert die tatsächlich ausgelieferten Dateien. Die Original-TypeScript-Dateien sowie Buildkonfiguration und Lockdatei des Scanners liegen unter `web/vendor/source/`; das unveränderte Paketmanifest liegt daneben. Für einen Scanner-Neubau werden diese Originaldateien in die ursprüngliche Paketstruktur zurückgelegt und die Abhängigkeiten anhand der Lockdatei installiert. Keine Installation ist zum Betrieb nötig.

`qrcodegen.js` wird aus der mitgelieferten Originaldatei `qrcodegen.ts` mit Node 24 `node:module.stripTypeScriptTypes(..., {mode:'transform'})` erzeugt; der ursprüngliche MIT-Lizenzkopf bleibt erhalten. Scanner und Worker sind unveränderte Upstream-Builds, abgesehen von einem gegebenenfalls normalisierten abschließenden Zeilenumbruch. Sie werden zur Laufzeit ausschließlich vom eigenen Server geladen.

## Python und optionaler Sicherheitsprototyp

Die Hauptanwendung verwendet die Python-Standardbibliothek. Python und das verwendete Container-Basisimage behalten ihre jeweiligen Lizenzen. Der getrennte Prototyp unter `security/` verwendet zusätzlich PyJWT und cryptography; deren Originaldistributionen und Lizenzhinweise werden durch den Paketmanager installiert. Dieser Prototyp ist nicht in den normalen App-Betrieb integriert.

## Quellcodeangebot

Jede App-Version bietet unter `/source.tar.gz` ihren mitgelieferten Quellstand samt Lizenzen, Tests und Builddateien an. Der Link ist unter „Impressum & KI-Hinweis“ erreichbar. Das Archiv basiert ausschließlich auf `SOURCE_FILES.txt`. Kontodaten, Datenbanken, Umgebungsdateien und Geräteschlüssel werden nicht aufgenommen. Änderungen am Produkt müssen auch im Quellcodeangebot enthalten sein.
