# Tailscale Funnel with Node.js on Windows

## Selected deployment

ChatGPT mobile -> public HTTPS Tailscale Funnel -> authenticated Node.js MCP endpoint on Windows -> local Android bridge -> emulator (real phone integration pending).

The Node.js server already runs on Windows. Funnel replaces OpenAI Secure MCP Tunnel, not the server or Android companion. This connection path does not use an OpenAI tunnel ID or runtime API key. The current server makes no model API calls.

The Windows host must remain on and awake while serving requests. Automatic startup can remove manual terminal startup, but cannot make an offline host available. An always-on Windows host is needed to keep the everyday development computer off.

## Current blockers

- User confirmed Tailscale installed/signed in and standalone Node.js installed on Windows.
- A separate single-owner development OAuth gateway now listens on loopback port 8789 when launched. It publishes discovery metadata, supports dynamic registration for HTTPS ChatGPT callback paths, requires S256 PKCE and an owner approval key, issues one-hour access tokens and rotating refresh tokens with a 24-hour lifetime, and supports family revocation. Registration also expires after 24 hours; reconnect/re-register if necessary.
- The gateway accepts only its configured public Host or its loopback Host and rejects foreign Origins. It forwards authenticated MCP requests to 8788 using the local MCP token. The original MCP Host/Origin checks remain unchanged. Actual Funnel proxy headers and ChatGPT callback paths must still be verified.
- Do not select No authentication and remove the server's bearer check. Funnel is internet-accessible, not restricted to tailnet members.
- Do not publish port 8787: it is the separate Android pairing/session bridge.

## Windows preparation

1. Install Tailscale using https://tailscale.com/download/windows and sign in through its Windows application.
2. Open a new PowerShell terminal and verify installation/account connectivity:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' version
& 'C:\Program Files\Tailscale\tailscale.exe' status
```

3. Stop the old OpenAI tunnel terminal with Ctrl+C. Leave the local Node.js server/emulator available for local testing.
4. Start Node.js if needed:

```powershell
Set-Location 'C:\path\to\android-agent'
powershell -ExecutionPolicy Bypass -File '.\scripts\start-server.ps1'
```

## Start the OAuth gateway

Leave the existing Node.js server running. In a second terminal run:

```powershell
Set-Location 'C:\path\to\android-agent'
powershell -ExecutionPolicy Bypass -File '.\scripts\start-funnel-gateway.ps1'
```

The launcher reads the signed-in Tailscale device's DNS name to determine the public HTTPS origin; override with `-PublicOrigin https://your-host.your-tailnet.ts.net` if necessary. Enter the current local MCP bearer token in the hidden prompt. The launcher verifies the local MCP handshake before starting the gateway. It prints the ChatGPT Server URL and a new owner approval key. Keep that key private and enter it only on the authorization page at your own HTTPS hostname when connecting ChatGPT. No OpenAI runtime key is involved.

All OAuth state is in memory. Restarting the gateway invalidates every client, code, and token; restarting the main server rotates its MCP token, so also restart the gateway with the new token. Public endpoint, owner login, and ChatGPT mobile integration remain unverified. This gateway is a development implementation, not a completed multiuser identity service or an independently audited security boundary.

## Funnel activation

These are deployment commands, not evidence of a configured or working ChatGPT connection. Review existing configuration first:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' funnel status
```

With the authenticated MCP endpoint ready and existing routes reviewed, the supported foreground proxy command is:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' funnel 8789
```

Follow the Tailscale enablement instructions if Funnel/HTTPS permissions are not configured. The printed HTTPS hostname plus `/mcp` is the ChatGPT Server URL; it must match the hostname shown by the gateway. Use Server URL rather than Connection: Tunnel and select OAuth. Leave client credentials blank for dynamic public-client registration if the UI allows. Approve the owner login at your own hostname with the key printed by the gateway. If the callback is rejected, inspect the actual callback path; do not broaden the allowlist to arbitrary domains. Ctrl+C ends a foreground Funnel. Background/service startup is a later deployment step, not configured here. Do not point Funnel directly to port 8788 or the device bridge on 8787.

## Verification gates

1. Local MCP regression tests pass with bearer authentication retained.
2. Public unauthenticated tool requests are rejected; OAuth discovery and the owner login flow work.
3. A public MCP client can initialize/list tools with valid credentials; invalid/revoked credentials fail.
4. ChatGPT can call phone_status through Funnel.
5. An owner-enabled emulator session supports a read/action/read cycle.
6. Automatic startup and recovery are tested on the chosen always-on Windows host.

References: https://tailscale.com/docs/reference/tailscale-cli/funnel and https://developers.openai.com/api/docs/guides/custom-mcp-server.
