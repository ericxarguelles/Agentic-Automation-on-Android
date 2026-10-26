# Results and evidence

**No AndroidWorld benchmark has been run for this project. No task-success,
cost-per-task, or blind-user usability score is available.**

Recorded development validation as of 2026-10-25:

| Check | Evidence | What it does not establish |
| --- | --- | --- |
| Server checks | Latest local suite: 60 passing tests | Autonomous task success |
| Android JVM checks | Latest saved reports: 17 tests, no failures | Real-device UI reliability |
| Task UI smoke check | Emulator test passed: timer, encrypted history, clear | Accessibility participant usability |
| Physical-phone tools | Live development use demonstrated Instagram profile reads, conversation navigation, messaging and Spotify screen access | Broad app coverage or controlled success rate |
| Mobile/default-assistant experience | Some attempts reported inability; diagnostics and instructions improved | Reliable voice/mobile parity |
| Gemini | OAuth registration compatibility added and public registration tested | A completed Gemini benchmark |
| GitHub CI | Workflow prepared locally | A green run on GitHub |

The screenshots in the README are isolated emulator previews with a synthetic
request. Do not present them as successful autonomous benchmark episodes.

The reference READMEs report their own iOS results, including 74% on 27 single-app
tasks across three trials. Those are author-reported claims, not independently
verified here and not directly comparable to AndroidWorld or this project.

Future result tables must link the task manifest, pinned revisions, model/config,
seeds, budgets, raw trial records, evaluator outcome, human audit and exclusions.
Leave unavailable token/cost fields unavailable. Use [the evaluation protocol](../evals/README.md).
