# BierPeter

- BierPeter is the product. Race Test is only the temporary hardware test environment.
- Preserve the approved mobile visual concept and left/right cards. Use one shared lobby with guided preparation; do not separate participant/device administration into tabs.
- Preserve device and invitation link context through authentication and reload.
- Existing accounts and sessions must survive schema additions and updates.
- Use host port 6017. Heartbeat online status is not sensor readiness or proof of an active peer connection.
- Session = player group; Race/Run = one round. Sessions contain multiple races.
- Device identification is not proof of ownership or connectivity.
- No fictitious hardware status or events in the running application.
- Timing and gameplay belong on hardware. Relay team timing is continuous, from initial clink to final glass return, independently per team.
- No time penalties and no race timeout. Incomplete aborted rounds are not scored.
- Do not change the existing Race Test container or firmware as part of this app.
- Every page needs the AI notice. Provider, privacy and licence decisions must be completed before public service operation.
- Run `python3 -m unittest discover -s tests -v` and `node --check web/app.js` after relevant changes.
- Repository upload and hosting are performed by the operator using complete console commands.

## Alpha 0.2.1
- Active race and device ordering are session-wide server state. Do not replace them with per-browser selection or ID sorting.
- Device account management is a personal list, not global ownership. Do not erase session availability when removing a personal list entry.
- New private names/dashboard data must be sealed by web/vault.js before upload; recovery keys must never be sent to the server or derived from the server-known login password.
- Current lobby data is still legacy plaintext. Never claim full E2EE or transparent group-name sharing until the separate security prototype is evaluated and integrated.
- Statistics must reflect actual scored results only; empty widgets must not be filled with sample results.
- Validate: node tests/ui-alpha021.cjs; optional security dependencies are separate from the standard app.

## Alpha 0.2.2
- Eigener Code: AGPL-3.0-only. Fremdkomponenten und Lizenzköpfe erhalten; Quellcodeangebot und SOURCE_FILES.txt aktuell halten.
- Namen nur als pro Empfänger verschlüsselte Umschläge teilen. Öffentliche Erstidentitäten sind ohne unabhängigen Vergleich nicht serverunabhängig verifiziert.
- Lokale Gerätefunde nur aus tatsächlichen Peer-/Nachbarmeldungen ableiten. Keine globale Server-Geräteliste als lokale Suche ausgeben.
- Zusätzlich validieren: node tests/ui-alpha022.cjs und node tests/qr-roundtrip.cjs.
