# Samsung S23+ / GPT-6 benchmark workflow

No phone benchmark runs or root fixes have been performed by installing this code.
This is opt-in instrumentation for future real trials. Normal phone tasks do not
create benchmark records unless `phone_benchmark_start` is called first.

## What is measured

The chat assistant chooses actions; this server does not invoke GPT-6 itself.
Select GPT-6 in the assistant before running trials. The model and phone name in
the record are operator-supplied labels, not independently detected identities.

* **Tool execution:** wall time of validated device action attempts, including
  command validation, any automatic session start, device polling and the return
  trip. This is not pure on-device execution time.
* **Accessibility observation:** wall time obtaining screen text, controls and
  bounds from Android. It is not image capture.
* **Measured server overhead:** time inside measured phone-tool handlers outside
  device command spans, including settle delays and output processing. Final
  telemetry serialization is outside the measured handler boundary.
* **Unobserved assistant/network/user wait:** wall time between measured tool
  handlers. This includes model processing, network delay, host scheduling and
  user pauses. AI inference and full overhead cannot be separated from this
  server. AI inference and token usage are `null`, never fabricated zeros.

The four numeric timing buckets partition run duration; inference remains
unavailable. Overlapping intervals are unioned so nested work is not counted
twice. The clock is monotonic. Percentages use the measured run duration and
may have small rounding differences.

`summary.call_gaps.per_call` lists each measured phone-tool call ID, tool name,
preceding covered call ID, `gap_before_ms`, and handler `duration_ms`. The gap
is uncovered time from the previous covered handler interval to this handler's
entry. The first gap starts at the run boundary. Overlapping handlers do not
produce duplicate waiting. `trailing_gap_ms` records uncovered time after the
last handler (for example, an explicit finish without Stop). Together these
gaps account for the unobserved bucket, subject to rounding. They do not separate
model inference, network transit, user pauses, or host scheduling. Open runs are
provisional. Reports derive gaps from saved timestamps, including older runs;
they do not rewrite the original records or invent new measurements.

Timing starts at the first measured phone-tool handler after arming and ends
when `phone_stop_session` completes. Explicit finish provides a fallback end
boundary if Stop was never called. Initial prompt processing, final answer
generation and later review are excluded from the normal Stop boundary.
Keep human approvals and pauses consistent; they otherwise affect waiting time.

**Steps** are device action attempts, including launch, tap, type, submit,
scroll, swipe and Back. Failed attempts count. Reads, status checks, session
management and benchmark tools do not count as actions.

## Baseline plus six fixes

Use a single experiment name, for example `s23-gpt6-task-01`, and a short,
non-sensitive task label. This workflow has **seven conditions**: baseline
(iteration 0) plus six cumulative root fixes (iterations 1–6). Each condition
can have multiple trials using `trial: 1`, `trial: 2`, etc.

Do not invent six changes in advance. Run baseline trials, inspect the trace,
identify a real root cause, implement one correction, document it and run that
condition. Repeat until six actual fixes have been evaluated. Keep the same
task, starting screen/data, phone, model, approval conditions and network as
consistent as possible. Reset task side effects between trials. Do not repeat
real payments, messages or destructive actions just to obtain measurements.

## Running each trial through the assistant

Refresh the connector tools after restarting the managed server. No APK update
or API key is required for this server-only measurement feature.

1. Call `phone_benchmark_start` before the normal phone task:

   ```json
   {
     "experiment": "s23-gpt6-task-01",
     "task_label": "Your short task label",
     "device": "Samsung S23+",
     "model": "GPT-6",
     "iteration": 0,
     "trial": 1
   }
   ```

   Arming does not start a session, read the screen or operate the phone.
   For iterations 1–6 also provide `root_cause` and `change` describing the
   actual diagnosed problem and implemented correction for that condition.

2. Perform the requested phone task using the usual tools. Supply the real
   `task_text` on the first launch/read as required by the normal phone workflow.
   Do not take over another task's session or retry uncertain actions.
3. Verify the actual result and call `phone_stop_session`, even on failure.
4. Call `phone_benchmark_status` to review tool calls and their IDs. The trace
   stores tool/action names, timings and error codes, not screen contents,
   message text, typed text, snapshots or credentials.
5. If a call was demonstrably wasted, call `phone_benchmark_mark_wasted` with
   its `call_ids` and a non-sensitive `reason`. This annotates the entire call
   interval. A combined action-and-observe call includes its verification read.
   Duplicate/overlapping annotations are counted once. Errors are not
   automatically waste, and gaps outside calls are not classified as waste.
6. Call `phone_benchmark_finish` with `outcome` (`success`, `failed`, or
   `cancelled`), `verified`, `waste_reviewed`, and optional verification `notes`.
   Set `verified: true` only after checking the task's real result. Set
   `waste_reviewed: true` only after inspecting the trace.

Outcome and condition are separate. Failed/cancelled runs are red. Successful
fix conditions that do not qualify as clean are amber. Reviewed, verified
success with a stopped session, no recorded errors and zero annotated waste is
green. A successful baseline without that clean designation is slate. Zero
annotated waste does not prove the run was globally optimal.

## Storage and reports

Records are saved atomically under the project's `work/benchmarks/`, one JSON
file per run ID. Start/finish errors are visible; a save failure after a phone
action returns a warning and never causes the acknowledged action to be retried.
Keep labels and review notes free of sensitive content. These measurement files
are local plaintext, unlike the installation's separately encrypted credentials.

An unfinished record remains pending and is excluded from charts, including
after a server crash. Current-run editing is in memory for the running host;
after a host restart, start a new trial rather than claiming the interrupted
run completed. Existing saved files remain available to reports. Finish each
trial before restarting for the next code fix.

After the trials, call `phone_benchmark_report` with the exact `experiment`.
It creates a local HTML report, a run-comparison SVG, a timing-distribution SVG,
CSV and JSON in `outputs/benchmarks/` beneath the system project. Empty reports
show no results; unfinished records are listed separately. You can also run
from the project root:

```powershell
node .\server\scripts\benchmark-report.mjs --experiment s23-gpt6-task-01
```

The report includes every finalized trial, duration, action count, reviewed
wasted tool time, actual fixes, outcome and timing percentages. It does not
claim causal speedup from a single run. Compare repeated trials per condition
and retain failures when interpreting improvements. The final diagram is
generated from your recorded runs, not placeholder benchmark numbers.

Reports also include a per-call gap table in HTML, `call-gaps.csv`, and the gap
details in each run's JSON summary. The CSV records milliseconds and call IDs
without phone text, message bodies, or credentials.
