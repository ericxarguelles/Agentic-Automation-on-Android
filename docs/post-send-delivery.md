# Post-send delivery check

`phone_action_and_observe` accepts optional `delivery_text` on a Google Messages Send tap. Verify the intended conversation first, then supply the exact draft and the fresh Send target. The server checks the app, snapshot, labeled Send control and matching editable draft before dispatching a single tap.

After Send is acknowledged, the server starts an 850 ms observation window. There is no pre-send delay and this path replaces the normal 350 ms settle delay. It reads immediately and returns as soon as a new outgoing message explicitly reports Delivered or Read. Otherwise it checks again at intervals of at most 100 ms while time remains. It never sends again.

The result includes `delivery.status` (`delivered`, `pending`, or `unknown`), available accessibility evidence, `max_wait_ms`, actual `elapsed_ms`, and read count. `pending` requires explicit not-yet-delivered evidence. Missing, ambiguous, unsupported or pre-existing-message evidence is `unknown`, not success. Currently recognition supports the English Google Messages descriptions observed in the baseline, with a same-day AM/PM timestamp. Identical messages with indistinguishable descriptions are conservatively unknown.

850 ms bounds polling, not total command latency: an in-flight accessibility read and its network response can exceed the window. The server awaits that read so it does not abandon a queued command or return a stale snapshot. A strict device-side 850 ms bound would require a companion-app change. An observation error preserves the Send acknowledgement and instructs the caller to read again without repeating Send.

This is an opt-in server change; existing callers retain their behavior. Restart/redeploy the updated server and refresh the plugin tool schema before a real trial. No Android app update is needed for this server-side polling implementation.

Keep baseline runs unchanged. For a subsequent measured condition, record this actual change, the outcome, number of reads and delivery status. Compare repeated trials before increasing the window. Do not attribute inter-call gaps specifically to model inference or claim a measured speedup from synthetic tests.
