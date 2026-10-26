# Comparison with the supplied iOS READMEs

Reviewed the supplied `README.md` (Agentic Automation on iOS) and `README (1).md`
(Phone Control), plus the local Android implementation, on 2026-10-25. Reference
results are author-reported; this review does not independently reproduce them.

## Assessment

The Android project has reached the central user-facing prototype: chat-directed
control of a real phone through authenticated self-hosted infrastructure, with
local permissions and stop controls. It has not reached demonstrated parity with
the reference's server-side agent architecture, evaluation program or research
claims.

| Reference capability | Android status |
| --- | --- |
| Assistant connector to real phone | Implemented and exercised through connected tools |
| No cable during everyday use | Implemented; a Windows host must remain running |
| Bounded sessions and stop | Implemented; five-minute and idle limits, local controls |
| Live progress | In-app task card/timer/history implemented; not Dynamic Island or a cross-app overlay |
| Accessibility observations/actions | Implemented with fresh snapshots and a smaller action set |
| Screenshot plus UI hierarchy | Accessibility metadata only; screenshot observations absent |
| Autonomous `run_phone_task` worker | Absent; chat model currently chooses each action |
| Provider selection / hybrid router | Absent |
| Cached prompts / CoALA memory / rolling summaries | Not implemented by this server |
| Continuous drag trajectory | Absent; single-stroke swipes within validated targets |
| On-device model-driven loop | Absent |
| Continuous spoken step narration | Not established; assistant voice output is distinct from app-owned narration |
| Repeated benchmark trials / cost / tokens | No AndroidWorld results or provider usage measurement |
| Accessibility participant evidence | Not measured |
| Reproducible public release / CI | Local preparation added; GitHub publication and remote CI pending |

The reference's 74% iOSWorld score is not a target that can be compared directly
with AndroidWorld percentages. Different tasks, observations, models and budgets
make a cross-platform ranking misleading. Its six-run optimization demonstration
is useful as an experimental pattern, not a general speed benchmark.

## Most valuable next work

1. Instrument run-level outcomes and task timing, retaining failures and evidence.
2. Stabilize the actual mobile/voice connector path; benchmark API agents separately.
3. Build an AndroidWorld adapter and collect a small, preregistered pilot.
4. Run fixed repeated trials, audit outcome checks, publish raw sanitized records.
5. Test TalkBack and recruit consented blind/low-vision participants.
6. Rehearse clean setup, settle licensing/signing and publish an evidence-backed repo.

An independent API worker is useful for unattended trials and exact model usage,
but it adds provider credentials, cost and another execution architecture. Do
not add hybrid models merely to match a reference README; evaluate a simple
baseline first. The current app policy deliberately blocks Notes and two
authenticator apps and must be disclosed in benchmark coverage.

## Repository review

The previous README described 0.6.0 speech/handoff UI that was removed in 0.8.0,
obsolete tool counts, older app restrictions and aspirational directories. The
documentation index incorrectly said no implementation guides existed. Those
entry points are now refreshed; older detailed guides still need a full audit.

This workspace has no `.git` directory. No GitHub repository has been created or
pushed by this review. CI is prepared, not remotely validated. No license has
been selected. APKs should be attached to versioned Releases after a signing and
privacy review, rather than committing the local `outputs/` or `work/` tree.
