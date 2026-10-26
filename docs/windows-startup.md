# Windows server setup

Run these steps on your own Windows computer. Your installation generates its own credentials and uses your own Tailscale address.

Complete the prerequisite installation and dependency steps in [Getting started](getting-started.md) first.

## 1. Open PowerShell in the project folder

Open the extracted repository folder in File Explorer. Right-click an empty area and select **Open in Terminal**.

The folder should contain `android`, `docs`, `scripts`, and `server`.

## 2. Start your server

Make sure Tailscale is connected on Windows, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1
```

On first launch, the script generates your private credentials and saves them encrypted for your Windows account.

If Tailscale asks you to enable HTTPS or Funnel, complete its instructions and retry.

Keep this terminal open while using the server.

The launcher configures:

| Connection | Purpose |
| --- | --- |
| Public HTTPS port 443 | Authenticated OAuth/MCP connection for your assistant |
| Private Tailscale HTTPS port 8443 | Connection from your Android phone to your server |

Do not publicly expose port 8443 or remove authentication.

## 3. Retrieve your pairing token and owner approval key

Leave the server running. Open a second PowerShell terminal in the same project folder, using the same Windows account.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1 -ShowSecrets
```

It displays:

- **Android address:** your private server address, ending in `:8443`.
- **Pairing token:** enter this in Android Agent.
- **Owner approval key:** enter this only on your own server’s authorization page when connecting your assistant.

These are your installation’s credentials. Never upload them to GitHub, include them in screenshots, or paste them into an assistant conversation.

Close this second terminal after setup.

## 4. Connect Android Agent

On your phone:

1. Connect Tailscale using your own account.
2. Open Android Agent Settings.
3. Enter the **Android address** and **pairing token** displayed by your server.
4. Enable Android Agent’s accessibility and notification permissions.
5. Connect and confirm the server card says **Connected**.

Your phone must be unlocked for phone-control tasks.

## 5. Connect your assistant

Use your server’s public HTTPS hostname with `/mcp`.

For example, if your Android address is:

```text
https://YOUR-MACHINE.YOUR-TAILNET.ts.net:8443
```

Your assistant’s MCP URL is:

```text
https://YOUR-MACHINE.YOUR-TAILNET.ts.net/mcp
```

Replace the example hostname with your own. Do not include `:8443` in the assistant’s MCP URL.

Choose **OAuth** when connecting. During authorization, verify that the approval page belongs to your own server hostname, then enter your **owner approval key**.

The owner approval key is not an OAuth client secret. If automatic registration fails, investigate the error rather than entering that key as a client secret or disabling authentication.

Refresh the tools and start a new chat after connecting.

## 6. Test the connection

Ask the assistant to open Settings and read the Android version.

Verify that the result matches your phone and that Android Agent’s Stop control works.

For server diagnostics, run this in another terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1 -Status
```

## Stop and restart

- **Stop phone access:** tap Disconnect in Android Agent.
- **Stop a foreground server:** press Ctrl+C in its PowerShell terminal.
- **Restart:** run the same startup command from step 2.

Closing an unrelated terminal does not stop a background server.

Saved credentials and unexpired OAuth grants persist across restarts. Active phone-control sessions do not. Keep the project folder in place.

## Keep private files private

Never upload the `work` folder. It contains your installation’s encrypted settings and runtime state.

If credentials are exposed, restarting alone does not replace them. Stop access and rotate the affected credentials before reconnecting.

## Optional: start at Windows login

After manual setup works, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-windows-startup.ps1
```

This schedules startup for your Windows account at login. It does not start the server immediately.

To remove future login startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-windows-startup.ps1 -Remove
```

Removing startup does not stop an already-running server.
