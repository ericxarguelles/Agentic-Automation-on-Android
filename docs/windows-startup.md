# Getting started

Each user runs their own server and generates their own credentials. You do not connect to the developer’s server.

## 1. Install Android Agent

Download [AndroidAgent-0.8.0.apk](../AndroidAgent-0.8.0.apk) onto your Android 13+ phone and install it.

No Android Studio or app-building tools are needed when using this APK. If updating an existing installation, install over it rather than uninstalling first to preserve saved setup.

## 2. Prepare your Windows computer

Install:

- [Node.js 22 or later — official download](https://nodejs.org/en/download)
- [pnpm — official installation instructions](https://pnpm.io/installation)
- [Tailscale — official download](https://tailscale.com/download)
  
Install Tailscale on your phone too, and sign both devices into your own Tailscale account.

Download and extract this repository onto your Windows computer. Keep this folder in place—it contains your server.

## 3. Install the server dependencies once

Open PowerShell in the extracted project folder and run:

```powershell
cd server
pnpm install --frozen-lockfile --ignore-scripts
cd ..
```

If installation reports an error, resolve it before continuing. Repeat this step when an update changes the server dependencies.

## 4. Start your server and retrieve your credentials

Follow [Windows server setup](https://github.com/ericxarguelles/Agentic-Automation-on-Android/blob/main/docs/windows-startup.md) to start your server and retrieve **your own pairing token and owner approval key**.

Keep your Windows computer awake and the server running while using Android Agent.

## 5. Connect your phone

In Android Agent Settings:

1. Enter your server’s private Tailscale HTTPS address on port 8443.
2. Enter your device pairing token.
3. Enable Android Agent’s accessibility and notification permissions.
4. Connect and confirm the server card says Connected.

## 6. Connect your assistant

Add your server’s public HTTPS address ending in `/mcp` as an OAuth MCP connection.

Complete the approval flow using your owner approval key only on your own server’s approval page. Never paste credentials into an assistant conversation.

Refresh the tools and start a new chat.

## 7. Test it

Ask the assistant to open Settings and read the Android version. Verify that Stop works before trying more involved tasks.

Your phone must be unlocked, Tailscale connected, and your Windows server running.

## Current release status

The provided 0.8.0 APK is a development/debug build. A production release-signing process is still pending.

Owner-key/pairing-token exposure requires credential rotation and re-pairing,
not just a restart. This project does not yet provide a one-command rotation
workflow. Stop the server and phone access, retain private backups only if needed,
and follow a reviewed reset of the installation's encrypted settings and OAuth
state before reconnecting clients. Never restore stale OAuth state to undo a
revocation. Access tokens expire after one hour; registrations and refresh tokens
have their own 24-hour limits. Reconnection may be necessary after expiry.
