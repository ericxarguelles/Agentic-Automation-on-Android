# Connect the private server to ChatGPT mobile

> Deployment direction changed: use Node.js on Windows with Tailscale Funnel. See [the Windows Funnel guide](tailscale-windows.md) for preparation and remaining authentication work. The OpenAI Secure MCP Tunnel instructions below are historical troubleshooting material; its runtime authentication failed with HTTP 401.

## Current checkpoint

The local MCP-to-emulator read is verified. The remote tunnel and ChatGPT mobile connection are not yet verified. This guide describes the next integration test, not a completed phone-only product.

The supported connection under evaluation is OpenAI Secure MCP Tunnel: an outbound relay from the self-hosted server to OpenAI. It leaves the phone-control MCP listener on loopback and uses the existing tool adapter. For initial development the relay runs beside the local server; in the finished self-hosted deployment both processes run on the always-on server, so a user's development computer is not needed for everyday operation.

## Account prerequisites

1. Sign in at https://platform.openai.com/settings/organization/tunnels using the account intended for ChatGPT.
2. Identify the intended Platform organization and target ChatGPT workspace. Inspect existing tunnels before creating a duplicate. Confirm the tunnel is associated with that organization and workspace.
3. Tunnel creators need Tunnels Read + Manage. The runtime key principal and plugin operator need Tunnels Read + Use. Access to custom ChatGPT MCP plugins is a separate account/workspace permission.
4. Obtain a runtime key scoped for the intended tunnel permissions. Do not use an admin key for the long-running client. Enter keys only in the local hidden prompt, not this repository or chat.

This step needs a tunnel runtime API key even though the local MCP adapter itself uses no OpenAI API. This relay does not implement or invoke the future model-based task worker.

## Install and verify the official client

The project installer queries the latest official openai/tunnel-client GitHub release, selects the Windows architecture, downloads the archive and vendor checksum list, verifies SHA-256, and extracts into the ignored work/tools directory. It does not create an account resource or start a tunnel.

From Android Studio's terminal in the android folder:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\install-tunnel-client.ps1"
```

During this implementation, official tunnel-client v0.0.18 was downloaded and checksum-verified. Its quickstart and diagnostic CLI help were inspected. Keep installation tied to the latest supported release; do not assume that version remains current indefinitely.

## Start the relay after account association is verified

1. Keep the existing phone-control server running. Its local MCP endpoint is http://127.0.0.1:8788/mcp.
2. In a second terminal, run:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\start-tunnel.ps1"
```

3. Enter the tunnel ID from Platform.
4. At the first hidden prompt enter the running server's MCP bearer token. The script verifies local discovery/status before requesting the Platform key.
5. At the next hidden prompt enter the tunnel runtime API key.
6. The launcher runs tunnel-client doctor --explain, then starts the foreground relay only if diagnostics pass. To run diagnostics without starting the relay, add -DoctorOnly.
7. Keep that terminal open for the development test. A third terminal can check health/readiness:

```powershell
powershell -ExecutionPolicy Bypass -File "..\scripts\check-tunnel.ps1"
```

The local operator UI is http://127.0.0.1:8790/ui. Healthy and ready are separate checkpoints. Neither proves that the mobile plugin works; the final proof is a successful tool call from the mobile conversation.

Secrets stay in the launcher's process environment and are restored on exit. The checked-in profile references environment names only. The launcher pins the OpenAI control-plane origin, MCP loopback URL, and local operator address. No model API key, device pairing token, or admin credential is written to its config.

## Authentication boundary

This prototype is single-owner. The relay supplies the local MCP bearer header only to the configured MCP origin, including its discovery probes. Access through the tunnel depends on the tunnel's organization/workspace associations and the private plugin's allowed users. Every identity allowed to invoke this plugin could act through that local bearer credential during an owner-enabled device session. Verify those associations and visibility before activation.

The tunnel transport does not implement per-user OAuth for our app. Do not publish this as a multi-user or public phone-control plugin. Broad sharing or public distribution requires caller/device authorization and the corresponding app authentication work. An optional connector-supplied Authorization header overrides the relay's static header; any configured app authentication must be tested explicitly rather than assumed to work.

The existing Android device bridge is not exposed through this relay: only the configured MCP endpoint is relayed. Phone-to-server wireless connectivity remains a separate implementation milestone.

## ChatGPT setup and mobile acceptance test

After the tunnel is ready and correctly associated, open ChatGPT Plugins in the intended account/workspace, add a custom MCP server, and choose Tunnel. Select the verified tunnel. Review the authentication configuration, private visibility, and tool list before completing activation. Account-specific UI and permissions must be inspected; do not guess missing options or bypass discovery failures.

Then use the official ChatGPT Android app on the same account/workspace:

1. Confirm the installed private plugin is available there.
2. Ask it to call phone_status and report whether the device session is active. This is the first read-only remote acceptance check.
3. Enable a test session on the target device, open Settings, then ask ChatGPT mobile to read the visible Settings screen using the plugin.
4. Verify the response came from the real device, not a guessed description.

Initial account setup through a web browser is separate from the intended everyday mobile interface. The current emulator can remain the target for the first mobile-client call; the real S23+ must still be validated afterward. This does not yet remove manual five-minute sessions, implement a task worker, or establish robust Android background operation.

Sources:

- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://learn.chatgpt.com/docs/plugins
