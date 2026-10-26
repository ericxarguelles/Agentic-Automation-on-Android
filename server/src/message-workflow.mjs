import { compactObservation } from './screen-understanding.mjs';
import { observeDelivery } from './delivery-observation.mjs';

const PACKAGE = 'com.google.android.apps.messaging';
// These codes are emitted by Android snapshot/target validation before
// ACTION_SET_TEXT. Other failures may follow a mutation and must not be retried.
const PRE_TYPE_REJECTIONS = new Set(['TARGET_DISAPPEARED', 'TARGET_CHANGED', 'WINDOW_STATE_CHANGED']);
const normalized = value => String(value ?? '').normalize('NFC').trim().toLowerCase();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

// A deliberately narrow, deterministic Google Messages adapter. App text never
// supplies instructions, recipient arguments, or permission to send.
export async function sendMessageWorkflow({ recipient, text, task_text, expected_draft, execute, stop, busy, signal }) {
  if (busy()) fail('BUSY', 'Stop the existing session before starting a message workflow.');
  let screen, view, stage = 'launch', sendAttempted = false, sendAcknowledged = false;
  const trace = [];
  let stopped = false;
  const run = async (action, args = {}) => {
    if (signal?.aborted) fail('CANCELLED', 'Message workflow cancelled.');
    const started = performance.now();
    try {
      const value = await execute(action, args, signal);
      if (action !== 'read' && value.accepted !== true) fail('ACTION_UNCONFIRMED', 'Action was not explicitly acknowledged.');
      trace.push({ stage, action, ok: true, duration_ms: Math.round(performance.now() - started) });
      return value;
    } catch (error) {
      trace.push({ stage, action, ok: false, error_code: error.code ?? 'DEVICE_ERROR', duration_ms: Math.round(performance.now() - started) });
      throw error;
    }
  };
  const read = async ({ launching = false } = {}) => {
    const deadline = performance.now() + (launching ? 1500 : 0);
    do {
    screen = await run('read');
    if (!Array.isArray(screen.elements) || typeof screen.snapshot !== 'string') fail('INVALID_SCREEN', 'Invalid screen response.');
    trace.at(-1).observed_package = screen.package;
    if (screen.package === PACKAGE) break;
    // Launch acknowledgement only confirms startActivity, not foreground readiness.
    // Reobserve only: never repeat a launch or another uncertain action.
    if (!launching || performance.now() >= deadline)
      fail('UNEXPECTED_APP', 'Google Messages is not the observed foreground app.');
    await new Promise(resolve => setTimeout(resolve, 100));
    } while (true);
    view = compactObservation(screen, { detailed: true });
    if (!view.actions_available || view.omitted_actions) fail('UNSUPPORTED_SCREEN', 'Full actionable screen evidence is unavailable.');
    return screen;
  };
  const one = (items, message) => {
    if (items.length !== 1) fail(items.length > 1 ? 'AMBIGUOUS_TARGET' : 'UNSUPPORTED_SCREEN', message);
    return items[0];
  };
  const act = async (action, target, extra = {}) => {
    await run(action, { snapshot_id: screen.snapshot, target_id: target.target_id, ...extra });
    await read();
  };
  const composer = () => one(view.actions.filter(a => a.can_type && /(?:compose_message|message_input|message_text)/i.test(a.resource_id ?? '')), 'A unique message composer could not be identified.');
  const recipientHeaders = () => view.actions.filter(a => a.can_tap &&
    /(?:conversation_title|conversation_name|contact_name|toolbar_title|^top_app_bar_title_row$)/i.test(a.resource_id ?? ''));
  const verifyRecipient = () => {
    const headers = recipientHeaders().filter(a => normalized(a.label) === normalized(recipient));
    one(headers, 'A unique conversation header matching the requested recipient is required.');
  };
  const awaitRecipient = async () => {
    // Opening a thread can be acknowledged before its toolbar is exposed.
    // Only wait for absent evidence; never wait through a wrong/ambiguous header.
    const deadline = performance.now() + 1500;
    let reads = 0;
    while (!recipientHeaders().length && reads < 5 && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await read();
      reads++;
    }
    verifyRecipient();
  };
  const conversation = () => view.actions.filter(a => a.can_tap &&
    (/(?:conversation|contact).*?(?:item|row|container)/i.test(a.resource_id ?? '') ||
      a.resource_id === `${PACKAGE}:id/swipeableContainer`) &&
    normalized(a.label.split(' · ')[0]) === normalized(recipient));
  const rawComposer = target => {
    // Match the action mapping without using truncated presentation labels.
    const candidates = screen.elements.filter(e => e.visible !== false && e.editable && !e.password && e.viewId === target.resource_id);
    return one(candidates, 'Unique raw composer evidence is required.');
  };
  const hasExistingDraft = target => {
    const raw = rawComposer(target);
    if (!String(raw.text ?? '').length) return false;
    // S23+ Messages exposes its empty EditText placeholder as text. Require
    // the independently observed empty-state voice control and no Send control;
    // the placeholder string alone must never authorize replacing a draft.
    const emptyState = raw.viewId === `${PACKAGE}:id/compose_message_text` &&
      raw.text === 'RCS message' &&
      view.actions.filter(a => a.can_tap && a.resource_id === 'Compose:Draft:Send' &&
        a.label === 'Show record a voice message screen').length === 1 &&
      !view.actions.some(a => a.can_tap && /^Send (?:encrypted |SMS |MMS )?message$/i.test(a.label));
    return !emptyState;
  };
  const rejectAttachments = () => {
    if (screen.elements.some(e => e.visible !== false && (
      /(?:attachment_preview|draft_attachment|attachment_container)/i.test(e.viewId ?? '') ||
      /^Remove (?:attachment|image|video|file|photo)/i.test(e.description ?? ''))))
      fail('EXISTING_ATTACHMENT', 'A composed attachment must be resolved before sending a text-only message.');
  };
  let outcome;
  try {
    await run('launch', { package_name: PACKAGE, task_text });
    await read({ launching: true });
    stage = 'find_recipient';
    // Launch may restore an existing thread. Never search or type into it.
    const inThread = view.actions.some(a => a.can_type && /(?:compose_message|message_input|message_text)/i.test(a.resource_id ?? ''));
    if (inThread) {
      verifyRecipient();
    } else {
      let matches = conversation();
      if (matches.length > 1) fail('AMBIGUOUS_RECIPIENT', 'Multiple conversations match the recipient.');
      if (!matches.length) {
        await act('tap', one(view.actions.filter(a => a.can_tap && /^Search messages$/i.test(a.label)), 'Search messages control unavailable.'));
        let field = one(view.actions.filter(a => a.can_type && /search/i.test(`${a.resource_id} ${a.label}`)), 'Unique search field unavailable.');
        await act('type', field, { text: recipient });
        field = one(view.actions.filter(a => a.can_type && /search/i.test(`${a.resource_id} ${a.label}`)), 'Search field disappeared.');
        if (!field.can_submit) {
          await act('tap', field);
          field = one(view.actions.filter(a => a.can_type && /search/i.test(`${a.resource_id} ${a.label}`)), 'Search field disappeared.');
        }
        const search = view.actions.filter(a => a.can_tap && /^Search$/i.test(a.label) && !a.can_type);
        if (search.length) await act('tap', one(search, 'Search control is ambiguous.'));
        else if (field.can_submit) await act('submit', field);
        else fail('SEARCH_NOT_SUBMITTED', 'Search cannot be submitted through the supported controls.');
        matches = conversation();
      }
      await act('tap', one(matches, 'A unique exact recipient conversation was not found.'));
      await awaitRecipient();
    }
    stage = 'compose';
    rejectAttachments();
    const input = composer();
    if (hasExistingDraft(input) && (expected_draft === undefined || rawComposer(input).text !== expected_draft))
      fail('EXISTING_DRAFT', 'An existing draft must be resolved or explicitly authorized for correction with its exact observed text.');
    try {
      await act('type', input, { text });
    } catch (error) {
      // Android emits these while validating the snapshot/saved target, before
      // ACTION_SET_TEXT. They are definite rejections, not uncertain mutations.
      // Recover once from a conversation transition; never retry Send or timeouts.
      if (!PRE_TYPE_REJECTIONS.has(error.code) || trace.at(-1)?.action !== 'type') throw error;
      await read();
      verifyRecipient();
      rejectAttachments();
      const freshInput = composer();
      if (hasExistingDraft(freshInput) && (expected_draft === undefined || rawComposer(freshInput).text !== expected_draft))
        fail('EXISTING_DRAFT', 'The existing draft does not match the explicitly authorized correction.');
      await act('type', freshInput, { text });
    }
    stage = 'verify_draft';
    // ACTION_SET_TEXT acknowledgement can precede the accessibility-tree update.
    // Reobserve only; never retype or relax the exact comparison to a UI label.
    const draftDeadline = performance.now() + 1500;
    let draftReads = 0;
    while (true) {
      verifyRecipient();
      rejectAttachments();
      const raw = rawComposer(composer());
      if (raw.text === text) break;
      if (performance.now() >= draftDeadline || draftReads >= 5)
        fail('DRAFT_MISMATCH', 'Draft does not exactly match the requested message after bounded fresh observations.');
      await new Promise(resolve => setTimeout(resolve, 100));
      await read();
      draftReads++;
    }
    const send = one(view.actions.filter(a => a.can_tap && /^Send (?:encrypted |SMS |MMS )?message$/i.test(a.label)), 'Unique labeled Send control unavailable.');
    const before = screen;
    stage = 'send';
    sendAttempted = true; // Set before dispatch: a lost acknowledgement must never cause a resend.
    await run('tap', { snapshot_id: screen.snapshot, target_id: send.target_id });
    sendAcknowledged = true;
    stage = 'delivery';
    const checked = await observeDelivery({ before, text, maxWaitMs: 3000, read: async () => {
      const value = await read();
      verifyRecipient();
      return value;
    } });
    outcome = { status: checked.delivery.status === 'delivered' ? 'delivered' : 'delivery_unconfirmed', delivery: checked.delivery };
  } catch (error) {
    outcome = { status: sendAttempted ? 'send_uncertain' : 'stopped', error: { code: error.code ?? 'DEVICE_ERROR', message: error.message }, failed_stage: stage };
  } finally {
    stage = 'stop';
    const started = performance.now();
    try { await stop(); stopped = true; trace.push({ stage, ok: true, duration_ms: Math.round(performance.now() - started) }); }
    catch (error) { trace.push({ stage, ok: false, error_code: error.code ?? 'DEVICE_ERROR', duration_ms: Math.round(performance.now() - started) }); }
  }
  return { ...outcome, send_attempted: sendAttempted, send_acknowledged: sendAcknowledged, session_stopped: stopped, trace,
    recovery: sendAttempted && outcome.status !== 'delivered' ?
      `${sendAcknowledged ? 'Send was acknowledged; delivery is not verified.' : 'Send was attempted; acknowledgement is uncertain.'} Do not resend automatically. Inspect the existing conversation read-only for the exact outgoing message and receipt; do not describe this as a failed send or dismiss an unknown prompt.` : undefined };
}
