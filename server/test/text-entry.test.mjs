import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionServer } from '../src/connection-server.mjs';
import { runTerminalCommand, formatClickTargets } from '../src/terminal-commands.mjs';

async function fixture(t) {
  let clock = 1000;
  const token = 'd'.repeat(48);
  const server = createConnectionServer(token, () => {}, () => clock);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}` };
  const send = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const { session } = await send('/v1/session', 'POST');
  const path = `/v1/session/${session}`;
  const next = () => send(`${path}/next`);
  const result = (id, value) => send(`${path}/result`, 'POST', { id, result: value });
  const field = { id: 12, visible: true, enabled: true, editable: true, supportsSetText: true };
  const read = async (complete = true) => {
    assert.match(server.requestRead(), /queued/);
    const command = await next();
    await result(command.id, { snapshot: 'search-field', clicksAvailable: complete, elements: [
      field,
      { ...field, id: 13, enabled: false },
      { ...field, id: 14, visible: false },
      { ...field, id: 15, password: true },
      { ...field, id: 16, supportsSetText: false },
      { ...field, id: 17, editable: false }
    ] });
  };
  return { server, next, result, read, stop: () => send(path, 'DELETE'), advance: ms => { clock += ms; } };
}

test('type parses JSON strings literally, including quotes, Unicode, newlines and empty text', () => {
  const actual = [];
  const server = { requestSetText: (id, text) => { actual.push({ id, text }); return 'queued'; } };
  for (const text of ['display', '', 'say "hello"', 'line one\nline two', 'café 📱', '$(literal) `text` \\path']) {
    assert.equal(runTerminalCommand(server, `type 12 ${JSON.stringify(text)}`), 'queued');
    assert.deepEqual(actual.at(-1), { id: 12, text });
  }
});

test('type rejects malformed strings and does not echo their contents in errors', () => {
  const server = { requestSetText: () => assert.fail('Invalid input must not dispatch') };
  for (const command of ['type 12 secret', 'type 12 "secret', 'type 12 "secret" extra', 'type 12 123',
    'type 12 null', 'type 12 {}', 'type 12 []', 'type -1 "secret"', 'type x "secret"']) {
    const response = runTerminalCommand(server, command);
    assert.match(response, /Use type|Commands:/);
    assert.doesNotMatch(response, /secret/);
  }
});

test('text replacement targets only an eligible field and consumes a snapshot once', async t => {
  const { server, next, result, read } = await fixture(t);
  assert.match(server.requestSetText(12, 'display'), /Run read/);
  await read();
  for (const id of [13, 14, 15, 16, 17, 99]) assert.match(server.requestSetText(id, 'display'), /Choose/);
  assert.match(runTerminalCommand(server, 'type 12 "display"'), /queued/);
  const command = await next();
  assert.deepEqual({ action: command.action, snapshot: command.snapshot, element: command.element, text: command.text },
    { action: 'set_text', snapshot: 'search-field', element: 12, text: 'display' });
  assert.equal((await next()).action, 'idle');
  assert.match(server.requestSetText(12, 'again'), /pending/);
  await result(command.id, { accepted: true, textLength: 7 });
  assert.match(server.requestSetText(12, 'again'), /Run read/);
});

test('invalid text and element IDs are rejected; empty text and the length boundary are valid', async t => {
  const { server, next, result, read } = await fixture(t);
  await read();
  for (const id of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
    assert.match(server.requestSetText(id, 'display'), /non-negative/);
  }
  for (const text of [null, 123, {}, 'x'.repeat(1001), '\u0000', '📱'.repeat(501)]) {
    assert.match(server.requestSetText(12, text), /at most 1000/);
  }
  assert.match(server.requestSetText(12, ''), /queued/);
  const clear = await next();
  assert.equal(clear.text, '');
  await result(clear.id, { accepted: true });
  await read();
  assert.match(server.requestSetText(12, '📱'.repeat(500)), /queued/);
  assert.equal((await next()).text.length, 1000);
});

test('truncation, expiry, device rejection and session stop prevent stale text replacement', async t => {
  const { server, next, result, read, advance, stop } = await fixture(t);
  await read(false);
  assert.match(server.requestSetText(12, 'display'), /Run read/);
  await read();
  advance(30000);
  assert.match(server.requestSetText(12, 'display'), /Run read/);
  await read();
  server.requestSetText(12, 'display');
  await result((await next()).id, { error: 'Target changed into a password field' });
  assert.match(server.requestSetText(12, 'display'), /Run read/);
  await read();
  server.requestSetText(12, 'display');
  await stop();
  assert.match(server.requestSetText(12, 'display'), /No active/);
});

test('session expiry blocks text replacement', async t => {
  const { server, read, advance } = await fixture(t);
  await read();
  advance(300000);
  assert.match(server.requestSetText(12, 'display'), /No active/);
});

test('editable summary includes hints and excludes ineligible fields', () => {
  const field = { id: 12, path: '0/1', visible: true, enabled: true, editable: true, supportsSetText: true, hint: 'Search settings' };
  const summary = formatClickTargets({ result: { clicksAvailable: true, elements: [
    field, { ...field, id: 13, enabled: false }, { ...field, id: 14, password: true },
    { ...field, id: 15, supportsSetText: false }
  ] } });
  assert.match(summary, /Screen actions/);
  assert.match(summary, /\s1\s+type\s+Search settings/);
  assert.doesNotMatch(summary, /No editable fields/);
  assert.doesNotMatch(summary, /\s2\s+type/);
});
