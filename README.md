<div align="center">

<p align="center">
  <img src="docs/media/AgenticAutomationChat.png">
  
# Agentic Automation on Android

**Hands-free phone control based in ChatGPT.**

From the ChatGPT assistant/app, whenever you need it. A self-hosted Android accessibility companion with MCP tools controlling your phone whenever, wherever.

![Tailscale](https://img.shields.io/badge/Tailscale-242424?logo=tailscale&logoColor=white)
![Android](https://img.shields.io/badge/Android-13%2B-3DDC84?logo=android&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![Kotlin](https://img.shields.io/badge/Kotlin-2.1.20-7F52FF?logo=kotlin&logoColor=white)

[Get started](docs/getting-started.md) · [Architecture](docs/current-architecture.md) · [Evaluation plan](evals/README.md) · [Results](docs/results.md) · [Roadmap](docs/roadmap.md)

</div>

Android Agent connects a chat assistant to an Android phone through a server you control. The assistant reads accessible screen text and controls, then launches apps, taps, types, scrolls, and verifies what happened. It is designed with hands-free use in mind; usability for blind and low-vision people.

**Status: working prototype, Android app 0.8.0.** The real-phone tool path has been exercised during development. No AndroidWorld score or accessibility usability score has been measured yet. Excels in multi-step tasks compared to native Gemini assistant.

<p align="center">
  <img src="docs/media/task-thinking.png" alt="Emulator preview: a live phone task with request text, thinking progress, elapsed seconds and Stop task" width="280">
  <img src="docs/media/task-history.png" alt="Emulator preview: local task history showing the request and session duration" width="280">
</p>

These are emulator UI previews using a synthetic task. They are not benchmark results.

## What you can ask

- “Open Instagram and tell me my follower count.”
- “Open Messages with Alex and read the latest three messages.”
- “Open SoundCloud and play tuition by Don Toliver.”
- “Open LinkedIn and go to my messages, read the most recent message.”
- “Open Gmail and read out the latest email I've received.”
- "Open Google and search for Penguins"

These illustrate supported workflows, not a guarantee that every app exposes usable controls. A request to read an email or message opens the body and scrolls through its available text; inaccessible portions must be reported.

## How it works

**The assistant is the planner.** The server currently does not run its own model or durable background task worker. The first launch or screen read establishes a session automatically when owner-enabled availability is connected. Screen-bound actions use fresh, single-use snapshots. The phone acknowledges actions and returns observations for verification.

```mermaid
flowchart LR
    A[Chat assistant: decides next action] -->|HTTPS + OAuth / MCP| B[Self-hosted Node.js server]
    B <-->|Private authenticated connection| C[Android companion]
    C --> D[Accessibility screen observations]
    C --> E[Validated UI actions]
```
The per-step loop — accessible screen text and UI controls in, one validated tool call out, a fresh observation back:

<p align="center">
  <img src="docs/media/tool-calling-loop.png">

## Capabilities and limits

| Area | Current implementation |
| --- | --- |
| Observation | Accessible text, roles, state, bounds, resource IDs, nearby text; compact or detailed output |
| Actions | App launch, tap, text replacement, keyboard submit, scrolling, single-stroke swipes, Back |
| Efficiency | Combined action-and-observe tool, compact observations and device/server timings |
| App access | Installed apps except Notes, Google Authenticator, Microsoft Authenticator and the companion setup screen |
| Owner control | Local availability switch, notification Stop, task Stop; locked-device checks |
| Session limits | Five-minute maximum; 60-second idle expiry |
| Connection | Windows host, Tailscale private device route, HTTPS OAuth gateway for the assistant |
| History | Up to 50 encrypted local task requests with session durations; not full chat transcripts |
| Not implemented | Screenshot-based visual agent, arbitrary coordinate actions, pinch/multitouch, independent model worker, benchmark harness |

Blocked-app protection is app-level; it does not filter equivalent content inside an allowed browser. The owner must enable Android accessibility and notifications. The Windows host must stay awake and online. Device reboot, app updates and Android background restrictions may require reconnecting.

## Get started

Follow [the setup guide](docs/getting-started.md) for the Windows server, phone permissions and MCP connection. Build the Android APK from source or use a release only after one has been published. Local generated APKs are not stored in the source tree.

The primary exercised path is the connected MCP tools used in development. Availability in a particular mobile or voice assistant surface must be verified separately. Gemini OAuth compatibility has been added, but broad Gemini/mobile/voice reliability is not established.

## Validation

Latest recorded local checks: **60 server tests**, **17 Android JVM tests**, and an emulator smoke check covering the task UI, timer, encrypted history and clearing. These check implementation behavior; they do not measure autonomous task success. See [results and evidence](docs/results.md).

```powershell
cd server
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

```powershell
cd android
.\gradlew.bat testDebugUnitTest assembleDebug
```

Requirements: Node.js 22+, pnpm, JDK 17 and Android SDK platform 35. The app targets API 35 and supports API 33+. The new GitHub Actions workflow will run after the project is placed in a GitHub repository; no remote CI pass is claimed yet.

## Repository map

| Path | Purpose |
| --- | --- |
| `android/` | Kotlin companion, accessibility service, encrypted history and Android tests |
| `server/src/mcp/` | Tool definitions, local HTTP transport and OAuth gateway |
| `server/src/connection-server.mjs` | Device connection, sessions and validated command delivery |
| `server/src/security/` | Encrypted saved server state |
| `server/test/` | Automated server and simulated-device tests |
| `evals/` | Evaluation protocol and trial record format; no completed benchmark runs |
| `scripts/` | Windows development and deployment helpers |
| `docs/` | Current guides, evidence, limitations and historical implementation notes |

## Security, contributing and attribution

Read [SECURITY.md](SECURITY.md) before exposing a server and [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes. Do not commit credentials, phone contents, recordings or local pairing state.

Inspired by Bryan Ramirez-Gonzalez’s [Agentic Automation on iOS](https://github.com/bryanrg22/ios-agent_automation_info) and [Phone Control](https://github.com/bryanrg22/phone-control). Their architectures and reported results are comparison references, not results for this Android implementation.

**License selection is pending.** No open-source license is granted by this README. Select an appropriate license and review dependency notices before public release.
---
**Eric Xavier Arguelles** · UCI BME '28 · [LinkedIn](https://www.linkedin.com/in/eric-arguelles/) · [GitHub](https://github.com/ericxarguelles)
