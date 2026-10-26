# Product architecture: ChatGPT mobile drives the owner's Android phone

> Implementation update: foreground availability and phone_start_session now support ChatGPT-directed bounded sessions. See chatgpt-task-sessions.md for current behavior and remaining limits. The independent durable server agent described below is still future work.

## Product contract

The user's everyday interface is the official ChatGPT app on their phone. The user requests a task in natural language; their self-hosted server manages execution on their Android device and returns a result to the conversation. This is the Android counterpart of the original iPhone Phone Control project.

An always-on self-hosted server remains part of the system. No development computer, terminal, cable, emulator, or foreground companion-app screen should be required during normal use. A browser or development machine may be used for initial setup. The first release targets one owner and one device per self-hosted installation; multi-user hosting is not implemented.

```text
Official ChatGPT mobile app
    |
    | Account-connected remote MCP plugin
    v
Authenticated self-hosted server
    |-- task submission, progress, cancellation and result retrieval
    |-- bounded agent worker: observe -> decide -> act -> verify
    |
    | Authenticated private connection, initiated by the phone
    v
Android companion service on the owner's S23+
    |-- accessible screen observations
    |-- validated click, text and navigation actions
    |-- visible session state and local stop control
    v
Apps on the same phone
```

The chat model and the task worker's model are separate concerns. The worker can call a configured model provider; adding that worker may require provider credentials and usage charges separate from a ChatGPT subscription. No model API calls are implemented in the current server.

## Intended task lifecycle

1. After one-time installation, account connection, device pairing, and owner-granted Android permissions, the user submits a phone task from ChatGPT mobile.
2. ChatGPT invokes a high-level task tool on the self-hosted server. The server authenticates the caller and binds the job to that owner's device.
3. The server creates a bounded task and requests a control lease from the already owner-enabled companion service. A lease must not silently re-enable a disabled service or bypass a lock screen.
4. The server worker opens or navigates to the requested app, observes the screen, chooses actions, and verifies their effects. Device snapshots and individual actions retain freshness and single-use validation.
5. Progress and results are retrieved through task tools. Work should not depend on the companion app remaining foregrounded; the target app needs the screen during execution.
6. Completion, stop, timeout, or loss of authorization ends the control lease. The result remains available for retrieval in the ChatGPT conversation. Returning to ChatGPT when allowed is a later device behavior to implement and verify.

Proposed task-level tools, not implemented yet:

- `run_phone_task`: accept the task, validate device availability, and return a job ID promptly.
- `get_phone_task`: return progress, completion, blocked state, or the result for a job.
- `stop_phone_task`: cancel queued work and request an end to active device control.

The existing seven MCP action tools validate the device transport and remain useful for development. They are not the finished everyday user experience. The production task runner must not require users to copy tokens, enumerate IDs, or manually start a five-minute test session for every request.

## ChatGPT mobile integration gate

Official documentation says account-available plugins can be used in ChatGPT mobile, and describes custom remote MCP setup through ChatGPT web. That establishes a supported integration direction; it does not establish that this particular custom plugin is already available on this user's mobile account.

Before building out a complete agent worker, verify the actual account path:

1. Connect an authenticated remote endpoint through the supported ChatGPT custom-plugin flow, using public HTTPS or a supported private tunnel as appropriate.
2. Confirm the connection is available in the user's ChatGPT Android app.
3. Make a `phone_status` call from that mobile conversation.
4. Make a screen read from that conversation against the owner's test device.
5. Verify what happens when controlling another app takes ChatGPT out of the foreground. Persist server-side job state so work/results are recoverable; do not assume unsolicited chat messages or uninterrupted mobile polling are available.

If the custom connection is unavailable in the mobile account, report that product limitation and test a supported mobile integration path before presenting a desktop workflow as completion. A local Codex connection or desktop relay alone does not satisfy this product contract.

Sources:

- https://learn.chatgpt.com/docs/plugins
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://developers.openai.com/plugins/deploy/connect-chatgpt

## Current implementation versus target

| Area | Implemented and verified | Still required |
| --- | --- | --- |
| Phone control | Accessibility reads, clicks and text entry verified on emulator | Real S23+ verification; remaining navigation checks; app launch/return behavior |
| MCP | Authenticated local tools and official-client emulator read verified | Authenticated remote connection available in ChatGPT mobile |
| Network | Loopback development server and emulator host bridge | Self-hosted deployment and authenticated phone-to-server connection over Wi-Fi/cellular |
| App lifecycle | In-memory, manually enabled, five-minute test sessions | Owner-enabled background availability, per-task leases, visible running state and stop control |
| Task execution | Individual manually issued actions | Task-level API, durable job state, bounded worker and result retrieval |
| Authentication | Separate temporary device/MCP tokens per restart | Persistent pairing, caller/device authorization, revocation, appropriate remote authentication |

The Android implementation must respect background-service rules, network/power management and owner permissions. Reliable idle/reboot/network-switch behavior needs real-device testing; the emulator does not establish it. A locked or inaccessible device must produce a clear blocked result rather than a claim of completion.

## Next engineering milestone

Prove a phone-originated `phone_status` and screen-read call from the official ChatGPT Android app through an authenticated self-hosted connection. Then validate real-phone background connectivity and build the task worker. Local smoke tests continue to serve as regression checks, not as the final interface.
