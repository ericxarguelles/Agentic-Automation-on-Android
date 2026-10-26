# Local connection test

> The current companion restricts access to Android Settings and defaults to read-only. To test clicks, text, scrolling, Back, or the fixed demo button, explicitly check Allow Settings actions before starting a new session. Notifications must be enabled; the session notification includes Stop. See real-phone-test.md for the updated acceptance steps.

This milestone supports an authenticated handshake and an optional five-minute test session, restricted to Android Settings. The manual development server rotates pairing tokens on restart; the managed Windows stack preserves them. The companion can optionally remember a verified connection using encrypted Android Keystore storage; it does not save by default or start sessions automatically.

## Read visible screen elements

Restart the server after updating its source, and install the updated app if Android files changed. Enter the new token. Enable the accessibility service, then tap Enable 5-minute test session. Open Android Settings on the emulator. In the server terminal, type `read` and press Enter. The server prints a compact screen action table with sequential IDs, supported actions, and labels. Type `details` to inspect the raw accessible text, descriptions, flags, and bounds from the most recent result. This is an accessibility tree, not a screenshot. Some app content is not accessible.

## Terminal IDs

The table assigns one sequential ID per actionable node: 1, 2, 3, and so on. A field that supports both tap and type uses the same ID for both. Containers marked scroll list the available directions. The server translates table IDs back to the device's native node IDs before dispatching a command; device snapshot validation is unchanged.

IDs are snapshot-local aliases, not permanent element identifiers. They remain gap-free even when passive tree nodes are omitted, but adding/removing/reordering actionable controls can change their IDs on the next read. Always use the latest table. Queuing a read or action clears the current aliases until a new read succeeds.

`details` prints the last raw device result locally without sending a command or consuming the snapshot. Native IDs in diagnostic output are not the IDs to use in terminal commands. Default output omits the raw JSON tree to reduce clutter.

Return to the companion app and tap Stop test session to stop early, or wait five minutes for expiry. Disabling the service also stops the session. The companion app's own screen is excluded from reads to avoid exposing its pairing field; password nodes are excluded. Other visible information can still be sensitive. This development server prints results to the terminal and does not write them to a file. Sessions do not survive app process termination. There is no foreground service or production background connection yet.

## Test a single click

1. Start the updated server and install the updated app.
2. Enter the current token, enable accessibility if necessary, and enable a five-minute test session.
3. Tap Open single-tap test screen. Leave this screen visible.
4. In the server terminal type `tap` and press Enter.
5. Confirm Test taps: 0 becomes Test taps: 1 on the emulator.
6. Tap Stop test session on the demo screen. A later `tap` should produce no click.

The bare `tap` command uses ACTION_CLICK on the demo button found by its resource ID, rather than a coordinate gesture. Other apps and the setup screen do not contain this demo target and are rejected for this command. The terminal's accepted result means Android accepted the accessibility action; the counter is the visual check that the click happened. Commands are delivered once, without automatic retries. The session manager retains the filename ReadSession.kt for now.

## Click a numbered screen element

1. Restart the server, update the app, enter the new token and enable a test session.
2. Open the emulator's Android Settings app.
3. Type `read` in the server terminal.
4. Find a row marked tap in the screen action table. Labels combine the control's text and child labels. Pick a navigation row such as Display and note its ID.
5. Within 30 seconds, type `tap 7`, replacing 7 with that row's actual ID. Choose a navigation row such as Display for the first test.
6. Confirm Settings opens the chosen page. Run `read` again before the next click.

Every click attempt consumes the device snapshot. Server-side validation also prevents reusing a consumed snapshot. The app rejects changed windows, expired snapshots, changed accessibility trees, missing or changed nodes, invisible or disabled targets, and locked devices. Window/content/scroll/click/text events invalidate the stored snapshot. Truncated trees cannot be clicked. If a target is rejected, run `read` again and use its new IDs. These checks reduce stale clicks; Android does not offer an atomic read-and-click transaction, so a concurrent screen change can still race with execution.

The click command is general: it can activate controls in other apps, including controls that change settings. The user starts each short session manually; there is no AI agent or automatic sequence yet. The companion app remains excluded from screen reads to protect its pairing field.

## Back and scroll

All navigation commands require a complete `read` from the current screen, less than 30 seconds old. Each action consumes that snapshot. Wait for the action result, then run `read` again before any further navigation.

| Command | Behavior |
| --- | --- |
| `read` | Read the current screen and generate a new snapshot. |
| `details` | Print the last raw result locally; does not refresh or consume the snapshot. |
| `tap ID` | Click a visible, enabled, clickable element. |
| `type ID "text"` | Replace the contents of an editable non-password field. |
| `scroll ID down` | Scroll a listed container down/forward. |
| `scroll ID up` | Scroll a listed container up/backward. |
| `back` | Send Android Back from the validated current screen. |
| `tap` | Click only the fixed demo button; no screen read required. |

After `read`, look for a table row marked scroll down or scroll up/down. Type `scroll 5 down`, replacing 5 with that row's actual ID. Only advertised directions are accepted. Directional scroll actions are preferred; containers exposing only forward/backward scrolling use that fallback. On horizontal or unusual widgets those generic actions may navigate pages rather than move vertically. At a list boundary Android may reject a scroll. Run `read` again to discover the current capabilities.

Manual emulator test:

1. Restart the server, install the updated app, enter the new token, and enable a test session.
2. Open Android Settings. Run `read`, then `scroll ID down` using a listed container ID. Verify the visible rows change.
3. Run `read` again. If up is advertised, use `scroll ID up` and verify the rows move back.
4. Run `read`, then `tap ID` on a navigation row, such as Display.
5. On the resulting page run `read`, then `back`. Verify the previous Settings page opens.
6. Try `back` again without another `read`. It should be rejected for lacking a recent snapshot.
7. Stop the session in the app. Later navigation commands must be rejected.

## Text replacement

`type ID "text"` uses Android's ACTION_SET_TEXT to replace the field's entire contents. It does not append text or send Enter/IME submit. Some apps react immediately to field changes, for example by showing search results. The operation requires an editable, visible, enabled, non-password field advertising ACTION_SET_TEXT and a fresh complete snapshot. The device checks those conditions again immediately before execution. Password nodes are excluded from screen reads.

Manual emulator check:

1. Restart the server, install the updated app, enter the current token, and enable a test session.
2. Open Settings and tap its search box. Wait for the keyboard/layout to settle.
3. Type `read` in the server terminal. Find a search field marked type in the screen action table. The Settings home screen's Search Settings row is a launcher, not an editable field: tap it first, wait for the search UI to open, then run read again. If no editable field is present, the terminal explains this explicitly.
4. Type `type 12 "display"`, replacing 12 with the field's actual ID. Verify the search field displays display and that results appear if Settings searches automatically.
5. Run `read` again. Use the new field ID in `type 12 ""` to clear the search field.
6. Confirm a second `type` without a fresh read is rejected.

The argument must be a JSON string: use double quotes, `\"` for embedded quotes, `\\` for a literal backslash, and `\n` for a newline. Empty text clears the field. Text is limited to 1000 UTF-16 code units (JavaScript/Kotlin string length); NUL characters are rejected on both server and device. Length includes two code units for many emoji. IDs must be non-negative safe integers.

The terminal acknowledges the operation without printing its text payload, but your typed command remains visible in the terminal and subsequent screen reads can contain the field's text. Returned screen text is capped at 500 code units per node. No clipboard, keyboard simulation, or automatic submit is used.

Android API reference: https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo#ACTION_SET_TEXT

## Start the computer server

In a PowerShell terminal opened in the project root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-server.ps1
```

Keep that terminal open. It prints a temporary pairing token. Do not post the token publicly. Stop the server with Ctrl+C.

## Update the app

In Android Studio run the app again to install the updated build.

For the Android Studio emulator, leave the server address as `http://10.0.2.2:8787`. Enter the token from the terminal and tap Test server connection.

For a USB-connected real phone, first run the following from the Android SDK platform-tools directory, selecting a device with `-s SERIAL` if multiple devices are attached:

```powershell
.\adb.exe reverse tcp:8787 tcp:8787
```

Then use `http://127.0.0.1:8787` in the app. USB is only for this development test; the intended deployed connection will use HTTPS and private networking.

The expected result is: Connection verified. No control session is active.

## Network boundaries

The test server binds only to the computer's loopback interface. The Android debug build permits HTTP only for localhost, 127.0.0.1, and the emulator's host address. Other addresses require HTTPS, and release builds do not enable the debug HTTP exception. No firewall opening is needed for this local test.
