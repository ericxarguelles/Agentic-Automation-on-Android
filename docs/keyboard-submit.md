# Keyboard Search / confirm action

`phone_submit_text({snapshot_id, target_id})` performs Android accessibility `ACTION_IME_ENTER` on a focused, editable, non-password field that explicitly advertises this action. Screen observations expose `can_submit`. Existing session, package, snapshot and target-identity checks apply again at dispatch; unsupported fields fail closed. There is no arbitrary key injection or coordinate fallback.

The action is the app's current editor action (Search, Done, Go, Send, or another app-defined operation). Its semantic meaning is not reliably exposed by this API: do not label every submission as Search or use it to send an unauthorized message. Read afterward to verify. `phone_action_and_observe` also supports `action: "submit"` with the same snapshot and target arguments.

If a field is not marked `can_submit`, tap it to focus and read again. If support is still absent, use an exposed app Search button or request the owner's help. Merely typing a query does not establish that a search ran.

Restart the server, refresh connector tool discovery, and install the rebuilt Android APK (0.6.2 / version code 9). Real Google Messages acceptance requires checking `can_submit` on the phone; automated tests cannot guarantee every app advertises the action.
