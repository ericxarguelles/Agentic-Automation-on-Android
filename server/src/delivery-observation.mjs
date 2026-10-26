export const DELIVERY_WAIT_MS = 850;

const descriptions = screen => [...new Set((screen?.elements ?? [])
  .filter(item => item.visible !== false && !item.password)
  .map(item => item.description).filter(value => typeof value === 'string'))];
const identity = value => value.replace(/^Not yet delivered outgoing message /, 'You said ')
  .replace(/(\d{1,2}:\d{2})\u202f(AM|PM)(?= \.(?:,|$))/g, '$1 $2')
  .replace(/, Delivered\./, ',').replace(/, Read\./, ',');
const timestamp = /^\d{1,2}:\d{2}[ \u202f](?:AM|PM) \./;

// Inspect formatting without exporting message bodies. Presentation labels
// collapse whitespace, so their rendered text cannot diagnose raw parser misses.
export function deliveryDescriptionFormats(screen) {
  if (screen?.package !== 'com.google.android.apps.messaging') return [];
  return descriptions(screen).filter(value => /^(You said |Not yet delivered outgoing message )/.test(value)).map(value => {
    const tail = [...value.matchAll(/\d{1,2}:\d{2}\s*(?:AM|PM) \./g)].at(-1)?.[0] ?? '';
    return { timestamp_found: !!tail, legacy_timestamp_matches: /^\d{1,2}:\d{2} (?:AM|PM) \./.test(tail),
      timestamp_matches: timestamp.test(tail),
      explicit_receipt: /, (Delivered|Read)\./.test(value),
      timestamp_format: tail.replace(/[0-9]/g, '#'),
      unusual_whitespace: [...new Set([...tail].filter(char => /\s/u.test(char) && char !== ' ').map(char => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`))] };
  });
}

// Only explicit Google Messages outgoing descriptions count as delivery evidence.
// Exclude pre-existing messages, including ones whose delivery status just changed.
export function deliveryEvidence(before, after, text) {
  if (after?.package !== 'com.google.android.apps.messaging') return { status: 'unknown', reason: 'unexpected_app' };
  const old = new Set(descriptions(before).map(identity));
  const diagnostics = { exact_prefix_matches: 0, unsupported_timestamp: 0, preexisting_matches: 0, new_candidates: 0 };
  const candidates = descriptions(after).filter(value => {
    const prefix = [`You said ${text} `, `Not yet delivered outgoing message ${text} `].find(part => value.startsWith(part));
    if (!prefix) return false;
    diagnostics.exact_prefix_matches++;
    // Only timestamp formatting is flexible. Never normalize the message body.
    if (!timestamp.test(value.slice(prefix.length))) { diagnostics.unsupported_timestamp++; return false; }
    if (old.has(identity(value))) { diagnostics.preexisting_matches++; return false; }
    diagnostics.new_candidates++;
    return true;
  });
  if (candidates.length !== 1) return { status: 'unknown', reason: candidates.length ? 'ambiguous_new_outgoing' :
    diagnostics.unsupported_timestamp ? 'unsupported_outgoing_timestamp' : 'no_new_exact_outgoing', diagnostics };
  const evidence = candidates[0];
  const suffix = evidence.slice((evidence.startsWith('You said ') ? `You said ${text} ` : `Not yet delivered outgoing message ${text} `).length);
  const confirmed = /^You said /.test(evidence) && /^\d{1,2}:\d{2}[ \u202f](?:AM|PM) \., (Delivered|Read)\./.test(suffix);
  const pending = /^Not yet delivered /.test(evidence);
  return { status: confirmed ? 'delivered' : pending ? 'pending' : 'unknown',
    reason: confirmed ? 'explicit_delivery_receipt' : pending ? 'explicit_pending_message' : 'outgoing_without_delivery_receipt', evidence, diagnostics };
}

export async function observeDelivery({ before, text, read, maxWaitMs = DELIVERY_WAIT_MS, now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const started = now();
  let screen;
  let delivery = { status: 'unknown' };
  let reads = 0;
  const observations = [];
  do {
    screen = await read();
    reads++;
    delivery = deliveryEvidence(before, screen, text);
    // Retain diagnostic reasons, not the conversation or message body.
    observations.push({ elapsed_ms: Math.round(now() - started), status: delivery.status, reason: delivery.reason, diagnostics: delivery.diagnostics });
    // A malformed/ambiguous observation needs diagnosis, not repeated polling.
    if (delivery.status === 'delivered' || ['unsupported_outgoing_timestamp', 'ambiguous_new_outgoing', 'unexpected_app'].includes(delivery.reason)) break;
    const remaining = maxWaitMs - (now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(100, remaining));
  } while (now() - started < maxWaitMs);
  return { screen, delivery: { ...delivery, max_wait_ms: maxWaitMs,
    elapsed_ms: Math.round(now() - started), reads, observations } };
}
