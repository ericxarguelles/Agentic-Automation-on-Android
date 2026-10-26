# Real S23+ test: restricted companion and private bridge

## Current milestone

> Remote availability now has a foreground-service implementation with ChatGPT-started task sessions. See chatgpt-task-sessions.md for the new installation/acceptance flow. The manual-session instructions and earlier notification limitations below describe the developer fallback.

The updated companion can optionally remember a verified address and pairing token. Check Remember this connection and tap Test server connection; successful verification saves an AES-256-GCM encrypted payload in app-private preferences, with the encryption key held by Android Keystore and usable only while the phone is unlocked. No plaintext pairing preferences or automatic session start are added. Android backup remains disabled.

To verify on-device storage, stop the session, save a verified connection, force-stop/reopen the companion, and check that fields restore while actions remain unchecked and no session starts. Tap Test server connection again. Then test Forget saved connection: it clears fields, stored data and the Keystore key and stops the local session. Forget does not rotate/revoke the pairing token at the server; another copy of that token remains usable until server credentials change. Unchecking Remember removes the saved copy but leaves current fields/session intact. Storage corruption or key unavailability reports a generic error and requires Forget/re-pair; it never falls back to plaintext. JVM crypto tests do not verify Android Keystore behavior on Samsung hardware; this manual check remains necessary.

The user verified ChatGPT mobile on the S23+ calling status and reading the emulator. A read/tap/read cycle opening Display was also verified through the plugin. This is not yet real S23+ control.

The new Android build restricts reads and normal actions to `com.android.settings`, starts read-only by default, and requires notifications for a session. Optional actions are chosen locally at session start; changing the checkbox does not change an active session. Settings actions can still change sensitive settings: there is no per-setting filter. The separate fixed demo-button command also requires explicit action permission, and can only target its fixed button inside the companion.

A visible notification provides Stop. Losing notification permission, blocking the channel, or dismissing the notification causes the polling loop/next command check to end the local session. Stopping cannot undo an action already dispatched. Notification visibility is checked before command execution; it is not a hard real-time OS watchdog. This notification is not a foreground service: robust Samsung background availability remains unimplemented and must be tested separately.

## Emulator acceptance before real-device installation

1. Run the updated app from Android Studio. Allow notification permission when requested, then tap Enable again. Existing server/gateway/Funnel do not need a restart for this Android-only change.
2. Leave Allow Settings actions unchecked. Enable a five-minute session, open Settings, and ask ChatGPT to read. There should be screen text with no actionable controls.
3. Open another app and ask only for a read. Expect App blocked; no screen text should be returned.
4. Open Settings again. Expand the notification shade, tap Stop session, then check phone_status after the worker's network cleanup. It should become inactive. A network failure can delay server revocation until its own expiry; local access is revoked immediately.
5. For an optional navigation test, enable a fresh session with Allow Settings actions checked. Read/tap Display/read, without changing settings. Stop afterward.

## Private connection from the real phone

The public OAuth gateway and the private Android bridge use different external ports on the Windows Tailscale hostname:

| Listener | Audience | Local target |
| --- | --- | --- |
| HTTPS 443 /mcp | ChatGPT via public Funnel and OAuth | OAuth gateway 127.0.0.1:8789 |
| HTTPS 8443 | Phone inside your tailnet, pairing bearer still required | Android bridge 127.0.0.1:8787 |

Tailscale Serve is private to the tailnet; Funnel is public. See https://tailscale.com/docs/reference/tailscale-cli/serve and https://tailscale.com/docs/features/tailscale-funnel. Never enable Funnel on 8443 for this bridge. The Windows Node.js listener stays bound to loopback; do not bind it to 0.0.0.0 or open router ports.

1. Install Tailscale on the S23+ and sign in to the same tailnet as Windows. Keep it connected; it uses Android's VPN slot and may conflict with another VPN. Tailnet policy must allow that phone to reach the Windows host's 8443 service.
2. Inspect Windows configuration:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' serve status --json
```

Verify 8443 has no existing route or public AllowFunnel entry before configuring it; do not reset unrelated routes. Existing public 443 -> 8789 remains in place.

3. In a separate terminal, start a foreground private proxy:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' serve --https=8443 http://127.0.0.1:8787
```

The output must say available within your tailnet, not available on the internet. Keep this terminal open. Inspect status JSON afterward: there must be no true AllowFunnel entry for 8443. This guide does not automatically alter any routes.

4. Stop the emulator's session. The server permits only one device session at a time.
5. Transfer/install the newly built debug APK on the S23+ using your chosen file transfer or Android Studio. Initial installation is separate from everyday cable-free use. Only enable installation for the specific installer if Android asks, and turn it back off afterward. Follow Samsung's accessibility settings/confirmation for this personally built app; if unavailable, report the exact restriction rather than disabling broader device protection.
6. In the real companion use `https://your-host.your-tailnet.ts.net:8443` as the server address (replace hostname if Windows changes). Enter the current server's pairing token; never use the MCP token or OAuth owner key. Test connection before enabling accessibility/control.
7. Enable accessibility and notifications. Leave actions unchecked; start a five-minute read-only session and open Settings. The same-phone ChatGPT UI is blocked from reading; switch back to Settings promptly after submitting a read request, or initiate the read from a second client for the first test. Same-phone scheduling/app switching is not yet solved by a task runner.
8. Confirm the returned screen is from the physical S23+, test notification Stop, and only then consider explicit Settings navigation tests. Real-device installation, private route, reads, stop notification, and Samsung background behavior remain manual acceptance checks.

The Windows host must stay awake and online. Automatic startup, durable credentials, long-running background operation, and an always-on replacement for the development PC remain pending.
