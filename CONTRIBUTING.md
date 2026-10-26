# Contributing

Start with [current architecture](docs/current-architecture.md) and
[the evaluation protocol](evals/README.md). The project is a prototype; keep
implementation claims tied to code and measured evidence.

Before opening a change, describe the concrete behavior, keep the app exclusions
and local stop controls enforced, and run the relevant server/Android checks.
Run reporter tests with `node --test evals/report.test.mjs`. Do not add model API
keys to CI or call a paid model as part of ordinary unit tests.

Use test accounts and sanitized evidence. Keep raw phone observations, pairing
state and recordings in ignored local storage. A snapshot ID is single-use; do
not weaken freshness checks or automatically retry uncertain message sends.

Documentation must distinguish implemented, tested on emulator, observed on real
hardware, and proposed. Benchmark modifications belong in a separately identified
configuration with fixed seeds and budgets, not a silently changed baseline.

Licensing and publication are pending owner decisions. Contribution and reuse
terms must be settled before accepting outside contributions or describing the
project as open source.
