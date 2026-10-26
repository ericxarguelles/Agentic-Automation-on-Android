# Android Agent UI — 0.5.0

## Update

Install outputs/AndroidAgent-0.5.0.apk over the existing companion. Keep the same application installed so its encrypted pairing and accessibility permission can carry over. The display name changes to **Android Agent**; the application ID stays com.androidphonecontrol. Your Windows Node.js server and ChatGPT connector do not need restarting or refreshing for this UI update.

## Home

- **Android Agent**, with **AI Phone Automation** underneath and a Settings gear at top right.
- Server address, hidden pairing token, Connect/Disconnect, and actual connection state.
- Animated task mark during session start and execution; distinct session-complete, stopped and interrupted states. Session complete means the device session ended; it does not independently verify that the requested task succeeded. ChatGPT supplies that outcome.
- Stop-current-task appears while a session is active. No single-tap test entry remains.

## Settings

- **ChatGPT task availability** switch: left is Off, right is On. Defaults to On when no preference exists. An explicit Off is remembered. Notification Stop also turns the preference Off.
- The preference and actual readiness are separate. On with missing permissions, missing credentials or an unavailable server displays setup/connection required. It does not claim to be connected.
- With On selected, opening the companion with saved pairing, accessibility and notifications permits connection verification and availability startup. A manually verified connection also starts availability while the activity is visible. This does not add a boot receiver or unattended service restart.
- Accessibility setup and notification permissions.
- Save verified connections, select a saved server, and remove saved connections. Up to ten recent connections are encrypted with Android Keystore. Existing single-connection storage is read and migrated when saved. Removing the current connection stops access and clears its fields. Turning off Save verified connections affects future saves; use Remove to delete an existing saved entry.

The supported apps and underlying five-minute/60-second-idle task limits are unchanged. The Windows host and Tailscale must remain running. Phone lock and Android service/permission restrictions still apply.

## File changelog

- MainActivity.kt: replace the old form with dark Home and Settings pages, rounded cards, mint accent, server entry, Settings gear, connection badges, encrypted saved-connection management and persistent availability switch. Resume verified availability only while the app is open and the preference is On. Modern Back navigation returns from Settings to Home.
- AgentVisuals.kt (new): shared palette, rounded backgrounds, custom vector gear and animated task mark.
- TaskPresentation.kt (new): explicit presentation for idle, starting, running, ended, stopped and failed sessions. No task-success claim is inferred from session termination.
- AgentPreferences.kt (new): persistent availability preference, default On.
- ReadSession.kt: expose lifecycle phases for the status indicator.
- RemoteAvailabilityService.kt: disable updates the owner preference; reject delayed starts after Off.
- SessionNotice.kt: notification Stop persists Off even if the service instance is unavailable.
- PairingStore.kt: encrypted multi-connection collection, prior-format reading, selection and removal.
- res/values/styles.xml (new): dark theme, typography/accent and matching system bars. strings.xml changes the display name to Android Agent.
- AndroidManifest.xml: use the new theme and remove the single-tap test activity registration.
- app/build.gradle.kts: versionCode 6, versionName 0.5.0.
- TaskPresentationTest.kt (new): lifecycle display, readiness and distinction between ending and success.
- README.md, CHANGELOG.md, docs/android-agent-ui.md: current UI, installation and verification notes.

## Validation

- Nine Android JVM tests pass; assembleDebug succeeds.
- Installed and visually inspected Home and Settings in a temporary API 37 emulator.
- Confirmed default-On switch and explicit-Off persistence across app restart.
- Using dummy local endpoints/credentials: connection verified, save UI displayed Use/Remove, preferences contained no plaintext endpoint/token, connection restored after restart, and Remove cleared it.
- Emulator AndroidRuntime error log contained no app crash during these checks.
- Real S23+ rendering, live task animation, ten-connection capacity and legacy-storage migration have not been manually exercised in this iteration. No real phone actions or live server configuration changes were made. The unchanged server suite was not rerun; its previous run passed 47 tests.
