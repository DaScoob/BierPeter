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

## Alpha 0.3.0
- Account deletion requires explicit confirmation, no extra password. Delete owned sessions; never transfer the host role. Preserve other accounts and unlink the deleted provider from surviving devices.
- Friendship grants only direct-invitation eligibility, no vault/device/statistics rights. Participant invitations require host policy; new members still require approval.
- Key import must stage the key locally for reveal/copy before explicit unlock. Clear the editor after unlock/navigation/logout. Never upload raw recovery keys.
- Contact/invitation metadata is presently visible to the service. Do not describe it as E2EE.
- Also validate node tests/ui-alpha030.cjs and tests/test_alpha030.py through unittest discovery.

## Firmware Alpha 0.3 / Server 0.3.1
- New firmware under firmware/ is explicitly authorized; preserve the separate legacy Race Test reference.
- Only explicitly marked demo sensor inputs may be simulated. Server never invents measured results.
- Run measurements and server-forwarded game packets must be sealed on the device before upload. Private recipient keys remain in the encrypted browser vault.
- Demo data never changes regular best times or personal statistics.
- Freeze roster/channel during a run; no automatic game timeout, no time penalty, no persistent offline history.
- Validate native engine/embedded-crypto interoperability with python3 firmware/test/check-native.py, API tests, node tests/ui-firmware.cjs and all three PlatformIO targets.
- Physical radio, timing and RAM tests must be reported separately from native simulations and successful builds.

## Firmware Alpha 0.3.2
- Save, test and online handoff are distinct explicit actions. HTTP 202 only confirms queueing, not storage success.
- Never send saved PSK or server API key back to portal JavaScript. New settings invalidate successful tests.
- Pause hopping while a phone uses the SoftAP. Scan asynchronously, outside prepared/running races.
- Health alone is insufficient; test actual authenticated heartbeat. Do not poll game commands in provisioning mode.
- Keep portal available on failed tests. Online handoff requires explicit confirmation and a visible local-network/server-link explanation.
- Edit firmware/portal.html, regenerate include/Portal.h with firmware/embed-portal.py. Validate actual portal DOM with tests/portal-alpha032.cjs and portable SetupFlow with firmware/test/setup.cpp.

## Firmware Alpha 0.3.3
- Keep the SoftAP channel stable even before a station is associated. Same-channel ESP-NOW remains active; cross-channel discovery pauses during setup.
- Foreign HTTP hosts at '/' must redirect to the canonical portal origin before serving the configuration form. Never intercept HTTPS or claim guaranteed OS popup behavior.
- Scan only after an actual portal load and the association/page grace period. OS probes alone must not start a scan.
- Portal diagnostics contain only counters/radio state, no credentials or visited hostnames. Serial diagnostics pause during prepared/running races.
- Source update packages compare the expected source tree, not an assumed identical user-created commit ID.
