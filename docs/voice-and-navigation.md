# Voice tasks and richer navigation — 0.6.0

## What changed

Home now has **Speak a task**, an editable transcript and **Continue in ChatGPT**. Speech uses Android's on-device recognizer only, after a runtime microphone permission request. Recording is user-started, cancelled when the app leaves the foreground, and not saved by this companion. Unsupported on-device recognition or missing language support shows a message and leaves typed input available. There is no network speech-recognition fallback, always-listening service or model API charge added by this project.

Continue in ChatGPT sends only the reviewed text via Android's standard text-sharing intent to the ChatGPT package when supported. Otherwise it explicitly copies the task and opens ChatGPT or its website so you can paste it. Select Android Agent and send the task yourself. This does not choose a ChatGPT conversation, attach a connector automatically, auto-send, or add a server-side AI worker. Recording alone never starts phone automation.

The companion microphone is based on Android's [on-device SpeechRecognizer API](https://developer.android.com/reference/android/speech/SpeechRecognizer#createOnDeviceSpeechRecognizer(android.content.Context)); handoff uses [Android text sharing](https://developer.android.com/training/sharing/send).

## Better control identification

phone_read_screen keeps the same snapshot and sequential target IDs, and now returns:

- Accessibility label, source and control role.
- Resource ID and Android class.
- Bounds and approximate position within the app window, when available.
- Selected/checkable state and nearby non-password text.
- Conservative Instagram navigation hints for observed Search, Profile, Messages, Home, Reels, Notifications and Create labels or IDs.
- An ambiguity marker and navigation guide. A hint is not proof of what a control does. A heart icon can mean Like or Notifications; unknown controls must not be guessed from position alone.

This is better observation and guidance, not model retraining or persistent learning of user corrections. It does not add screenshots/OCR or identify every custom-drawn icon. An app exposing no useful accessibility information remains a limitation. Real Instagram navigation needs acceptance testing on the owner's phone; no personal Instagram content was inspected for this change.

The Android tap/type/scroll/swipe path now checks the selected target's node identity, text, description, resource ID, bounds and state immediately before acting. It still checks the session, package/window, lock state and snapshot age, and consumes each snapshot once. Content updates elsewhere in a feed no longer automatically discard all targets or require the entire screen tree to be identical. Window-state changes still invalidate the snapshot. A changed target is rejected and requires a fresh read.

## Update and test

1. Install outputs/AndroidAgent-0.6.0.apk over the current app. Existing app identity and encrypted pairing are retained.
2. From the repository root, stop the old Windows stack with Ctrl+C and restart it:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-windows-stack.ps1
```

3. Refresh the Android Agent connector's tool metadata. There are still ten tools; phone_read_screen now returns richer target descriptions. Start a new ChatGPT chat if the existing conversation retains older tools.
4. Verify the private server connection, enable Accessibility, and confirm availability is Ready. The availability diagnostics/startup improvements from the locally prepared 0.5.1 build are included.
5. Tap Speak a task and allow the microphone while using the app. Say "Open Instagram and read my follower count. Do not follow anyone, like anything or send messages."
6. Review the transcription, Continue in ChatGPT, select Android Agent, and send. The agent should read controls, select Profile based on actual evidence, read the count, stop the session and report back. If the control is ambiguous, the agent should request clarification.

## File changelog

- VoiceInput.kt (new): on-device foreground dictation, cancellation, error messages and typed fallback.
- VoiceTaskPrompt.kt (new): bounded reviewed task text with existing status/start/verify/stop instructions.
- MainActivity.kt: voice task card, runtime mic permission, reviewed text handoff, explicit clipboard fallback, lifecycle cancellation, and clear stale setup text when availability becomes ready.
- AndroidManifest.xml: RECORD_AUDIO, visibility of the speech service and ChatGPT package. No microphone foreground service or boot receiver added. build.gradle.kts: versionCode 8/versionName 0.6.0.
- PhoneAccessibilityService.kt: export window bounds/checkable state, validate target fingerprints at action time, and stop invalidating every snapshot for unrelated content updates.
- server/src/screen-understanding.mjs (new): contextual target descriptions and bounded Instagram navigation hints.
- server/src/mcp/tools.mjs: richer phone_read_screen result and navigation guidance; MCP version 0.6.0. Tools and supported app scope stay the same.
- VoiceTaskPromptTest.kt, screen-understanding.test.mjs and mcp.test.mjs: task validation, semantic evidence, ambiguity, password/hidden exclusion, target mapping and integration checks.
- README.md, CHANGELOG.md and this guide: setup, changelog and limits.

## Validation

52 server tests and 16 Android JVM tests pass; assembleDebug succeeds. Installed the APK and visually inspected the voice screen in a temporary API 37 emulator. Denying mic access preserved typed input; an empty task could not be shared; AndroidRuntime showed no crash during those checks. The video reference was sampled into frames locally; no video content was used as execution instructions.

Real S23+ speech recognition, ChatGPT's share receiver, dynamic target validation and Instagram navigation remain manual acceptance checks. The emulator did not validate live spoken transcription. The existing Windows host was not restarted or changed automatically. No real messages, likes, follows or phone actions were performed.

Automatic approval review rejected an initial network speech-provider fallback. That patch was not applied; the implemented version uses only the on-device recognizer.
