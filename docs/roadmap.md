# Roadmap

## 1. Make the existing path measurable

- Add run IDs, timestamps, step counts and structured tool-error codes to traces.
- Distinguish tool acknowledgement, verified app state, and task completion.
- Export sanitized trial records; do not rely on the UI history as a benchmark.
- Reproduce messaging and playback failures with a pinned tool configuration.
- Test complete email reading, sender attribution, cancellation and recovery.

Exit criterion: a repeatable smoke suite with recorded evidence for each outcome.

## 2. Evaluate task performance

- Set up a separate AndroidWorld emulator and pinned task manifest.
- Implement an adapter that keeps this project's actual observation/action path.
- Start with five allowed task templates, three planned variants each.
- Run the full chosen track with fixed budgets and no tuning on held-out trials.
- Audit evaluator outcomes, then publish results with coverage and exclusions.
- Add an API-based planner only if unattended trials/provider usage metrics are
  needed. This requires separately configured provider credentials and billing.

## 3. Evaluate accessibility use

- Run scripted TalkBack checks, then consented testing with blind/low-vision
  participants on test accounts and reversible tasks.
- Measure independent completion, interventions, recovery, cancellation latency,
  readout completeness, sender correctness, focus retention and confidence in the
  reported outcome. Participant feedback is not replaced by benchmark success.

## 4. Release engineering

- Rehearse setup on a clean Windows account/machine; reconcile historical docs.
- Run CI on GitHub; add device/emulator and MCP conformance checks separately.
- Choose a license and review dependencies/attribution before publishing.
- Review privacy-sensitive files and recordings before the first Git commit.
- Establish release signing and publish versioned APKs/checksums as Releases.
- Record a short, uncut, redacted real-device demonstration with narration.

## 5. Extend only where evidence calls for it

Consider a durable `run_phone_task`/progress/cancel worker, provider adapters,
visual observations, memory/stuck detection, and a Linux host. Compare each
change against the same held-out tasks. A hybrid router is an experiment, not a
prerequisite for a useful product or a guaranteed performance improvement.
