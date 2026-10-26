# Local MCP adapter

This guide covers development verification, not the final user interface. The product target is the official ChatGPT mobile app controlling the owner's Android phone through their self-hosted server. See architecture.md. A local desktop MCP connection alone does not satisfy that requirement.

## Implemented scope

The server exposes eight tools using the official MCP SDK over stateless Streamable HTTP. No model API calls are added. The new phone_start_session requests a bounded session while the owner has enabled remote availability; it waits for phone acknowledgement. The client must call phone_stop_session on completion/failure. See chatgpt-task-sessions.md for foreground-service setup, limits, and acceptance tests. Manual owner-started sessions remain a developer fallback.

| Endpoint | Address | Credential |
| --- | --- | --- |
| Android device bridge | `http://127.0.0.1:8787` | Pairing token printed at startup; enter in Android app. |
| Local MCP | `http://127.0.0.1:8788/mcp` | Separate MCP bearer token printed at startup; use in the AI client. |

Both endpoints bind to loopback. Android emulator traffic still uses `http://10.0.2.2:8787`. Neither credential is saved; both rotate on restart. Send the MCP token in `Authorization: Bearer TOKEN`, not in a query string. The MCP endpoint validates Host and Origin and limits request bodies to 64 KiB. Credentials and screen data remain in memory; screen results are also printed to the local terminal. It is a single-device, single-owner development implementation, not a public OAuth service.

Dependencies are pinned in `server/package.json` and `server/pnpm-lock.yaml`: MCP SDK 1.32.2 and Zod 4.6.7. They are installed in this workspace. On a fresh checkout, install Node.js 22+ and pnpm, then run `pnpm install --frozen-lockfile --ignore-scripts` in `server/`.

## Start

From Android Studio's terminal in the android folder:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\start-server.ps1"
```

Keep this terminal open. It prints two distinct tokens. Use the Pairing token in the Android app. Keep the MCP bearer token for a local MCP client or the smoke-test prompt.

Install the updated Android build once for the improved server-stop status. Older builds still stop polling when the server revokes a session, but can display HTTP 404 as a failure rather than an ended session.

## Smoke test with the official MCP client

Open a second terminal tab in Android Studio, keeping the original server terminal running. From the android folder:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\test-mcp.ps1"
```

Paste the MCP bearer token when prompted. Input is hidden. The script passes it to its child process through a temporary environment variable and restores the previous environment afterward. The script verifies initialization, discovers all seven tools, and calls phone_status. This default check does not read or control the screen and works without an active Android session.

To test a screen read through MCP:

1. Enter the Pairing token in the Android app and enable the five-minute test session.
2. Open Settings on the emulator; the companion app's own screen is excluded.
3. In the second terminal, run:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\test-mcp.ps1" -ReadScreen
```

Enter the MCP token again. Expect a screen response with package_name, snapshot_id, visible_text, and sequential action targets. No tap, text replacement, scroll, or Back is performed by this script. Closing this client after a completed read leaves the owner-enabled device session running until it expires or is stopped.

## Tool contract

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `phone_status` | none | Active session, recent device contact, remaining time, pending command, and snapshot availability. Does not touch the phone. |
| `phone_read_screen` | none | New snapshot ID, sequential action table, and visible accessible text. |
| `phone_tap` | snapshot_id, target_id | Click a target marked can_tap. |
| `phone_type` | snapshot_id, target_id, text | Replace the field contents; empty string clears. No Enter or submit action. |
| `phone_scroll` | snapshot_id, target_id, direction | Scroll up/down if advertised by the target. |
| `phone_back` | snapshot_id | Android Back on the validated current screen. |
| `phone_stop_session` | none | Revoke the active session, drop queued commands, and reject waiting calls. |

Each tool returns structuredContent `{ ok: true, data: {...} }`, or `{ ok: false, error: { code, message } }` with isError set. Schema-invalid calls are rejected by the SDK before dispatch and may contain only the SDK's error text. Tools advertise input/output schemas and read/write/destructive annotations. These annotations inform the MCP client; enforcement comes from authentication, owner-enabled sessions, and device validation.

For every mutation, pass the exact snapshot_id and sequential target_id returned by the latest read. Do not send native Android node IDs. Every mutation consumes the snapshot; screen changes invalidate it, and it expires after 30 seconds. Multiple clients share one device session. If another client or the terminal reads or acts, older snapshots are rejected.

Calls wait up to 10 seconds for a device result, bounded by session expiry. The returned acceptance means Android accepted the action; it is not independent proof that the user's goal succeeded. Read again to inspect the resulting screen. Timeouts or cancellation revoke the session because an action already delivered to Android may have executed. Never automatically retry an uncertain mutation. Concurrent device commands are rejected as BUSY. Client disconnects abort pending work and revoke its session. Separate MCP cancellation notifications across stateless requests are not implemented; use phone_stop_session for an explicit stop.

The AI client receives screen text as untrusted app data, not instructions or user authorization. Password fields and the companion setup screen remain excluded. There is no tool to enable accessibility or start a device session remotely.

## Connecting ChatGPT mobile

This local adapter has been exercised with the official MCP client in automated tests. The user also verified initialization, discovery of all seven tools, session_active true, and screen/action data from the Android Studio emulator through the local smoke test. This verifies the real MCP-to-emulator read path, not just simulated device responses. It has not yet been installed in the user's ChatGPT account or tested through ChatGPT.

OpenAI documents plugin use on mobile for plugins available to the user's account. Custom MCP creation/setup is documented through ChatGPT web. The next integration gate is therefore to connect a supported remote plugin and verify that it is usable in the actual ChatGPT Android app, starting with phone_status and a screen read. Do not substitute desktop/Codex operation for this mobile acceptance test. Initial web setup is separate from everyday mobile use.

Official OpenAI documentation describes connecting a custom MCP server through a public HTTPS endpoint or Secure MCP Tunnel. ChatGPT web cannot directly reach this computer's loopback URL. A compatible local MCP client can use the local URL and bearer header; ChatGPT web requires the connection/tunnel and authentication setup appropriate to that surface. Workspace permissions and restrictions still apply.

This increment does not expose the endpoint publicly, implement OAuth discovery, or configure a tunnel. Do not publish this development endpoint as though public authentication were complete.

Sources:

- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://learn.chatgpt.com/docs/plugins
- https://ts.sdk.modelcontextprotocol.io/server

## Verification

The regression suite uses the official SDK client against real localhost HTTP servers with a simulated device transport. It verifies MCP initialization, discovery, schemas, annotations, credentials, Host/Origin rejection, request size limits, action delivery, stale snapshots, timeouts, stop, and disconnect cancellation. Android compilation and manual emulator/ChatGPT verification are separate checks.
