# Redundant tool-response reduction and gap reporting

Experiment: `s23-gpt6-message-01`. Candidate performance intervention for the
next measured condition. This change has not demonstrated a latency improvement.
The baseline establishes large between-handler waits; it does not establish
that response size caused all or any particular portion of those waits.

## One performance intervention: reduce repeated response content

- Keep the complete result once in MCP `structuredContent`. Replace the second
  JSON copy in `content` with a short status pointing to the structured result.
  Tool clients must consume structuredContent; text-only consumers no longer
  receive the full phone screen in the status text.
- Remove the repeated generic navigation guide and note from compact screen
  responses. Put their guidance in the server instructions. Preserve Instagram's
  app-specific guide and the guide on detailed reads.
- Keep actual errors and codes in both structured results and concise text.
  Keep explicit acknowledged-action recovery instructions if the following read
  fails. A benchmark-save warning remains visible without recreating the full
  JSON text duplicate.

Full screen action labels, recipient/draft/delivery evidence, capabilities,
snapshot IDs, target mapping, omission counts, device timings and detailed
control evidence remain available. Existing exact visible-text deduplication
remains in place. No new action batching, automatic Send, retries, shorter
settle delays, or Android changes are introduced.

## Supporting instrumentation

Per-call gap reporting is derived from existing monotonic server timestamps.
Benchmark status/finish summaries and report JSON expose gap-before and handler
duration per call. HTML reports show a table; `call-gaps.csv` supports comparison.
Overlapping intervals are handled without double-counting and trailing waiting
is reported separately. Gaps still combine assistant, transport, scheduling and
user waiting; AI inference stays unavailable.

## Activation and evaluation

These are server-only source changes. Restart the managed server and refresh
connector tools before the next measured trial. No APK installation or new model
API key is needed. Source editing and tests do not activate a running server.
Use repeated trials and the same task procedure to assess the hypothesis; do not
mark a new condition successful until its real outcome is verified. No live
phone task or message is required to test these code changes.

## Validation

All 71 server tests passed after this change. Coverage includes the MCP HTTP
client receiving full structured results with concise text, exact error codes,
acknowledged-action recovery, benchmark-save warnings, preserved recipient/draft/
delivery text, overlapping gap intervals, timing reconciliation, and HTML/CSV/
JSON report outputs. The first restricted test attempt could not use loopback
or rename temporary files; rerunning with the required local permissions passed.
The running host was not restarted and no new phone benchmark was performed.
