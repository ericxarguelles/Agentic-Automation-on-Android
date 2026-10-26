# Getting started

Each user runs their own server and generates their own credentials. You do not connect to the developer’s server.

## 1. Install Android Agent

Download [AndroidAgent-0.8.0.apk](../AndroidAgent-0.8.0.apk) onto your Android 13+ phone and install it.

No Android Studio or app-building tools are needed when using this APK. If updating an existing installation, install over it rather than uninstalling first to preserve saved setup.

## 2. Prepare your Windows computer

Install:

- Node.js 22 or later
- pnpm
- Tailscale

Install Tailscale on your phone too, and sign both devices into your own Tailscale account.

Download and extract this repository onto your Windows computer. Keep this folder in place—it contains your server.

## 3. Install the server dependencies once

Open PowerShell in the extracted project folder and run:

```powershell
cd server
pnpm install --frozen-lockfile --ignore-scripts
cd ..
Owner-key/pairing-token exposure requires credential rotation and re-pairing,
not just a restart. This project does not yet provide a one-command rotation
workflow. Stop the server and phone access, retain private backups only if needed,
and follow a reviewed reset of the installation's encrypted settings and OAuth
state before reconnecting clients. Never restore stale OAuth state to undo a
revocation. Access tokens expire after one hour; registrations and refresh tokens
have their own 24-hour limits. Reconnection may be necessary after expiry.
