# Conditional Google Messages workflow

`phone_send_message({ recipient, text, task_text })` replaces separate assistant exchanges with one deterministic server-side workflow. Use only for a user-authorized recipient and exact message. `task_text` is the faithful original phone request. No phone message is sent during installation or synthetic tests.

The adapter launches Google Messages, reads fresh accessibility evidence, opens a unique exact conversation or explicitly submits a supported search, verifies the conversation header, rejects existing draft text, types and verifies exact text, taps labeled Send once, checks delivery for up to 3000 ms, and stops the session in cleanup. In-flight device requests can exceed the delivery scheduling window. Unsupported resource IDs, unexpected prompts, ambiguous results, mismatched headers or drafts, and device errors stop execution. There is no generic coordinate or AI fallback.

Supported evidence currently requires identifiable resource IDs: conversation/contact item, row or container, or Google Messages `swipeableContainer`; conversation title/name, contact name, toolbar title or `top_app_bar_title_row`; compose_message, message_input or message_text. The latter row and toolbar IDs were observed on the owner's S23+ while diagnosing baseline trial 5. The row's first label segment must still match the exact recipient; partial names and group results are not accepted. Synthetic regression coverage verifies this layout, duplicate rejection and header mismatch rejection. A complete send with this change still requires a real trial. Unknown UI should be added from observed evidence, never guessed.

The response includes `status` (`delivered`, `delivery_unconfirmed`, `send_uncertain`, `stopped`), `send_attempted`, `send_acknowledged`, `session_stopped`, delivery evidence when available, and an action/read trace. Errors retain their actual codes and failed stage. An uncertain Send must never be retried automatically. A pre-existing session returns BUSY without stopping it. Concurrent tool operations are blocked while the workflow owns the device; explicit Stop cancels the workflow.

Internal actions and observations remain benchmark phases. The workflow closes the measurement when cleanup stops the session; benchmark review/finalization remains explicit. No speed improvement is claimed without another actual trial.

Trial 7 investigation: the workflow acknowledged Send but returned `delivery_unconfirmed` after three reads. The operator subsequently confirmed successful sending. A later detailed observation showed the 1:57 AM outgoing message explicitly marked Delivered in Tote and an empty composer; that inspection session was stopped without sending anything. The original trace does not preserve the three message descriptions, so it cannot establish whether the receipt was late or the matcher missed evidence. `delivery_unconfirmed` is not proof of a failed send. The benchmark was explicitly finalized as failed by the assistant, not automatically by the workflow, and the finish API rejects changes to finalized runs.

Delivery results now retain a per-read elapsed time, status and diagnostic reason (no additional message bodies). Reasons distinguish missing new exact outgoing evidence, ambiguous outgoing evidence, an outgoing message without a receipt, explicit pending state and explicit delivery. This preserves the existing strict delivery criterion and no-resend behavior while making a future unknown result diagnosable.

The Android command loop now fetches the next command immediately after posting a completed result. Only an idle response sleeps for 100 ms, replacing the unconditional 750 ms sleep. This requires an updated Android build; no new speed measurement has been made. Faster command retrieval does not establish UI readiness: fresh recipient and draft verification remains mandatory, and stale-screen behavior must be checked in a subsequent real trial.

Trial 8 stopped before composing with `UNEXPECTED_APP`; Send was never attempted. Android launch acknowledgement confirms `startActivity` dispatch, not foreground readiness. The workflow now reads immediately, then only if another package is observed, reobserves at 100 ms intervals for up to 1500 ms (in-flight reads may exceed that window). It never relaunches. Normal launch adds no fixed delay, and package mismatches after launch still stop immediately. Read trace entries retain the observed package to diagnose future failures. This addresses a launch readiness race; the original trace cannot prove which package was visible or establish the cause of that particular run. Trial 8 remains failed.

Activated verification run `[internal identifier omitted]` (iteration 1, trial 1) verified recipient and draft and acknowledged one Send. Workflow-through-stop measured 6341.720 ms, including seven delivery reads returning `no_new_exact_outgoing`. A separate read-only session then verified the new 2:17 AM outgoing message explicitly Delivered in Tote with the composer empty, and was stopped. The benchmark was finalized as verified success with that limitation in its notes. Its automatic `clean_success` label does not establish that delivery was verified inside the measured window. No subsequent send was performed; delivery detection remains unresolved. No comparative end-to-end speed claim is supported by this run.

After changing the server source, restart the MCP server and refresh/reconnect the connector so its tool list includes `phone_send_message`. Existing individual controls remain available. No Android APK change is needed.

Delivery diagnosis after trial 8: a live read of the existing 2:17 AM delivered message exposed `U+202F` (narrow no-break space) between the time and AM. Every observed outgoing timestamp failed the legacy ASCII-space regex. Presentation labels collapse whitespace, which hid this raw-format difference. The delivery matcher now accepts ASCII space or `U+202F` specifically in the timestamp, without normalizing the requested message body. Old-message identity also canonicalizes this timestamp separator so a formatting/receipt change cannot make an old message new. Explicit receipt matching uses the timestamp suffix, not receipt-like text inside the message body.

Post-send reads still begin immediately and stop on the first explicit receipt. The bounded three-second window remains for messages still pending or not yet visible; there is no new fixed post-send delay. Unsupported timestamp formats, ambiguous new outgoing evidence, or an unexpected app stop polling with a diagnostic reason instead of repeating reads that cannot resolve the parser/evidence problem. Per-read diagnostics count exact-prefix, unsupported-timestamp, pre-existing and new candidates without retaining message bodies. Detailed reads additionally expose masked timestamp formatting and unusual whitespace code points. Recovery guidance distinguishes acknowledged Send from verified delivery, prohibits automatic resending, and directs read-only inspection rather than treating an unconfirmed receipt as a failed send or dismissing an unknown prompt. No prompt dismissal was added without observed supported controls.

The original post-send raw screens were not retained: the observed parser mismatch is reproducible on the existing delivered message, but the exact time its receipt became visible during trial 8 cannot be reconstructed. Historical benchmark timings remain unchanged. Synthetic regression tests cover first-read delivery with this S23+ timestamp, protected old messages, exact text differences, unsupported formats, and receipt-like body text. No live speed saving is asserted from synthetic tests.

Trial 6 diagnosis: the S23+ empty composer exposes RCS message as text. The adapter now treats this exact placeholder as empty only on compose_message_text with the observed Compose:Draft:Send voice-record control and no labeled Send control. Placeholder text alone remains a protected existing draft. Exact recipient, attachment and post-type draft checks still apply. Synthetic regression tests cover the empty state and conflicting draft evidence.

Live verification after activation: workflow verified Tote and exact requested draft, typed once and tapped Send once. Its 3000 ms delivery window returned unknown. A subsequent read showed the new outgoing message at 1:55 AM marked Delivered in Tote, with the composer empty; the verification session was stopped. Baseline trial 6 remains failed. This was a functional check, not a new benchmark trial.
# Conversation reached but typing rejected

Owner report on October 26: ChatGPT reached Tote's conversation but required
another request to send `hello`; no text appeared in the first attempt. The
chats “Send Tote Hello” ([internal identifier omitted]) and “Tote hello
text” ([internal identifier omitted]) confirm stopped attempts and a later
reported Send. Retrieved ChatGPT history contains messages, not the underlying
tool traces, so the exact historical error code cannot be established.

Code inspection found that composer recovery covered TARGET_DISAPPEARED only.
Android also rejects WINDOW_STATE_CHANGED and TARGET_CHANGED before performing
ACTION_SET_TEXT. The workflow now handles those definite pre-typing rejections
with one fresh read, exact recipient verification, attachment rejection and
empty/explicitly authorized draft checks, followed by one new type attempt.
Repeated rejection still stops. This recovery is never applied to Send, timeouts,
acknowledged mutations or other uncertain failures. Server instructions and tool
description now expose this behavior and prefer the conditional workflow for an
explicit Google Messages send request. Reaching a conversation is not completion.

Regression tests cover both added codes, fresh snapshots, changed recipients,
existing drafts, attachments, repeated rejection and no Send retry. No message
was sent to test this fix; real-device confirmation remains outstanding.

# Explicit draft corrections

When the owner explicitly asks to correct an existing draft, `expected_draft`
may contain the exact freshly observed draft. The workflow replaces it only
after verifying the recipient, attachments, and exact existing text, then
verifies the complete requested replacement before one Send attempt. Changed
or unrelated drafts still stop the workflow. Never use this option to retry an
uncertain Send. Omitting it retains the existing draft protection.

