# Android Agent 0.8.0

Install AndroidAgent-0.8.0.apk over your existing app, then reopen it and reconnect.
Your server address and pairing token are now in Settings.

- Removed Speak a task and Continue in ChatGPT, and removed microphone permission.
- Server card has a server icon, one connection/check status, and Connect/Disconnect.
- A live task card appears below Server with the task request, thinking bar,
  elapsed seconds, and Stop task.
- History keeps the last 50 task requests, dates, session end states, and durations,
  encrypted locally, with a Clear control.

Refresh Android Agent's plugin tools and start a new chat so the assistant supplies
the new task_text field. Without it, the app shows Phone task. Past full chats
cannot be imported; history begins with tasks received by this version.

The live card is inside Android Agent, not an overlay on other apps. Timing covers
the phone control session, including waits between actions. Session ended does
not claim the task succeeded.

Verified: 60 server tests, 17 Android unit tests, plus an emulator smoke test for
the task card, advancing timer, encrypted history, and history clearing. Idle,
thinking, and history screens were rendered and visually reviewed.
