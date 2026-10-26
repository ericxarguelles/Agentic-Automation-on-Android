# Set up your own Windows Node.js server

Use your own Windows computer, Android phone and Tailscale account. The project
contains no shared pairing token or owner approval key. Each installation creates
its own random credentials. No model API key is required for the MCP relay itself.
The connected assistant chooses the actions.

## 1. Install prerequisites

- Install Node.js 22 or later and pnpm. Check `node --version` and `pnpm --version`.
- Install Tailscale on Windows and Android and sign in to the intended tailnet.
- Install Android Studio/JDK 17 if building the APK from source. Install Android
  SDK platform 35, then run `./gradlew.bat assembleDebug` inside `android`.
- Keep this server online and awake while using phone automation.

Official downloads: [Node.js](https://nodejs.org/en/download) and
[Tailscale](https://tailscale.com/download). Review project code before running it.

## 2. Install the server dependencies

Open PowerShell in your own project folder. All following commands are relative
 to that folder; do not copy another person's Windows path.

```powershell
Set-Location 'C:\path\to\android-agent'
Push-Location .\server
pnpm install --frozen-lockfile --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
Pop-Location
```

## 3. Start the managed server once

Make sure no older instance of this project's server is already running.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1
```

This is a per-process script-policy setting, not a permanent change to Windows
execution policy. Do not run the command as Administrator unless your own system
setup explicitly requires it.

The launcher reads **your** Tailscale machine hostname and creates
`work/windows-stack/settings.dpapi` encrypted for the current Windows account.
It generates four independent values: device pairing token, local MCP bearer
 token, owner approval key and OAuth state-encryption key. It does not print
credentials during a normal launch. It starts these loopback listeners:

| Listener | Purpose | External access |
| --- | --- | --- |
| 8787 | Android device bridge | Private Tailscale HTTPS 8443 only |
| 8788 | Internal MCP server | Loopback only |
| 8789 | OAuth MCP gateway | Public Tailscale Funnel HTTPS 443 |

Tailscale may ask you to enable HTTPS/Funnel for your account. Complete its own
flow and rerun if needed. The launcher checks existing routes and refuses to
replace conflicting ones. Never expose the device bridge on public Funnel,
open these ports through your router, or remove bearer/OAuth authentication.

Keep this terminal open for a foreground server. Optional login startup is
explained below. If startup fails after configuring one route, inspect Tailscale
status before retrying; routes may persist even when Node.js stops.

## 4. Obtain YOUR pairing token and owner approval key

Open a **second, private PowerShell terminal** in the same project folder,
under the same Windows account:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1 -ShowSecrets
```

This reads your encrypted local settings. It does not start another server or
replace existing credentials. It prints three labelled values:

```text
Android address: https://YOUR-MACHINE.YOUR-TAILNET.ts.net:8443
Pairing token: [YOUR PRIVATE RANDOM TOKEN]
Owner approval key: [YOUR PRIVATE RANDOM KEY]
```

The bracketed text above is explanatory; no real credentials are included here.
Do not run this while screen-sharing, recording, using a shared terminal, or
saving a terminal transcript. Close this terminal after setup. Do not paste its
output into chat, GitHub, screenshots, logs or an issue.

| Value | Where to use it | Where NOT to use it |
| --- | --- | --- |
| Android address | Android Agent > Settings > Server connection | Not the assistant's MCP URL |
| Pairing token | Android Agent's pairing-token field | Not an OAuth client secret |
| Owner approval key | Approval form at your own server hostname during assistant connection | Not the phone token or an assistant chat message |
| Local MCP bearer token | Internal server-to-server forwarding, managed automatically | Not needed for normal phone/assistant setup |
| OAuth state-encryption key | Managed automatically in encrypted settings | Never enter it into a client |

## 5. Connect the phone

Install the APK on the phone you own. Open Android Agent > Settings and enter
**your Android address and pairing token** from the preceding command. Enable
Android Agent accessibility and notification permissions locally. Connect and
verify that the single server card says Connected. Optional saved configuration
is encrypted on the phone. Keep Tailscale connected on the phone.

The phone must be unlocked for control. Notes, Google Authenticator, Microsoft
Authenticator and the companion credential screen remain excluded. The local
availability switch and notification Stop revoke phone access.

## 6. Connect the assistant

Use the public address printed by your server, ending in `/mcp`:

```text
https://YOUR-MACHINE.YOUR-TAILNET.ts.net/mcp
```

Use OAuth when adding the MCP connection. Dynamic client registration generates
client credentials as required; **do not enter the owner approval key as an
OAuth client secret**. Complete the approval flow only if you initiated it.
Check that the owner-key form is served from your own HTTPS hostname before
entering your owner approval key. Never type it into the assistant conversation.

If automatic registration fails, retain authentication and inspect the failure;
do not switch to No authentication. Callback support and available custom apps
vary by assistant. See [Gemini notes](gemini-connection.md). Refresh tools after
server updates and start a new chat. Begin with a simple read-only request such
as opening Settings and reading the Android version, then verify local Stop.

## 7. Check routing and server status

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1 -Status
```

Expect loopback listeners on 8787/8788/8789, public HTTPS 443 forwarding only to
8789, and private HTTPS 8443 forwarding only to 8787. There must be no public
AllowFunnel entry on 8443. Status is diagnostic; a successful connection and a
verified phone operation provide separate end-to-end evidence.

## Manual startup and stopping

Disconnect in Android Agent to stop phone access. For a foreground Windows
server, press Ctrl+C in its own terminal. Closing an unrelated terminal does not
stop a background host. Stop only this project's identified process/task.
Tailscale routes remain configured even after Node.js stops; disabling all
Tailscale configuration may disrupt other services and is not the normal stop.

Restart using the same launcher and Windows account. Pairing and unexpired OAuth
grants persist; active sessions and snapshots do not. A user-requested launch or
screen read starts a bounded session automatically when availability is ready.

Server startup is manual only. The launcher runs once in the foreground and does
not restart the server after exit. The former -Unattended option is rejected;
the startup installer no longer creates login tasks. Its -Remove option remains
available to remove a previously installed task. Removing a task does not stop
existing processes or remove saved Tailscale routes. Assistants must wait for an
explicit user request before starting or restarting the server.
## Credential storage and recovery

`settings.dpapi` is Windows-account/machine scoped. The managed gateway saves
OAuth state encrypted in `work/windows-stack/oauth-state.bin`. Never commit or
casually copy these files. A different Windows account or server needs new setup
or a reviewed migration; don't reuse another person's state.

Owner-key/pairing-token exposure requires credential rotation and re-pairing,
not just a restart. This project does not yet provide a one-command rotation
workflow. Stop the server and phone access, retain private backups only if needed,
and follow a reviewed reset of the installation's encrypted settings and OAuth
state before reconnecting clients. Never restore stale OAuth state to undo a
revocation. Access tokens expire after one hour; registrations and refresh tokens
have their own 24-hour limits. Reconnection may be necessary after expiry.

