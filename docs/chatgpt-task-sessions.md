# ChatGPT-started task sessions

## Implemented flow

Owner enables availability on Android -> foreground service heartbeats to the private bridge -> ChatGPT calls phone_status and phone_start_session -> server queues one start request -> phone validates local availability/accessibility/notification/unlocked state and acknowledges -> ChatGPT reads, selects targets, acts, verifies -> ChatGPT calls phone_stop_session before reporting the result -> phone returns to waiting availability.

ChatGPT itself is the AI action planner in this iteration. There is no separate server-side model API call, durable job, or independent agent continuing after the chat disconnects. Reading uses the accessibility tree, not screenshots; scrolling uses supported accessibility actions, not arbitrary coordinate swipes. Model instructions request cleanup on every success/error/blocked path; hard timeouts cover missing cleanup, but the server cannot independently determine natural-language task completion.

## Install and activate

1. Stop active sessions and install outputs/AndroidPhoneControl-settings-test.apk over the existing companion. Do not uninstall; encrypted pairing remains available.
2. Restart the managed Windows stack with the same launcher. Persistent OAuth state is preserved; old task sessions are not restored.
3. In the ChatGPT plugin, Refresh tools. Confirm phone_start_session is available: the server now exposes eight tools. Reconnect OAuth only if authentication fails.
4. On the phone, confirm accessibility, notifications and private Tailscale connectivity. Leave Allow Settings actions unchecked for the first test. Tap Enable ChatGPT task availability. Status should become ready with a foreground notification showing read-only availability.
5. Leave Settings open and use ChatGPT on your computer for the first test:

```text
Check phone_status. Start a session using phone_start_session, read the current Settings screen without performing any actions, then call phone_stop_session even if the read fails. Report what happened.
```

6. Verify start acknowledgement, read result, then session_active false and remote_availability_enabled true. Submit a second task without reopening the companion.
7. Tap the notification Stop/Disable availability. Verify availability becomes false and phone_start_session returns AVAILABILITY_REQUIRED. Local revocation is immediate; server visibility follows network cleanup or heartbeat expiry.
8. For navigation testing, disable availability, explicitly check Allow Settings actions, then enable availability again. Changing the checkbox during availability does not change its captured permissions. Ask only to open Display/read/stop without changing settings.

The manual five-minute button remains a developer fallback and cannot coexist with availability. In-app Stop test session ends the task but leaves availability enabled. The notification Stop, Disable availability, and Forget buttons disable both.

## Enforced limits

If Enable appears to do nothing, install the identifiable AndroidPhoneControl-0.2.1.apk update and read the availability status beside the button. Startup now allows three seconds for notification posting and retains failure reasons. Stop an existing manual session first. Pairing rejection requires testing the current token; HTTP 409 means another session/availability connection occupies the single-device server. Reconnecting/network messages require checking private Tailscale Serve 8443. No connected device was available during implementation to confirm the original failure's cause.

- Only the owner can enable availability, accessibility, notifications or action permission on Android.
- One availability connection and task session at a time; duplicate starts fail BUSY.
- Start waits up to 10 seconds for phone acknowledgement. Timeout/cancellation revokes the request; starts are not replayed.
- Five-minute absolute task limit on server and phone; 60-second idle timeout for remote tasks without tool commands.
- Five-second heartbeat freshness for new starts; 15-second heartbeat loss revokes availability/remote task state. Local network errors revoke task access before availability reconnects; no automatic action retries.
- Notification visibility/channel/permission and accessibility are checked during polling/execution. Removing them ends availability. An executing action may still finish; Stop is not undo.
- Settings-only Android allowlist and read-only default remain. Enabling actions can change sensitive Settings controls; no per-setting filter exists.
- No boot receiver, sticky restart, or automatically enabled availability after app/phone restart. Windows startup remains manual by default.

## Foreground service and remaining limits

The service starts while the owner is using the app. Android 14+ declares the specialUse foreground-service type with an explanatory subtype; see https://developer.android.com/develop/background-work/services/fgs/service-types. This is a sideloaded development implementation; Samsung battery/background behavior and real service Stop need acceptance testing.

The phone must be unlocked with an allowed screen visible. Using ChatGPT on that same phone hides Settings; automatic app launch/focus handoff is not implemented. For initial testing use a second client or return to Settings promptly after requesting work.

A server restart lets availability reconnect but never restores an old task. The Windows host must stay on. Broader app selection, sensitive-action approvals, task IDs/history, screenshots/coordinate gestures, wake/unlock, and a durable independent server agent are not added here.
