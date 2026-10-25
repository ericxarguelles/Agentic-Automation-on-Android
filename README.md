# Android Phone Control

A self-hosted project that lets a person ask the official ChatGPT mobile app to perform tasks on their own Android phone, following the original iPhone Phone Control project's user experience. Initial device target: Samsung Galaxy S23+ and newer phones. The companion service runs on the phone; the self-hosted server coordinates execution. See docs/architecture.md for the product contract and remaining milestones.

The everyday target is ChatGPT mobile -> authenticated self-hosted server -> Android companion service. Terminal commands, the emulator, and local MCP clients are development tools. Normal use needs no cable or foreground companion screen; the Windows server must stay running. Background availability and mobile authentication are implemented. Independent server-side AI task execution remains a future milestone.

## Project layout

| Folder | Purpose |
| --- | --- |
| `android/` | Native Kotlin companion app, accessibility service, and Android app tests. |
| `server/src/mcp/` | Tools exposed to ChatGPT and other MCP clients. |
| `server/src/agent/` | Screen observation, action selection, and task execution. |
| `server/src/devices/` | Phone connections and session management. |
| `server/src/security/` | Authentication, device pairing, and authorization. |
| `server/test/` | Server tests. |
| `shared/protocol/` | Shared message definitions between the phone and server. |
| `docs/` | Architecture, setup instructions, and design decisions. |
| `deploy/` | Self-hosted server deployment configuration. |
| `tests/integration/` | Tests covering the phone/server connection. |
| `scripts/` | Development and setup helpers. |
| `work/` | Temporary local files; excluded from Git. |
| `outputs/` | Generated deliverables, such as APKs; excluded from Git. |

## Current status

**0.6.0:** companion **Speak a task → editable transcript → Continue in ChatGPT** using on-device speech recognition. You select Android Agent and send the reviewed task in ChatGPT; no API worker or auto-send added. Screen reads now include roles, resource IDs, bounds, state, nearby text and conservative Instagram hints. Target validation tolerates unrelated feed changes while rejecting changed controls. See [voice and navigation setup / file changelog](docs/voice-and-navigation.md). Real S23+ dictation and Instagram acceptance remain pending; 52 server tests and 16 Android JVM tests pass. This supersedes older setup notes below.

**Android 0.5.0:** new dark **Android Agent / AI Phone Automation** Home page, top-right Settings gear, connection controls and animated session status. Accessibility, encrypted saved connections and the default-On availability switch are in Settings. An explicit Off is remembered; actual readiness is shown separately. Availability can resume after verification when the app is opened, with no boot startup. See [current Android UI setup and file changelog](docs/android-agent-ui.md). This supersedes the Android UI/setup portions of earlier guides below. Server behavior and tools are unchanged.

Version 0.4.0 adds one **Agentic control On/Off switch**. Turning it on enables reading and actions together for Settings, YouTube, Instagram, LinkedIn, Google Messages and Samsung Messages. There are no per-app checkboxes or manual five-minute session button. See [current setup, file changelog and acceptance test](docs/agentic-control.md).

ChatGPT starts and stops task sessions while availability remains on between tasks. Each task still has a five-minute maximum and 60-second idle expiry. The notification Stop or switching control off disables availability and task access. Phone/app restarts require turning control on again. Access to unknown apps and the companion's credential screen remains blocked.

The Windows Node.js host and Tailscale must remain running. Windows startup stays manual by default. Pairing is saved encrypted only after a verified connection when Remember is selected. The managed stack preserves unexpired OAuth grants across restart. See [Windows host setup](docs/windows-startup.md).

The local MCP adapter exposes ten tools, including direct named-app launch and snapshot-bound directional swipe. Swipes are single strokes inside visible targets; arbitrary coordinates, pinch and multi-touch are not implemented. Android launch restrictions and app accessibility can limit tasks. ChatGPT is the planner; no independent server AI worker is implemented.

Validation: 47 server tests and 7 Android JVM tests pass; APK builds. Earlier S23+ Settings navigation and remote start/read/tap/verify/stop were user-verified. Version 0.4.0 switch behavior, social/messaging app launch and gestures still need S23+ acceptance. Older setup guides and changelog entries describe earlier milestones; use the current setup linked above.

## First milestone

1. Create a Kotlin Android app that builds and installs on the S23+.
2. Add an owner-enabled accessibility service and a visible way to stop control.
3. Connect the phone to the self-hosted server using authenticated messages.
4. Prove screen observation and a single tap on a real device.
5. Expose task submission, status, and stop tools through MCP.

The phone owner grants access during setup. Tasks must report when the device is locked or a screen cannot be accessed. ChatGPT integration and the server's model provider are separate configuration choices.

