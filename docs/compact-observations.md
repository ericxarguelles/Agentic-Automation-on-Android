# Compact observations and action verification

Screen reads now default to compact controls, with navigation first. Controls and text wholly outside the reported window bounds are omitted; original target IDs are preserved. Unknown bounds are retained rather than guessed. Limits are 60 actions and 50 text entries, with omitted counts. `phone_read_screen({detailed:true})` supplies control metadata and up to 150 actions/text entries. This filters presentation, not Android's target validation.

`phone_action_and_observe` accepts one `action` (`tap`, `type`, `scroll`, `swipe`, `back`, or `launch`) and the same action parameters as the existing tools. It validates required parameters before dispatch, performs the action once, waits 350 ms by default (`settle_ms`: 0–1000), and reads the screen. The returned `observation` contains the next usable snapshot: do not read again merely to begin the next action. This is one MCP call but still two device commands, not an atomic device transaction. Existing individual tools remain available.

If verification fails after acknowledgement, the response preserves `action_result`, returns `observation_error`, and explicitly instructs a new read without replaying the action. Cancellation and existing session/target checks still apply. A timeout during the action remains an uncertain outcome and must not be automatically retried.

Timing fields measure tool duration, device-command round trip, Android execution (with the updated companion), and combined-tool action/settle/observation durations. Round trip includes polling and transport; it is not a pure network latency measurement. Snapshot errors distinguish missing/consumed, replaced, expired, truncated tree, window changes, disappeared targets, and changed target identity. Existing policy failures retain their messages.

Activation requires restarting the server/refreshing connector tools and installing the rebuilt Android APK for device-side diagnostics. No model API key is required. Live-phone speed and acceptance checks remain to be performed; automated tests do not establish a measured latency improvement.
