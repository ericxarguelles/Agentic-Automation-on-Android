# Getting started

This guide describes the current Windows-hosted prototype. A clean-machine,
start-to-finish setup rehearsal remains a release gate.

1. Install Node.js 22+, pnpm, Android Studio/JDK 17, and Tailscale. Sign the phone
   and Windows host into the intended tailnet. Keep Windows awake for tasks.
2. In `server`, install the pinned dependencies:
   `pnpm install --frozen-lockfile --ignore-scripts`.
3. Build Android from `android` with `./gradlew.bat testDebugUnitTest assembleDebug`.
   The APK is under `android/app/build/outputs/apk/debug/`. Install it as an update
   without uninstalling the existing app if you want to preserve saved setup.
4. Follow [Windows host setup and credential instructions](windows-startup.md) to start
   `scripts/start-windows-stack.ps1`. It maintains separate device and MCP tokens,
   an owner approval key, and encrypted state. Never put these values in an issue.
5. In Android Agent Settings, enter the host's private HTTPS address on port 8443
   and the device pairing token. Enable accessibility and notification permission,
   connect, and confirm the server card says Connected.
6. Add the host's public HTTPS `/mcp` endpoint to your assistant using OAuth.
   Approve only a connection you initiated. The device bridge stays private;
   public HTTPS routes to the OAuth gateway, not the raw device bridge.
7. Refresh tools, start a new chat, and test an innocuous Settings read. Check
   Stop before trying messaging or other account actions. Keep real-device
   demonstrations separate from benchmark test data.

See [automatic sessions](automatic-sessions.md), [app exclusions](app-access.md),
[task history](task-history-ui.md), and [Gemini connection notes](gemini-connection.md).
Older versioned guides describe earlier behavior; the current architecture and
linked feature guides take precedence for the present implementation.

## Stop and restart

Disconnect in Android Agent stops phone availability. If the Windows server is
in a visible foreground terminal, use Ctrl+C. A separately launched background
host is not stopped by closing an unrelated terminal; identify this project's
managed process before stopping it. Restart using the same managed launcher and
saved Windows account. Pairing and unexpired grants persist; sessions do not.
