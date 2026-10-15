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
