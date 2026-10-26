# Evaluation protocol

## Two questions, two tracks

1. **Product track:** does the real chat/voice assistant operate this server and
   companion reliably? Submit fixed requests through the actual supported user
   surface and independently check the final state. Record the assistant surface
   and whether a human had to select tools or help. This is not unattended API
   evaluation, and model token/cost data may be unavailable.
2. **AndroidWorld track:** can an automated agent using this tool path solve
   initialized benchmark tasks? A model runner and adapter are still required.
   Running AndroidWorld's built-in agent does not evaluate Android Agent.

## AndroidWorld setup

Upstream documents 116 task templates across 20 apps and an API-33 Pixel-6 AVD,
started with `-no-snapshot -grpc 8554`. Use a separate `AndroidWorldAvd`; the
development API-37 emulator is not the benchmark environment. Upstream uses
Python 3.11+, app setup, and a native emulator; Docker support is experimental.
Pin the upstream commit and all app/device versions before collecting results.

The upstream runner's automatic adb lookup currently contains Linux/macOS paths.
For this Windows project, a separate Linux benchmark machine is the cleanest
initial setup; native Windows/WSL integration requires validation and should not
be advertised as already working.

Follow [upstream installation](https://github.com/google-research/android_world).
First run a supplied baseline only to verify the environment. Review the selected
baseline's API configuration and costs; its result is not this project's score.
`--perform_emulator_setup` is a one-time setup flag, not an every-trial reset.

## Adapter to implement

Use AndroidWorld's `EnvironmentInteractingAgent.step(goal)` contract. Initialize
the benchmark task using the evaluator environment; give only its public goal to
the planner. Install the production companion on that emulator and let the
planner call this MCP server for observation/action. Keep evaluator/database
access out of the planner. Do not substitute unrestricted adb actions for the
production tools and then claim to have evaluated the companion.

Route this emulator to its own server process/configuration; the current server
is single-device and must not displace the owner's connected phone. Verify
coexistence with AndroidWorld's accessibility forwarding service. Keep the
production app exclusions active. Notes-related benchmark tasks may therefore
be blocked. Declare coverage before running: report a restricted subset as a
restricted subset, and count blocked tasks as unsuccessful if claiming a full
suite score. Do not silently unblock Notes or omit hard tasks afterward.

An episode should initialize task state, start a fresh agent context, execute
within the predetermined action/time budgets, evaluate with `task.is_successful`,
save evidence, and tear down/reset state. Retain AndroidWorld's step budgets;
record the product's five-minute/idle limits and any evaluation-specific change.

## Trial design

- Pilot: five preselected allowed task templates x three seeded variants = 15
  episodes. This is a pipeline check, not a publishable whole-suite claim.
- Full track: 116 templates x three planned variants = 348 episodes. Publish
  exactly which cases were blocked, failed, timed out or affected by infrastructure.
- Repeat a fixed parameterization separately to measure model nondeterminism;
  different task seeds measure task-variation robustness. Do not conflate them.
- Use the same manifest/seeds/model version/budgets for an A/B comparison. Do not
  retry failed episodes until one passes and report only that attempt.
- Freeze prompts before the held-out evaluation. Keep pilot/development trials
  out of the final score. Audit all outcomes where practical and explicitly
  report any evaluator disagreements or unresolved cases.

## Measurements

Record one sanitized JSON object per episode in `runs.jsonl` (see `run.schema.json`).
Keep raw screen recordings/database checks private until reviewed for release.

| Metric | Definition |
| --- | --- |
| Success | Independently verified completed episodes / planned scored episodes |
| Coverage | Task templates attempted, exclusions and policy blocks |
| Reliability | Templates successful in every repeated trial |
| Time | Monotonic task wall time; median and p95, all outcomes and successes separately |
| Efficiency | Actions, reads, repeated no-progress steps and recovery attempts |
| Failure modes | Connection, device permission/lock, stale snapshot, wrong UI target, planning, verification, timeout |
| Model usage | Exact API input/output/cached tokens and billed cost when returned; null otherwise |
| Accessibility | Independent completion, interventions, correct/full readout and stop/recovery latency |

Your existing `tool_elapsed_ms`, `action_ms`, `settle_ms`, `observation_ms`,
`device_execution_ms` and `command_round_trip_ms` provide useful timing pieces.
They overlap: round-trip time includes device execution, and observation/action
timings include subcalls. Use exclusive spans before drawing a stacked time
chart. The phone history timer excludes pre-session chat time and isn't a success
judge. A ChatGPT subscription does not expose per-task API cost through MCP.

Report uncertainty using a task-cluster bootstrap when repeated episodes share
task templates. Publish the bootstrap method/seed; avoid treating correlated
repeats as fully independent samples. For before/after speed charts, use the
same reset task/configuration and include failures, not just the fastest success.

Generate initial descriptive tables with:

```powershell
node evals/report.mjs path/to/runs.jsonl outputs/evaluation-report
```

The reporter validates records and produces CSV and Markdown summaries. It does
not collect trials, estimate missing model cost, compute a success confidence
interval, or certify a benchmark result. Add publication charts only after real
records exist: task success, timing distribution, failure types, exclusive time
breakdown and API usage/cost with explicit coverage.

## Primary sources

- https://github.com/google-research/android_world
- https://github.com/google-research/android_world/blob/main/android_world/agents/base_agent.py
- https://github.com/google-research/android_world/blob/main/minimal_task_runner.py
- https://github.com/google-research/android_world/blob/main/run.py
- https://github.com/google-research/android_world/blob/main/android_world/suite_utils.py
