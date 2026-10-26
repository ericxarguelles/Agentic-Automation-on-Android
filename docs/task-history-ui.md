# Android Agent 0.8.0

The home screen now has one compact server card: server icon/title, one live
connection-check status, and Connect/Disconnect. Server address and pairing token
are edited in Settings. The speech input and ChatGPT handoff section are removed,
and the app no longer requests microphone permission.

During a phone session, a task card appears immediately below the server card.
It displays the user-requested task, an indeterminate thinking bar, elapsed
seconds measured with Android's monotonic clock, and Stop task. This is an
in-app card, not a floating overlay drawn over other apps.

Supply optional `task_text` on the first `phone_action_and_observe` launch,
`phone_launch_app`, `phone_read_screen`, or explicit `phone_start_session` call.
The server sends it to Android in the session-start and command envelopes.
Quote the user's phone request faithfully. Do not infer it from screen content.
Clients without refreshed tools still work but show "Phone task" when no request
text was supplied. The first nonempty request text remains bound to that session.

History saves up to 50 task requests, local start dates, session durations, and
end states on the phone. It does not save full ChatGPT conversations, model
reasoning, screen observations, or connection credentials. History is encrypted
using a separate AndroidKeyStore key and can be cleared from Home. Unfinished
tasks persist periodic elapsed-time checkpoints and show a lower bound rather
than claiming a precise completion time after process death. A server-ended
session is labelled "Session ended", which does not assert the requested task
succeeded. Existing activity before this update cannot be reconstructed.

Install `outputs/AndroidAgent-0.8.0.apk` over the existing app, reopen it and
reconnect. Refresh the Android Agent plugin's tools/instructions and start a new
chat so the assistant can supply `task_text`. No new permissions are needed.
