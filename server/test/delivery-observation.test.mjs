import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryEvidence, observeDelivery, deliveryDescriptionFormats } from '../src/delivery-observation.mjs';

const screen = (...description) => ({ package: 'com.google.android.apps.messaging', elements: description.map(value => ({ description: value, visible: true })) });
const pending = 'Not yet delivered outgoing message Hi how are ya 1:02 AM ., End-to-end encrypted message';
const delivered = 'You said Hi how are ya 1:02 AM ., Delivered. End-to-end encrypted message';

test('observed S23+ narrow no-break timestamp is recognized without changing exact message matching', async () => {
  const observed = delivered.replace('1:02 AM', '2:17\u202fAM');
  assert.equal(deliveryDescriptionFormats(screen(observed))[0].legacy_timestamp_matches, false);
  assert.deepEqual(deliveryDescriptionFormats(screen(observed))[0].unusual_whitespace, ['U+202F']);
  const result = await observeDelivery({ before: screen(), text: 'Hi how are ya', read: async () => screen(observed, observed),
    now: () => 0, sleep: () => assert.fail('No wait after receipt') });
  assert.equal(result.delivery.status, 'delivered');
  assert.equal(result.delivery.reads, 1);
  assert.equal(result.delivery.diagnostics.new_candidates, 1);
  assert.equal(deliveryEvidence(screen(), screen(observed.replace('how are', 'how\u202fare')), 'Hi how are ya').status, 'unknown');
  assert.equal(deliveryEvidence(screen(observed.replace('\u202f', ' ')), screen(observed), 'Hi how are ya').status, 'unknown');
  assert.equal(deliveryEvidence(screen(pending.replace('1:02 AM', '2:17\u202fAM')), screen(observed), 'Hi how are ya').status, 'unknown');
});

test('unsupported formatting stops polling and retains body-free diagnostics', async () => {
  const result = await observeDelivery({ before: screen(), text: 'Hi how are ya', read: async () => screen(delivered.replace('1:02 AM', 'yesterday')),
    now: () => 0, sleep: () => assert.fail('Unsupported format cannot be fixed by waiting') });
  assert.equal(result.delivery.reason, 'unsupported_outgoing_timestamp');
  assert.equal(result.delivery.reads, 1);
  assert.equal(result.delivery.diagnostics.unsupported_timestamp, 1);
  assert.ok(!JSON.stringify(result.delivery.observations).includes('Hi how are ya'));
});

test('receipt-like text inside a message body never confirms delivery', () => {
  const text = 'Test, Delivered. still waiting';
  assert.equal(deliveryEvidence(screen(), screen(`You said ${text} 2:17\u202fAM .`), text).status, 'unknown');
  assert.equal(deliveryEvidence(screen(), screen(`You said ${text} 2:17\u202fAM ., Delivered.`), text).status, 'delivered');
  const formats = deliveryDescriptionFormats(screen('You said private 1:00 AM . secret 2:17\u202fAM ., Delivered.'));
  assert.ok(!JSON.stringify(formats).includes('private'));
  assert.ok(!JSON.stringify(formats).includes('secret'));
});

test('delivery checks require a new exact outgoing message and explicit delivery evidence', () => {
  assert.equal(deliveryEvidence(screen(), screen(delivered), 'Hi how are ya').status, 'delivered');
  assert.equal(deliveryEvidence(screen(delivered), screen(delivered), 'Hi how are ya').status, 'unknown');
  assert.equal(deliveryEvidence(screen(pending), screen(delivered), 'Hi how are ya').status, 'unknown');
  assert.equal(deliveryEvidence(screen(), screen(pending), 'Hi how are ya').status, 'pending');
  assert.equal(deliveryEvidence(screen(), screen(delivered), 'Hi').status, 'unknown');
  assert.equal(deliveryEvidence(screen(), { ...screen(delivered), package: 'other.app' }, 'Hi how are ya').status, 'unknown');
});

test('delivery confirmation returns immediately without a fixed delay', async () => {
  const result = await observeDelivery({ before: screen(), text: 'Hi how are ya', read: async () => screen(delivered),
    now: () => 0, sleep: () => assert.fail('Must not sleep after delivery') });
  assert.equal(result.delivery.status, 'delivered');
  assert.equal(result.delivery.reads, 1);
});

test('a successful outgoing message without a receipt is distinguished from missing evidence', () => {
  const sent = 'You said Hi how are ya 1:57 AM .';
  assert.equal(deliveryEvidence(screen(), screen(sent), 'Hi how are ya').reason, 'outgoing_without_delivery_receipt');
  assert.equal(deliveryEvidence(screen(), screen(sent), 'Hi how are ya').status, 'unknown');
  assert.equal(deliveryEvidence(screen(sent), screen(sent), 'Hi how are ya').reason, 'no_new_exact_outgoing');
  assert.equal(deliveryEvidence(screen(), screen(delivered, delivered), 'Hi how are ya').status, 'delivered');
});

test('pending checks stop scheduling at 850 ms and never dispatch a send', async () => {
  let clock = 0;
  let reads = 0;
  const result = await observeDelivery({ before: screen(), text: 'Hi how are ya',
    read: async () => { reads++; clock += 50; return screen(pending); },
    now: () => clock, sleep: async ms => { clock += ms; } });
  assert.equal(clock, 850);
  assert.equal(result.delivery.status, 'pending');
  assert.equal(reads, 6);
  assert.equal(result.delivery.max_wait_ms, 850);
  assert.equal(result.delivery.observations.length, reads);
  assert.ok(result.delivery.observations.every(item => item.reason === 'explicit_pending_message'));
  assert.ok(result.delivery.observations.every(item => !('evidence' in item)));
});

test('an in-flight slow read is reported honestly and no further reads are scheduled', async () => {
  let clock = 0;
  const result = await observeDelivery({ before: screen(), text: 'Hi how are ya',
    read: async () => { clock = 1000; return screen(pending); }, now: () => clock,
    sleep: () => assert.fail('No further waiting') });
  assert.equal(result.delivery.elapsed_ms, 1000);
  assert.equal(result.delivery.reads, 1);
});
