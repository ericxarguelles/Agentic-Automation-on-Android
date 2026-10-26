# Agentic control — 0.4.0

## Install and connect

1. Install outputs/AndroidPhoneControl-0.4.0.apk over the existing companion. Do not uninstall first if you want to retain the saved connection.
2. Stop the old Windows stack with Ctrl+C in its terminal, then restart it:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\android-agent\scripts\start-windows-stack.ps1"
```

3. Open the companion, confirm accessibility and notifications are enabled, and verify the saved private server connection.
4. Turn **Agentic control** on. This enables read, tap, text entry, scroll, Back, direct app launch and directional swipe together. There are no per-app checkboxes. Wait for remote availability to report ready.
5. Refresh tools on Android Agent. The server now exposes ten tools, including phone_launch_app and phone_swipe. If the chat has an old tool list, start a new chat with the connector selected.

## Behavior

The fixed supported list is Settings, YouTube, Instagram, LinkedIn, Google Messages and Samsung Messages. Apps must already be installed and signed in. Turning control on grants access to personal content and message controls in these apps; individual controls are not filtered. Message sending must follow the user's requested recipient and content.

The switch stays on between tasks. ChatGPT checks status, starts a session and waits for acknowledgement, reads/acts/verifies, then stops the session even on failure. Each task retains its five-minute lease and 60-second idle timeout. A future task can start while availability remains enabled. Turning control off or using notification Stop ends the task and availability. App/phone restarts do not automatically re-enable control. A gesture already dispatched may finish after Stop.

The Windows host and Tailscale routes must remain running. The phone must be unlocked; this does not bypass the lock screen, Android permissions, or Android background-launch restrictions. Availability is not a guarantee that Android will keep the service alive indefinitely. ChatGPT is still the planner; there is no independent server AI worker that continues after ChatGPT stops issuing tool calls.

## Swipe scope

phone_swipe takes snapshot_id, target_id and up/down/left/right. Direction is finger motion, not content movement. It dispatches one 350ms stroke inside the target's visible bounds, intersected with the app window. A fresh, complete and unchanged screen and an enabled non-password target are required. No arbitrary coordinates, pinch, multi-touch or arbitrary gesture sequences are implemented. A dispatch acknowledgement does not confirm gesture completion; read again to verify and never automatically retry an uncertain action.

## First acceptance test

Ask Android Agent: "Check status, start a session, open LinkedIn, and read the screen to verify the app opened. Do not tap, type, swipe or send messages. Always stop the session afterward and verify session_active is false."

Then test one scroll/swipe on a known screen, followed by turning Agentic control off and verifying remote_availability_enabled is false. Avoid sending a real message during this initial acceptance test.

## Iteration changelog

- MainActivity.kt: one Agentic control switch replaces availability enable/disable buttons, manual five-minute button, action checkbox and YouTube checkbox. Actions and the fixed supported app set are enabled together only when the owner turns the switch on. Switch follows actual service state. Stop-current-task remains separate.
- SessionPolicy.kt: named app set replaces YouTube-only permission; unknown apps remain blocked. Revocation and task expiry remain enforced on the device.
- RemoteAvailabilityService.kt, ReadSession.kt and SessionNotice.kt: rename scope fields, show supported apps, carry captured scope into task sessions, and handle swipe commands.
- PhoneAccessibilityService.kt: add snapshot-validated directional gesture dispatch within a target.
- AndroidManifest.xml: package visibility for the named apps only. strings.xml describes the new control. build.gradle.kts sets versionCode 5/versionName 0.4.0.
- connection-server.mjs and mcp/tools.mjs: named app launch schemas, fresh-snapshot swipe dispatch and tenth MCP tool. MCP version 0.4.0. oauth-gateway.mjs recognizes swipe in sanitized diagnostics.
- SessionPolicyTest.kt, mcp.test.mjs and oauth-gateway.test.mjs: named-app access/revocation, package restrictions, swipe mapping/directions/snapshot consumption/device rejection, ten-tool discovery.
- README.md and CHANGELOG.md: current behavior, setup and verification status.

Validation: 47 server tests and 7 Android JVM tests pass; assembleDebug succeeds. The first sandboxed test run was blocked by loopback/cache permissions; rerunning with approved access passed. JVM tests do not exercise Android gestures, foreground-service lifetime or real app accessibility. S23+ acceptance of version 0.4.0 is pending. Existing processes were not restarted and no phone actions were performed during this implementation.
