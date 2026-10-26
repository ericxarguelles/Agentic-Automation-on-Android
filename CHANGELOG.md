# Changelog

Each implementation iteration records its behavior changes and validation here. Historical milestones below reflect the user's reported emulator checks; they are not automated Android test results.

## 2026-10-25 — Companion voice handoff and contextual app controls (0.6.0)

- New VoiceInput.kt and VoiceTaskPrompt.kt: user-started on-device dictation, review/edit transcript, error/typed fallback, lifecycle cancellation and bounded ChatGPT task prompt. No network recognizer, background recording, automatic send or new model API worker.
- MainActivity.kt and AndroidManifest.xml: voice card, runtime microphone permission, ChatGPT text-sharing intent with explicit copy/open fallback, speech/ChatGPT package visibility, corrected stale setup text on readiness. build.gradle.kts: versionCode 8/versionName 0.6.0.
- New server/src/screen-understanding.mjs: roles, resource IDs, selection/checkable state, bounds/position, nearby text, label source, ambiguity and conservative Instagram hints. mcp/tools.mjs exports this evidence and app guidance; MCP version 0.6.0, still ten tools. No model training or screenshots added.
- PhoneAccessibilityService.kt: window bounds/checkable state and target identity fingerprints. Ignore unrelated content events for invalidation; retain window/session/package/lock/expiry checks and reject a changed target before action. No app-scope expansion.
- New VoiceTaskPromptTest.kt and screen-understanding.test.mjs; mcp.test.mjs integration verifies evidence and unchanged native tap mapping. README and docs/voice-and-navigation.md document handoff and limitations.
- Validation: 52 server tests and 16 Android JVM tests pass, APK builds. Temporary emulator: voice screen inspected, microphone denial leaves typed entry usable, empty handoff rejected, no AndroidRuntime crash. S23+ live dictation/ChatGPT handoff/Instagram navigation remain pending. Network speech fallback was rejected by automatic review and replaced with on-device-only recognition. Existing host and real phone were not changed automatically.

## 2026-10-25 — Local availability diagnostics/startup fixes (0.5.1, included in 0.6.0)

- User's reported setup message confirmed Accessibility was disconnected, rather than a failed preference save. No installation on the real phone was performed.
- MainActivity.kt and new AvailabilityStartupGate.kt/AvailabilityPresentation.kt: explicit missing prerequisite/failure messages on Home and Settings, recheck delayed Accessibility connection while visible, avoid repeated service-start loops, expose stopped errors and permit explicit retry.
- RemoteAvailabilityService.kt: Ready depends on a recent successful heartbeat, not a status-string prefix; ignore stale poll replies after shutdown. SessionNotice.kt checks global/channel notification permissions.
- Five tests added; all 14 Android JVM tests passed. Isolated emulator bridge: verified server while Accessibility was off reported unavailable, enabling Accessibility without another activity resume registered availability with a fresh server heartbeat. This was local test evidence, not an S23+ diagnosis of the timing race.

## 2026-10-25 — Android Agent dark UI and Settings (0.5.0)

- MainActivity.kt: dark Home/Settings redesign matching the reference's visual direction; Android Agent / AI Phone Automation header, gear, editable server address, hidden token, connection badge, task indicator and contextual Stop. Accessibility setup and connection management move to Settings. No single-tap test entry.
- New AgentVisuals.kt supplies palette/vector gear/animated task mark; new TaskPresentation.kt maps explicit lifecycle phases without claiming task success from session termination; ReadSession.kt reports those phases.
- New AgentPreferences.kt stores availability intent, default On. Settings switch persists explicit Off. RemoteAvailabilityService.kt and SessionNotice.kt persist notification Stop and reject delayed starts after Off. App-open verification can resume availability with a saved connection and required permissions. No boot receiver or Windows startup change.
- PairingStore.kt: up to ten recent encrypted connections, backward reading of the previous single connection, selection/removal. MainActivity saves only after verification and removes current credentials/access when deleting the current entry.
- New res/values/styles.xml for dark theme/system bars. strings.xml renames app display. AndroidManifest.xml applies theme and removes test activity registration. build.gradle.kts: versionCode 6/versionName 0.5.0.
- New TaskPresentationTest.kt covers state/readiness and session-end wording. README and docs/android-agent-ui.md document setup and file changes.
- Validation: nine Android JVM tests pass and assembleDebug succeeds. Temporary API 37 emulator: inspected both screens, checked default On and Off persistence, verified/saved/restored/removed a dummy encrypted connection, checked no plaintext address/token in stored preferences and no AndroidRuntime crash. S23+ UI/live animation, capacity limit and legacy storage migration remain unverified manually. Server unchanged; previous 47-test run not repeated. APK outputs/AndroidAgent-0.5.0.apk; Home/Settings screenshots included.

## 2026-10-25 — Agentic control switch and named social/messaging apps (0.4.0)

- MainActivity.kt: replace manual five-minute session and separate availability/action/app controls with one owner-enabled Agentic control switch; read/actions and the fixed app set are enabled together. Stop-current-task keeps availability enabled. No automatic restart enablement.
- SessionPolicy.kt, RemoteAvailabilityService.kt, ReadSession.kt, SessionNotice.kt: scoped access now covers Settings, YouTube, Instagram, LinkedIn, Google Messages and Samsung Messages. Unknown packages remain blocked. Rename YouTube-specific scope fields and update status/notification text. Task leases remain five minutes with 60-second server idle expiry; switch availability remains on between tasks.
- PhoneAccessibilityService.kt: snapshot-bound single 350ms directional swipe inside a validated target/window intersection; dispatch acceptance requires subsequent verification. No arbitrary coordinates or multi-touch.
- AndroidManifest.xml and strings.xml: named package queries and updated permission description. build.gradle.kts: versionCode 5/versionName 0.4.0.
- Server connection-server.mjs, mcp/tools.mjs and mcp/oauth-gateway.mjs: named package launch schemas, phone_swipe command/tool and safe diagnostic recognition; ten MCP tools, server version 0.4.0.
- SessionPolicyTest.kt, mcp.test.mjs and oauth-gateway.test.mjs: named-app access/revocation, package limits, swipe directions/target translation/snapshot consumption/device rejection, ten-tool discovery. README and new docs/agentic-control.md document installation and acceptance testing.
- Validation: 47 server tests and 7 Android JVM tests pass; assembleDebug succeeds. APK prepared as outputs/AndroidPhoneControl-0.4.0.apk. Real S23+ switch/launch/gesture acceptance remains pending. No live server restart or phone action performed.

## 2026-10-25 — Add bounded YouTube app launch (0.3.0)

- Android `SessionPolicy.kt`, `MainActivity.kt`, `ReadSession.kt`, `RemoteAvailabilityService.kt`, `SessionNotice.kt`: owner-local YouTube opt-in captured per session/availability period, plus separate action permission. Reads/actions remain constrained to Settings and opted-in YouTube. Notifications/status show scope. No unrestricted app mode was applied.
- `PhoneAccessibilityService.kt`: launch only an owner-permitted package's resolved launcher component while unlocked; invalidate snapshots and report request acceptance pending screen verification. Manifest package visibility is limited to YouTube; no installed-app inventory permission added.
- Server `connection-server.mjs`, `mcp/tools.mjs`, `mcp/oauth-gateway.mjs`: ninth tool phone_launch_app, schema restricted to Settings/YouTube, active-session gate, queued once, awaiting actual device result, existing timeout/cancellation behavior. MCP/app version 0.3.0; Android versionCode 4.
- Android policy tests verify opt-in, read-only versus actions, blocked other/launcher packages, and permission reset. MCP tests verify missing session, package restriction, acknowledged result and owner-policy rejection. Discovery assertions updated to nine tools.
- New docs/app-launch-test.md, README and accessibility description cover setup, launch verification, and remaining restrictions. Unrestricted app discovery/control, Messages and Instagram were not implemented.
- Validation: 45 server tests and 6 Android JVM tests pass; assembleDebug succeeds. JVM tests do not validate real Android launch restrictions. Real YouTube launch is pending; existing running processes/phone permissions were not changed automatically. APK copied to outputs/AndroidPhoneControl-0.3.0.apk.

## 2026-10-25 — Diagnose and harden availability startup (Android 0.2.1)

- `RemoteAvailabilityService.kt`: wait up to three seconds for Android's asynchronously posted foreground notification before checking its visibility. Preserve a stopped/failed reason instead of replacing it with off. Classify pairing rejection, private server denial, occupied session, missing server feature, TLS and network failures without exposing credentials or URLs. Authentication/unsupported-server failures stop rather than retry forever.
- `MainActivity.kt`: visible availability status beside Enable, immediate startup feedback, and specific precondition messages (accessibility/manual session) instead of a generic catch message.
- `app/build.gradle.kts`: versionCode 3/versionName 0.2.1 so the update is identifiable. New outputs/AndroidPhoneControl-0.2.1.apk avoids confusion with older downloaded APKs.
- Validation: five existing Android JVM tests pass and assembleDebug succeeds. No ADB devices are connected; actual S23+ notification timing/startup has not been observed, so the original failure's cause remains unconfirmed. No server or network configuration change/restart required.

## 2026-10-25 — Add owner-enabled availability and ChatGPT-started task sessions

- `server/src/connection-server.mjs`: paired availability registration/heartbeat/revocation, single-delivery remote start, phone readiness acknowledgement, five-minute lease, 60-second task idle expiry, 15-second lost-heartbeat revocation, start cancellation/timeout and one-session exclusion. Availability survives task completion, never server restart.
- `server/src/mcp/tools.mjs`: eighth tool phone_start_session; updated lifecycle instructions require status/start/read/act/verify/stop, including error paths. MCP version 0.2.0. ChatGPT is the planner; no independent server-side model/task worker is added.
- `oauth-gateway.mjs`: allowlist new tool name for sanitized diagnostics. MCP/OAuth tests updated for eight tools.
- New Android `RemoteAvailabilityService.kt`: owner-started non-sticky foreground availability over the private authenticated bridge; bounded remote sessions, explicit local action permission, reconnect availability only after revoking local task access. No boot receiver or automatic permission/session enablement.
- Android `ReadSession.kt`, `SessionPolicy.kt`, `SessionNotice.kt`: accept authenticated server session IDs and bounded lease, acknowledge readiness, return to waiting notification on completion, disable availability via notification Stop, reject locked starts, keep package/read-only checks. `MainActivity.kt`, manifest, strings: availability enable/disable UI and declared specialUse foreground-service type. App version 0.2.0/versionCode 2.
- New remote-session tests cover owner gating, readiness, start single delivery, timeout, cancellation, disable, idle and heartbeat expiry; MCP test covers remote start/stop. Android policy test covers remote lease cap.
- README, architecture, MCP and real-phone guides plus new docs/chatgpt-task-sessions.md describe setup and limits. Model-requested cleanup is not a guaranteed task-completion detector; hard idle/absolute limits cover abandoned cleanup. Same-phone app focus, broader apps and durable worker remain pending.
- Validation: 44 server tests and 5 Android JVM tests pass; assembleDebug succeeds. Updated APK prepared in outputs. Actual foreground service, private VPN reconnect, tool refresh, repeated ChatGPT start/stop and notification revocation on S23+ remain manual acceptance. Existing processes/network configuration were not changed automatically.

## 2026-10-25 — Add optional encrypted Android saved pairing

- `PairingCipher.kt` (new): versioned AES-256-GCM envelope, fresh encryption IV and authenticated context; invalid versions, wrong keys and tampering are rejected.
- `PairingStore.kt` (new): app-private encrypted preferences for server address/pairing token; AES-256 key generated in Android Keystore with unlocked-device requirement. No plaintext fallback, server token rotation, automatic session, or automatic actions.
- `MainActivity.kt`: opt-in Remember checkbox, save only after successful server verification, restore hidden token/address on opening, Forget button that removes stored data/key and stops local access. Stale async connection checks cannot save after Forget. Unchecking Remember removes storage but keeps current fields. Connection-check wording no longer incorrectly claims an existing session is inactive.
- `PairingCipherTest.kt` (new): encryption round-trip/fresh nonce and wrong-key/tamper/version/truncation checks; existing SessionPolicyTest still passes.
- README and local/real-phone/Windows guides: updated saved-pairing behavior, manual startup default, and S23+ acceptance steps. Optional login startup helper remains opt-in and was not activated.
- Validation: Android testDebugUnitTest (4 tests, zero failures) and assembleDebug pass. JVM tests do not exercise Android Keystore or actual app lifecycle; save/reopen/Forget on S23+ remains manual verification. No server change, restart or server test rerun needed. Updated debug APK copied to outputs/AndroidPhoneControl-settings-test.apk.

## 2026-10-24 — Consolidate Windows startup and preserve OAuth access

- Real S23+ read-only Settings reads and explicitly enabled read/tap/read navigation to Display succeeded through the plugin. An inactive status after the Stop check was observed; no settings were changed by those navigation requests.
- `server/src/security/encrypted-state.mjs` (new): AES-256-GCM persistence with fresh nonces, authenticated decryption and atomic file replacement. Wrong keys/corruption fail closed.
- `server/src/mcp/oauth-gateway.mjs`: optional persistent registrations and hashed access/refresh grants, issuer binding, persisted refresh consumption/revocation, no restoration of authorization requests/codes. Original ephemeral launchers remain supported.
- `server/scripts/start-windows-stack.mjs` (new): device bridge, local MCP and gateway in one Node.js process with coordinated shutdown and sanitized diagnostics. No screen results are logged by this host. Phone sessions remain in memory.
- `scripts/start-windows-stack.ps1` (new): account-scoped Windows DPAPI settings, persistent server credentials, private local ShowSecrets mode, listener/mutex/route conflict checks, background Funnel/Serve setup, status mode and unattended process restart. No live setup was altered during implementation.
- `scripts/install-windows-startup.ps1` (new): optional standard-user Task Scheduler registration at Windows login with retries and a remove mode. Not invoked/activated by the agent.
- `server/test/encrypted-state.test.mjs` and `server/test/oauth-gateway.test.mjs`: encryption/tampering and restart/refresh/revocation coverage. Restart fixture closes test HTTP connections to avoid reusing a deliberately closed socket.
- `docs/windows-startup.md`, `README.md`: first migration, new pairing/approval once, status/restart acceptance and optional login startup; existing 24-hour client/refresh expiry and unsaved Android pairing caveats.
- Validation: 38 server tests pass; new PowerShell scripts parse; Node host syntax passes; Windows DPAPI round-trip succeeds. Full launcher/Tailscale migration and scheduled-task reboot/login behavior remain unverified. No Android change/build needed.

## 2026-10-24 — Diagnose intermittent MCP request failures

- `server/src/mcp/oauth-gateway.mjs`: include allowlisted MCP method/tool names, format-checked protocol version, fixed error categories, and numeric JSON-RPC error code in diagnostics. Never include parameters, raw messages, request/response bodies, query strings, credentials, or screen text. Distinguish upstream connection/timeouts with HTTP 502 instead of reporting them as malformed client HTTP 400.
- `server/scripts/start-oauth-gateway.mjs`: print those diagnostic fields beside route/status.
- `server/test/oauth-gateway.test.mjs`: verify SDK status diagnostics and intentional unsupported-version failure classification, and assert sensitive OAuth values are absent from diagnostic events.
- Validation: 36 server tests pass. User-provided 400/200/202 logs do not establish a root cause; 202 is normal for accepted notifications. The failed live tool call remains unresolved until correlated method-level logs are obtained. Restart only the gateway to load diagnostics and reconnect OAuth because grants are memory-only.

## 2026-10-24 — Prepare restricted real-phone testing

- User verified status and emulator screen reads from ChatGPT on the S23+; plugin read/tap/read navigation to Display was also verified. This does not establish real S23+ control.
- New `SessionPolicy.kt`: local five-minute lease, Settings-only allowlist, read-only default, explicit session-scoped action opt-in, stop/expiry checks, and restriction of the fixed demo command. `PhoneAccessibilityService.kt`: enforce policy before reads and mutations, suppress actionable controls in read-only results.
- New `SessionNotice.kt`: session notification with immutable Stop PendingIntent and a non-exported receiver. `ReadSession.kt`: require notification availability, end local access if notification disappears/permission is revoked, prevent overlapping local leases, and clear policy/notification/snapshot on cleanup. This is not a foreground service or a hard real-time watchdog; Samsung background behavior remains unverified.
- `MainActivity.kt`, `AndroidManifest.xml`, `strings.xml`: request notification permission, show explicit Settings action opt-in, declare receiver, explain current restrictions. Enabling actions still permits sensitive Settings changes; no per-setting filter exists.
- `SessionPolicyTest.kt`, `app/build.gradle.kts`: two JVM unit tests cover read-only, denied apps/null package, exact expiry, overlapping session rejection, action opt-in, stop and reset-to-read-only.
- `docs/real-phone-test.md`, `docs/local-connection.md`, `README.md`: emulator acceptance, private Tailscale Serve 8443 -> Android bridge 8787, separate public Funnel 443 -> gateway 8789, same-phone app-switching limitation, and remaining real-device/background checks. No network configuration changed.
- Validation: Android testDebugUnitTest (2 tests, no failures) and assembleDebug passed. Copied the debug APK to outputs/AndroidPhoneControl-settings-test.apk. Android notification interaction and enforcement on emulator/S23+ still need manual acceptance. No server changes, restart, or server regression rerun required.

## 2026-10-24 — Allow the OAuth approval redirect through browser CSP

- `server/src/mcp/oauth-gateway.mjs`: permit self plus the two already allowlisted HTTPS ChatGPT hosts in form-action. Chromium can enforce form-action against the approval POST's 303 redirect, so the previous self-only policy could prevent returning to ChatGPT even after successful approval.
- Redirect URI path allowlisting, exact registration matching, owner key, PKCE, and approval Origin checks remain enforced. No arbitrary callback hosts were added.
- `server/test/oauth-gateway.test.mjs`: assert the approval-page CSP permits the intended callback hosts while retaining default-src/frame/base restrictions; existing approval, PKCE, and redirect rejection tests still run.
- Validation: 36 server tests pass. Real-browser redirect/token exchange is still pending; HTTP tests do not exercise browser CSP enforcement. Restart only the gateway and initiate a fresh ChatGPT connection to load the new policy.

## 2026-10-24 — Fix browser approval form Origin handling

- `server/src/mcp/oauth-gateway.mjs`: use Referrer-Policy same-origin instead of no-referrer. Browsers can send Origin: null for form POSTs under no-referrer, conflicting with the approval endpoint's required issuer Origin. Same-origin preserves the local form Origin and suppresses cross-site referrers; foreign/null/missing approval Origins remain rejected.
- `server/test/oauth-gateway.test.mjs`: assert the approval-page policy and rejection of foreign, null, and missing Origins alongside the successful approval flow.
- Validation: 36 server tests pass. These are HTTP-level checks, not a real-browser form test; browser approval needs a fresh ChatGPT authorization attempt after gateway restart. Node server, Funnel, and Android app are unchanged.

## 2026-10-24 — Correct ChatGPT OAuth callback compatibility

- `server/src/mcp/oauth-gateway.mjs`: add the officially documented stable ChatGPT callback and callback-ID-specific path to the constrained redirect allowlist. The previous allowlist rejected both documented forms, which could block DCR. HTTPS/host validation and exact registered redirect matching remain enforced.
- `server/scripts/start-oauth-gateway.mjs`: print sanitized route/status/error diagnostics; never print request bodies, query strings, tokens, authorization codes, or client IDs.
- `server/test/oauth-gateway.test.mjs`: exercise the real stable callback through the full approval/PKCE/token flow; verify both documented callback forms register and nearby invalid paths fail.
- Validation: 36 server tests pass. Actual ChatGPT registration retry requires restarting only the gateway; main Node.js server, Funnel and Android app are unchanged. End-to-end ChatGPT setup remains unverified.

## 2026-10-24 — Extend owner sessions to five minutes

- Android `ReadSession.kt`: owner-started session deadline increased from 120000 to 300000 milliseconds. `MainActivity.kt` and `strings.xml`: button, status, and accessibility description now say five minutes.
- Server `connection-server.mjs`: matching five-minute expiry and session-required error; `index.mjs` and `mcp/tools.mjs`: updated console/tool instructions.
- Tests: updated expiry advances in element-click, navigation, and text-entry tests. Added a boundary test in `connection.test.mjs` confirming the session is active after two minutes, active immediately before five minutes, and rejected exactly at expiry.
- README and architecture/local/MCP/mobile guides now describe five-minute development sessions. Historical changelog entries retain their original durations.
- Validation: 36 server tests pass; Android assembleDebug succeeds. Stop controls, 30-second snapshot expiry, and 10-second MCP command timeout are unchanged. Updated APK installation, running server restart, and a fresh emulator session are required; no running process was restarted automatically.

## 2026-10-24 — Add single-owner OAuth gateway for Funnel

- `server/src/mcp/oauth-gateway.mjs` (new): separate loopback gateway with OAuth discovery, constrained ChatGPT callback registration, owner approval form, S256 PKCE, resource binding, issuer-bound callback responses, expiring single-use codes, one-hour access tokens, rotating 24-hour refresh tokens, family revocation, bounded in-memory state, and rate limiting. Authenticated forwarding preserves the private MCP server's bearer/Host checks. All OAuth state resets on restart.
- `server/scripts/start-oauth-gateway.mjs`, `scripts/start-funnel-gateway.ps1` (new): detect Tailscale DNS name, accept hidden local MCP token, verify local MCP before startup, and print an owner approval key for the gateway's own login page. No public Funnel is started by these scripts.
- `server/test/oauth-gateway.test.mjs` (new): security rejection/expiry/rotation/revocation tests and actual SDK initialization/tool discovery/status through the gateway.
- `docs/tailscale-windows.md`, `README.md`, `CHANGELOG.md`: gateway instructions and remaining manual verification. Funnel targets 8789, never the Android bridge.
- Validation: 35 server tests pass, including SDK discovery/status through the gateway; launcher syntax validated. No Android changes/build required. Actual Funnel proxying, ChatGPT login/mobile access, background operation, and automatic Windows startup remain unverified. The gateway is a single-owner development implementation, not a multiuser production identity provider.

## 2026-10-24 — Select Windows Node.js and Tailscale Funnel

- `docs/tailscale-windows.md`: added the selected flow, Windows install/preparation commands, conditional Funnel activation commands, authentication blockers, and acceptance gates.
- `README.md`, `docs/mobile-connection.md`: identify Funnel as the selected path; preserve prior OpenAI tunnel instructions as historical material.
- Verified Node.js implementation is already Windows-compatible and Tailscale is absent from PATH/standard install location. Official documentation supports localhost proxying via Funnel and ChatGPT Server URL connections with OAuth/no-auth options.
- No runtime behavior changed, no Funnel/public endpoint activated, and no tests rerun for this documentation-only change. Existing bearer and Host/Origin checks remain enforced. OAuth and automatic startup are pending.

## 2026-10-24 — Detect tunnel authentication failures

- `scripts/check-tunnel.ps1`: inspect documented component health in addition to basic liveness/readiness. Report control-plane state, consecutive failures, and HTTP status without credentials; fail the check unless polling is healthy.
- Live investigation found basic endpoints returning ready/live while control-plane polling was degraded with HTTP 401, 227 consecutive failures, and zero dispatched requests. Basic readiness did not establish OpenAI connectivity; the previous readiness-only assessment was insufficient.
- Validation: updated checker reports the live authentication failure and exits nonzero. Runtime credential correction and ChatGPT setup remain pending. No Android/server application behavior changed.

## 2026-10-24 — Private mobile connection preparation

### Added and changed files

- `scripts/install-tunnel-client.ps1` (new): download the official Windows release and verify the vendor's SHA-256 before extraction into ignored work/tools.
- `deploy/tunnel-client.yaml` (new): loopback MCP forwarding and local health listener; secret values are environment references only.
- `scripts/start-tunnel.ps1` (new): hidden local credential prompts, local MCP preflight, doctor diagnostics, foreground relay, and environment restoration.
- `scripts/check-tunnel.ps1` (new): read local health/readiness without dumping configuration or credentials.
- `docs/mobile-connection.md` (new): account prerequisites, single-owner authorization boundary, launch procedure, and mobile acceptance checks.
- `README.md`, `CHANGELOG.md`: distinguish prepared setup from a verified remote/mobile connection.

### Observed evidence

- No tunnel-client or other tunnel command was found on PATH. The available in-app Platform browser reached sign-in rather than authenticated tunnel settings.
- Official tunnel-client v0.0.18 downloaded from openai/tunnel-client; its SHA-256 matched SHA256SUMS.txt.
- Executed the verified binary's quickstart and run/doctor help to check supported flags and environment references.
- No tunnel resource created, runtime credentials obtained, relay started, or mobile ChatGPT call verified yet. Account sign-in is required to inspect the intended organization/workspace and reuse/create the right tunnel.
- All PowerShell launcher scripts passed syntax checks. The official client successfully imported/listed the credential-free YAML profile in an isolated project-local validation directory. This verifies profile acceptance, not authenticated doctor diagnostics or tunnel readiness.
- Android and server application code are unchanged; no rebuild or application regression rerun was needed for these setup helpers.

## 2026-10-24 — Mobile product contract and integration gate

- Reaffirmed the original requirement: natural-language tasks from the official ChatGPT mobile app drive the owner's Android phone through a self-hosted server. Desktop/local MCP setup remains a development aid, not the finished interface.
- Added docs/architecture.md: intended lifecycle, task-level API, background connection requirements, current gaps, and mobile acceptance criteria.
- Updated README.md and docs/mcp-setup.md to distinguish local transport validation from ChatGPT mobile integration and normal phone-only operation.
- Updated CHANGELOG.md with this documentation-only iteration. No application code or configuration changed; no rebuild or regression rerun required.
- Verified official documentation describes plugins on mobile for account-available plugins. This project's custom connection is not yet verified on the user's mobile account; that is the next integration gate.

## 2026-10-24 — MCP-to-emulator verification checkpoint

- User confirmed an active session and screen/action data through the MCP smoke test. Initialization, tool discovery, authentication, and the real device read path are now manually verified on the emulator.
- Updated README.md, docs/mcp-setup.md, and CHANGELOG.md to record that evidence. No application code or configuration changed; no rebuild or test rerun is required.
- ChatGPT account connection and AI-driven actions through that connection remain unverified. Selecting the client surface is the next setup step.

## 2026-10-24 — Local MCP device adapter

### Added

- Seven tools: phone_status, phone_read_screen, phone_tap, phone_type, phone_scroll, phone_back, phone_stop_session.
- Stateless Streamable HTTP at 127.0.0.1:8788/mcp using the official SDK, a distinct bearer token, Host/Origin validation, and a 64 KiB request limit.
- Typed schemas, structured results, tool annotations, sequential target IDs, and explicit snapshot binding across clients.
- Device result waits, pending-command rejection, stop/cancellation handling, and bounded timeouts that revoke uncertain sessions rather than retry actions.
- A local MCP smoke-test script using the official client; optional ReadScreen flag for an emulator read.

### Changed files

- `server/package.json`, `server/pnpm-lock.yaml` (lockfile new): pinned MCP SDK 1.32.2 and Zod 4.6.7.
- `server/src/connection-server.mjs`: async command completion, status, snapshot-bound dispatch, and revocation.
- `server/src/mcp/tools.mjs` (new): seven MCP tools and schemas.
- `server/src/mcp/http-server.mjs` (new): authenticated local MCP transport.
- `server/src/index.mjs`: start both endpoints, print distinct tokens, and coordinate shutdown.
- `server/test/mcp.test.mjs` (new): SDK protocol/HTTP/device-bridge integration tests.
- `server/scripts/check-mcp.mjs` (new): initialization, discovery, status, and optional read smoke test.
- `scripts/node-runtime.ps1` (new): shared Node executable resolution.
- `scripts/start-server.ps1`: shared runtime helper and missing-dependency guidance.
- `scripts/test-mcp.ps1` (new): hidden token input and smoke-test launcher.
- `android/app/src/main/java/com/androidphonecontrol/ReadSession.kt`: show a revoked session as ended by server instead of generic HTTP 404 failure.
- `docs/mcp-setup.md` (new), `README.md`, `CHANGELOG.md`: contracts, setup, limits, and iteration history.

### Validation

- Server regression suite: 31 passed, 0 failed, covering the official SDK handshake/discovery and authenticated HTTP/device-bridge integration.
- Android debug build: passed (`assembleDebug`).
- PowerShell launcher scripts: syntax checks passed. Server entrypoint and smoke-test client: syntax checks passed.
- MCP-to-emulator and ChatGPT account connection remain unverified. The HTTP integration suite simulates device responses.
- User confirmed the organized table and Settings text-entry flow on the emulator before this increment.

## 2026-10-24 — Organized terminal action table

### Changed

- Replaced separate sparse clickable/scrollable/editable lists with one table of consecutive IDs and action capabilities.
- Terminal aliases map to native node IDs internally; no Android protocol or app change is required.
- Queued commands invalidate aliases. A new successful read is required to populate them again.
- Default screen output no longer dumps the raw JSON tree. New `details` command prints the latest raw result on demand, with a warning that its native IDs are diagnostic.
- Screens with no editable controls explain that a search/text field must be opened before another read.
- IDs remain local to each snapshot; actionable layout changes can renumber them.

### Changed files

- `server/src/terminal-view.mjs` (new): action-table builder and terminal alias controller.
- `server/src/terminal-commands.mjs`: table formatting, missing-field help, and details command.
- `server/src/index.mjs`: connect alias routing and compact output to the CLI.
- `server/src/connection-server.mjs`: update target-selection error messages.
- `server/test/terminal-view.test.mjs` (new): consecutive IDs, mapping, invalidation, diagnostic output, and authenticated delivery tests.
- `server/test/element-click.test.mjs`, `server/test/navigation.test.mjs`, `server/test/text-entry.test.mjs`: update output expectations for the new table.
- `docs/local-connection.md`, `README.md`, `CHANGELOG.md`: current UX and restart instructions.

### Validation

- Server regression suite: 22 passed, 0 failed (`node --test server/test/*.test.mjs`), including an authenticated terminal-alias-to-native-target integration test.
- Android files unchanged; rebuild/reinstall is not required for this iteration.
- New terminal layout and text-entry flow still need manual emulator verification.

## 2026-10-24 — Snapshot-bound text replacement

### Added

- `type ID "text"` replaces an eligible field's contents using ACTION_SET_TEXT. `type ID ""` clears it. No Enter/IME submit action is sent.
- Screen reads report editable fields, set-text support, and hints. The terminal displays Editable IDs.
- Server and device enforce the same 1000 UTF-16 code unit limit and reject NUL characters.
- Tests cover JSON string parsing, eligibility, text/ID limits, expiry, cancellation, and single-use delivery.

### Changed files

- `android/app/src/main/java/com/androidphonecontrol/PhoneAccessibilityService.kt`: collect editable targets; validate and execute text replacement.
- `android/app/src/main/java/com/androidphonecontrol/ReadSession.kt`: dispatch set_text commands.
- `android/app/src/main/java/com/androidphonecontrol/MainActivity.kt`: update session disclosure.
- `android/app/src/main/res/values/strings.xml`: update accessibility-service disclosure.
- `server/src/connection-server.mjs`: validate editable IDs and text; queue set_text.
- `server/src/terminal-commands.mjs`: parse quoted text and format editable IDs.
- `server/src/index.mjs`: document the type command in terminal help.
- `server/test/text-entry.test.mjs` (new): text-entry regression tests.
- `docs/local-connection.md`, `README.md`, `CHANGELOG.md`: usage, status, and iteration log.

### Validation

- Android debug build: passed (`assembleDebug`).
- Server regression suite: 16 passed, 0 failed (`node --test server/test/*.test.mjs`).
- Text entry, Back, and scrolling still require manual emulator verification. Server tests simulate device responses; they do not execute Android accessibility actions.

## 2026-10-24 — Back and scroll navigation

### Added

- `back`: dispatches Android's Back action after validating the latest screen snapshot.
- `scroll ID up|down`: scrolls a visible, enabled container in a direction it advertises through accessibility.
- Screen reads include `scrollable`, `scrollDirections`, and a terminal summary of scrollable IDs.
- Server tests for navigation commands, supported directions, expired/consumed snapshots, session stop, and command parsing.

### Changed

- Shared Android validation for tap, scroll, and Back: current unlocked window, unchanged tree, complete snapshot, 30-second TTL, single-use execution.
- The app's session disclosure and terminal help describe navigation access.
- The Android accessibility-settings description reflects the implemented screen access and navigation capabilities.
- Click targets also retain scrollable nodes, while each operation independently checks its capability.

### Validation

- Android debug build: passed (`assembleDebug`).
- Server tests: 9 passed, 0 failed (`node --test server/test/*.test.mjs`).
- Back and scrolling require manual emulator verification. No physical S23+ verification yet.

## Earlier emulator milestones

- The app launches; accessibility can be enabled and disabled.
- Token-authenticated local connection verified.
- Visible accessibility elements returned to the server.
- Server-triggered demo-button click increments its counter.
- Snapshot-bound numbered element click opens the selected Settings page.

## Not implemented

- Autonomous task planning, ChatGPT account connection, production HTTPS/OAuth or Secure MCP Tunnel setup, and a persistent wireless background connection.
