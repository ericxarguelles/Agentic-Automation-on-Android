import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMessageWorkflow } from '../src/message-workflow.mjs';

const pkg = 'com.google.android.apps.messaging';
let sequence = 0;
const node = (viewId, text, extra = {}) => ({ id: ++sequence, viewId: `${pkg}:id/${viewId}`, text, visible: true, enabled: true, clickable: true, ...extra });
const screen = (...elements) => ({ snapshot: `s${++sequence}`, package: pkg, clicksAvailable: true, elements });
const inbox = () => screen(node('conversation_item', 'Tote'));
const thread = (text = '', recipient = 'Tote', delivered = false) => screen(
  node('conversation_title', recipient),
  node('compose_message_text', text, { editable: true, supportsSetText: true }),
  node('send', 'Send encrypted message'),
  ...(delivered ? [node('message', '', { description: 'You said Hi how are ya 1:28 AM ., Delivered. End-to-end encrypted message' })] : []));

test('explicit correction replaces only the exact authorized incomplete draft and verifies before Send', async () => {
  const { result, calls } = await fixture([thread('Hi how are y'), thread('Hi how are ya'), thread('', 'Tote', true)],
    { expected_draft: 'Hi how are y' });
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(calls.find(c => c.action === 'type').args.text, 'Hi how are ya');
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
});

test('draft correction rejects changed drafts, wrong recipients, attachments and truncated results', async () => {
  const attached = thread('Hi how are y');
  attached.elements.push(node('attachment_preview', 'photo'));
  for (const screens of [[thread('different')], [thread('Hi how are y', 'Other')], [attached],
    [thread('Hi how are y'), ...Array.from({ length: 6 }, () => thread('Hi how are y'))]]) {
    const { result, calls } = await fixture(screens, { expected_draft: 'Hi how are y' });
    assert.equal(result.send_attempted, false);
    assert.equal(calls.filter(c => c.action === 'tap').length, 0);
  }
});
async function fixture(screens, options = {}) {
  const calls = []; let stops = 0;
  const result = await sendMessageWorkflow({ recipient: 'Tote', text: 'Hi how are ya', task_text: 'Text tote "Hi how are ya"',
    busy: () => false, stop: async () => { stops++; },
    execute: async (action, args) => {
      calls.push({ action, args });
      if (options.reject?.(action, args)) throw Object.assign(new Error('uncertain command'), { code: 'COMMAND_TIMEOUT' });
      if (action === 'read') { if (!screens.length) throw new Error('Unexpected extra read'); return screens.shift(); }
      return { accepted: true };
    }, ...options });
  return { result, calls, stops };
}

test('one workflow uses fresh snapshots, verifies exact draft, sends once and stops', async () => {
  const screens = [inbox(), thread(), thread('Hi how are ya'), thread('', 'Tote', true)];
  const ids = screens.map(s => s.snapshot);
  const { result, calls, stops } = await fixture(screens);
  assert.equal(result.status, 'delivered'); assert.equal(stops, 1);
  assert.deepEqual(calls.filter(c => ['tap', 'type'].includes(c.action)).map(c => c.args.snapshot_id), ids.slice(0, 3));
  assert.equal(calls.filter(c => c.action === 'tap').length, 2);
  assert.equal(result.send_acknowledged, true);
});

test('S23+ narrow no-break timestamp confirms delivery on first post-Send read', async () => {
  const delivered = thread('', 'Tote', true);
  delivered.elements.at(-1).description = delivered.elements.at(-1).description.replace('1:28 AM', '2:17\u202fAM');
  const { result, calls, stops } = await fixture([thread(), thread('Hi how are ya'), delivered]);
  assert.equal(result.status, 'delivered');
  assert.equal(result.delivery.reads, 1);
  assert.equal(calls.filter(call => call.action === 'tap').length, 1);
  assert.equal(stops, 1);
  assert.equal(result.recovery, undefined);
});

test('conversation tap waits for absent toolbar without repeating navigation or typing early', async () => {
  const pending = thread();
  pending.elements.shift();
  const ready = thread();
  const { result, calls } = await fixture([
    inbox(), inbox(), pending, ready, thread('Hi how are ya'), thread('', 'Tote', true)
  ]);
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'tap').length, 2);
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(calls.find(c => c.action === 'type').args.snapshot_id, ready.snapshot);
});

test('missing toolbar wait is bounded and never types or sends', async () => {
  const pending = () => { const value = thread(); value.elements.shift(); return value; };
  const { result, calls, stops } = await fixture([inbox(), ...Array.from({ length: 6 }, pending)]);
  assert.equal(result.error.code, 'UNSUPPORTED_SCREEN');
  assert.equal(result.send_attempted, false);
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
  assert.equal(calls.filter(c => c.action === 'type').length, 0);
  assert.equal(stops, 1);
});

test('toolbar settling stops on wrong or duplicate headers without waiting past them', async () => {
  const duplicate = thread(); duplicate.elements.push(node('conversation_title', 'Tote'));
  for (const changed of [thread('', 'Other'), duplicate]) {
    const pending = thread(); pending.elements.shift();
    const { result, calls } = await fixture([inbox(), pending, changed]);
    assert.equal(result.send_attempted, false);
    assert.equal(calls.filter(c => c.action === 'read').length, 3);
    assert.equal(calls.filter(c => c.action === 'type').length, 0);
  }
});

test('stale post-type tree settles by reading without another text mutation', async () => {
  const { result, calls } = await fixture([
    thread(), thread(), thread('Hi how are ya'), thread('', 'Tote', true)
  ]);
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
});

test('persistent mismatch remains bounded and never sends even with exact description', async () => {
  const mismatch = () => {
    const value = thread('wrong');
    value.elements[1].description = 'Hi how are ya';
    return value;
  };
  const { result, calls, stops } = await fixture([thread(), ...Array.from({ length: 6 }, mismatch)]);
  assert.equal(result.error.code, 'DRAFT_MISMATCH');
  assert.equal(result.send_attempted, false);
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(calls.filter(c => c.action === 'tap').length, 0);
  assert.equal(stops, 1);
});

test('draft settling rechecks recipient and attachments before Send', async () => {
  const attachment = thread('Hi how are ya');
  attachment.elements.push(node('attachment_preview', 'photo'));
  for (const changed of [thread('Hi how are ya', 'Other'), attachment]) {
    const { result, calls } = await fixture([thread(), thread(), changed]);
    assert.equal(result.send_attempted, false);
    assert.equal(calls.filter(c => c.action === 'tap').length, 0);
  }
});

test('launch acknowledgement may precede foreground readiness; reobserve without relaunching', async () => {
  const previous = { ...screen(), package: 'com.android.settings' };
  const { result, calls, stops } = await fixture([previous, inbox(), thread(), thread('Hi how are ya'), thread('', 'Tote', true)]);
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'launch').length, 1);
  assert.equal(stops, 1);
  assert.equal(result.trace[1].observed_package, 'com.android.settings');
});

test('unexpected app after composing stops immediately without typing again or sending', async () => {
  const other = { ...screen(), package: 'com.android.settings' };
  const { result, calls } = await fixture([thread(), other]);
  assert.equal(result.error.code, 'UNEXPECTED_APP');
  assert.equal(result.send_attempted, false);
  assert.equal(calls.filter(c => c.action === 'read').length, 2);
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
});

test('launch readiness wait is bounded and never acts on the other app', async () => {
  const calls = [];
  const { result, stops } = await fixture([], { execute: async action => {
    calls.push(action);
    return action === 'read' ? { ...screen(), package: 'com.android.settings' } : { accepted: true };
  } });
  assert.equal(result.error.code, 'UNEXPECTED_APP');
  assert.equal(result.send_attempted, false);
  assert.equal(stops, 1);
  assert.equal(calls.filter(action => action === 'launch').length, 1);
  assert.ok(calls.every(action => ['launch', 'read'].includes(action)));
  assert.ok(calls.length < 25);
});

test('ambiguous recipients, wrong headers, existing drafts, and changed drafts never send', async () => {
  for (const screens of [
    [screen(node('conversation_item', 'Tote'), node('conversation_row', 'Tote'))],
    [inbox(), thread('', 'Other')],
    [thread('existing')],
    [thread(), thread('wrong')],
    [thread(), thread('Hi how are ya', 'Other')],
    [screen(node('conversation_title', 'Tote'), node('unknown', 'RCS message', { editable: true, supportsSetText: true }))]
  ]) {
    const { result, stops } = await fixture(screens);
    assert.equal(result.send_attempted, false); assert.equal(result.status, 'stopped'); assert.equal(stops, 1);
  }
});

test('uncertain Send is never repeated and session is stopped', async () => {
  const { result, calls, stops } = await fixture([thread(), thread('Hi how are ya')], { reject: action => action === 'tap' });
  assert.equal(result.status, 'send_uncertain'); assert.equal(result.error.code, 'COMMAND_TIMEOUT');
  assert.equal(calls.filter(c => c.action === 'tap').length, 1); assert.equal(stops, 1);
});

test('definitely rejected stale composer is reobserved and reverified once', async () => {
  let types = 0;
  const { result, calls } = await fixture([thread(), thread(), thread('Hi how are ya'), thread('', 'Tote', true)], {
    reject: action => {
      if (action === 'type' && ++types === 1) throw Object.assign(new Error('Target disappeared'), { code: 'TARGET_DISAPPEARED' });
      return false;
    }
  });
  assert.equal(result.status, 'delivered');
  const attempts = calls.filter(c => c.action === 'type');
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].args.snapshot_id, attempts[1].args.snapshot_id);
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
});

test('stale-composer recovery rejects wrong recipient, existing draft, and repeated rejection', async () => {
  for (const fresh of [thread('', 'Other'), thread('existing'), thread()]) {
    const { result, calls, stops } = await fixture([thread(), fresh], {
      reject: action => {
        if (action === 'type') throw Object.assign(new Error('Target disappeared'), { code: 'TARGET_DISAPPEARED' });
        return false;
      }
    });
    assert.equal(result.send_attempted, false);
    assert.equal(calls.some(c => c.action === 'tap'), false);
    assert.ok(calls.filter(c => c.action === 'type').length <= 2);
    assert.equal(stops, 1);
  }
});

test('uncertain typing is never retried', async () => {
  const { result, calls } = await fixture([thread()], { reject: action => action === 'type' });
  assert.equal(result.error.code, 'COMMAND_TIMEOUT');
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(result.send_attempted, false);
});

for (const code of ['WINDOW_STATE_CHANGED', 'TARGET_CHANGED']) {
  test(`${code} before composing recovers once using fresh verified evidence`, async () => {
    let types = 0;
    const ready = thread();
    const { result, calls, stops } = await fixture([
      inbox(), thread(), ready, thread('Hi how are ya'), thread('', 'Tote', true)
    ], { reject: action => {
      if (action === 'type' && ++types === 1) throw Object.assign(new Error('Read again'), { code });
      return false;
    } });
    assert.equal(result.status, 'delivered');
    assert.equal(stops, 1);
    const attempts = calls.filter(c => c.action === 'type');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].args.snapshot_id, ready.snapshot);
    assert.notEqual(attempts[0].args.snapshot_id, attempts[1].args.snapshot_id);
    assert.equal(calls.filter(c => c.action === 'tap').length, 2); // Open + one Send.
    assert.ok(result.trace.some(t => t.action === 'type' && t.error_code === code));
  });

  test(`${code} recovery stops on changed recipient, draft, attachment or repeated rejection`, async () => {
    const attached = thread(); attached.elements.push(node('attachment_preview', 'photo'));
    for (const [fresh, expectedTypes] of [[thread('', 'Other'), 1], [thread('existing'), 1], [attached, 1], [thread(), 2]]) {
      const { result, calls, stops } = await fixture([thread(), fresh], {
        reject: action => {
          if (action === 'type') throw Object.assign(new Error('Read again'), { code });
          return false;
        }
      });
      assert.equal(result.send_attempted, false);
      assert.equal(calls.some(c => c.action === 'tap'), false);
      assert.equal(calls.filter(c => c.action === 'type').length, expectedTypes);
      assert.equal(stops, 1);
    }
  });

  test(`${code} on Send never retries Send or returns to composing`, async () => {
    const { result, calls } = await fixture([thread(), thread('Hi how are ya')], {
      reject: action => {
        if (action === 'tap') throw Object.assign(new Error('Read again'), { code });
        return false;
      }
    });
    assert.equal(result.status, 'send_uncertain');
    assert.equal(result.send_attempted, true);
    assert.equal(calls.filter(c => c.action === 'tap').length, 1);
    assert.equal(calls.filter(c => c.action === 'type').length, 1);
  });
}

test('composed attachments stop a text-only workflow before typing or sending', async () => {
  const value = thread(); value.elements.push(node('attachment_preview', 'photo'));
  const { result, calls } = await fixture([value]);
  assert.equal(result.error.code, 'EXISTING_ATTACHMENT');
  assert.equal(calls.some(c => c.action === 'type' || c.action === 'tap'), false);
});

test('failed post-Send read retains Send acknowledgement and never resends', async () => {
  const { result, calls } = await fixture([thread(), thread('Hi how are ya')]);
  assert.equal(result.status, 'send_uncertain'); assert.equal(result.send_acknowledged, true);
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
});

test('search is submitted before interpreting results', async () => {
  const search = () => screen(node('search', 'Search', { editable: true, supportsSetText: true, supportsImeEnter: true }));
  const { result, calls } = await fixture([
    screen(node('search_messages', 'Search messages')), search(), search(), inbox(), thread(), thread('Hi how are ya'), thread('', 'Tote', true)
  ]);
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'submit').length, 1);
});

test('unavailable search submission stops without claiming no matches', async () => {
  const search = () => screen(node('search', 'Search', { editable: true, supportsSetText: true }));
  const { result } = await fixture([screen(node('search_messages', 'Search messages')), search(), search(), search()]);
  assert.equal(result.error.code, 'SEARCH_NOT_SUBMITTED'); assert.equal(result.send_attempted, false);
});

test('S23+ search results open exact swipeableContainer and verify Compose toolbar header', async () => {
  const search = () => screen(node('zero_state_search_box_auto_complete', 'tote', { editable: true, supportsSetText: true, supportsImeEnter: true }));
  const s23Thread = (text = '', recipient = 'Tote', delivered = false) => {
    const value = thread(text, recipient, delivered);
    value.elements[0].viewId = 'top_app_bar_title_row';
    return value;
  };
  const results = screen(
    node('swipeableContainer', 'Tote · You: earlier message · 18 min'),
    node('swipeableContainer', '…Tote… · another message'),
    node('swipeableContainer', '…Tote, Other… · group message'),
    node('contact', 'Tote · Mobile'));
  const expected = results.snapshot;
  const { result, calls } = await fixture([
    screen(node('search_messages', 'Search messages')), search(), search(), results,
    s23Thread(), s23Thread('Hi how are ya'), s23Thread('', 'Tote', true)
  ]);
  assert.equal(result.status, 'delivered');
  assert.deepEqual(calls.find(c => c.action === 'tap' && c.args.snapshot_id === expected)?.args,
    { snapshot_id: expected, target_id: 1 });
  assert.equal(calls.filter(c => c.action === 'submit').length, 1);
  assert.equal(result.send_attempted, true);
});

test('S23+ rows still reject duplicate exact recipients and wrong Compose header', async () => {
  const wrongThread = thread('', 'Other');
  wrongThread.elements[0].viewId = 'top_app_bar_title_row';
  for (const screens of [
    [screen(node('swipeableContainer', 'Tote · first'), node('swipeableContainer', 'Tote · second'))],
    [screen(node('swipeableContainer', 'Tote · earlier message')), wrongThread]
  ]) {
    const { result, calls, stops } = await fixture(screens);
    assert.equal(result.send_attempted, false);
    assert.equal(calls.some(c => c.action === 'type'), false);
    assert.equal(stops, 1);
  }
});

test('existing task is not taken over or stopped', async () => {
  let stopped = false;
  await assert.rejects(fixture([], { busy: () => true, stop: () => { stopped = true; } }), { code: 'BUSY' });
  assert.equal(stopped, false);
});

test('S23+ empty RCS placeholder with voice control allows composing and one Send', async () => {
  const empty = thread('RCS message');
  empty.elements[2] = { ...node('unused', 'Show record a voice message screen'), viewId: 'Compose:Draft:Send' };
  const { result, calls } = await fixture([empty, thread('Hi how are ya'), thread('', 'Tote', true)]);
  assert.equal(result.status, 'delivered');
  assert.equal(calls.filter(c => c.action === 'type').length, 1);
  assert.equal(calls.filter(c => c.action === 'tap').length, 1);
});

test('placeholder text alone or real text with voice control remains a protected draft', async () => {
  const real = thread('saved draft');
  real.elements[2] = { ...node('unused', 'Show record a voice message screen'), viewId: 'Compose:Draft:Send' };
  const both = thread('RCS message');
  both.elements.push({ ...node('unused', 'Show record a voice message screen'), viewId: 'Compose:Draft:Send' });
  for (const value of [thread('RCS message'), real, both]) {
    const { result, calls } = await fixture([value]);
    assert.equal(result.error.code, 'EXISTING_DRAFT');
    assert.equal(calls.some(c => c.action === 'type' || c.action === 'tap'), false);
  }
});
