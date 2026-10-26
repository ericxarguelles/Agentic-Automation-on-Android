import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionServer } from '../src/connection-server.mjs';
import { runTerminalCommand, formatClickTargets } from '../src/terminal-commands.mjs';

test('element clicks require a recent read, valid target and active session', async () => {
  let clock = 1000;
  const token = 'b'.repeat(48);
  const server = createConnectionServer(token, () => {}, () => clock);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: `Bearer ${token}` };
    const send = async (path, method = 'GET', body) => {
      const response = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const { session } = await send('/v1/session', 'POST');
    const next = () => send(`/v1/session/${session}/next`);
    const result = (id, value) => send(`/v1/session/${session}/result`, 'POST', { id, result: value });
    const read = async (snapshot = 'screen-1') => {
      assert.match(server.requestRead(), /queued/);
      const command = await next();
      await result(command.id, { snapshot, clicksAvailable: true, elements: [
        { id: 7, visible: true, enabled: true, clickable: true },
        { id: 8, visible: true, enabled: false, clickable: true },
        { id: 9, visible: false, enabled: true, clickable: true }
      ] });
    };
    assert.match(server.requestElementTap(7), /Run read/);
    await read();
    assert.match(server.requestElementTap(8), /Choose/);
    assert.match(server.requestElementTap(9), /Choose/);
    assert.match(server.requestElementTap(-1), /non-negative/);
    assert.match(runTerminalCommand(server, 'tap 7'), /queued/);
    const click = await next();
    assert.deepEqual({ action: click.action, snapshot: click.snapshot, element: click.element },
      { action: 'tap_element', snapshot: 'screen-1', element: 7 });
    assert.equal((await next()).action, 'idle');
    assert.match(server.requestElementTap(7), /pending/);
    await result(click.id, { error: 'Screen changed' });
    assert.match(server.requestElementTap(7), /Run read/);
    await read('screen-2');
    clock += 30000;
    assert.match(server.requestElementTap(7), /Run read/);
    await read('screen-3');
    server.requestRead();
    await result((await next()).id, { error: 'Device locked' });
    assert.match(server.requestElementTap(7), /Run read/);
    await read('screen-4');
    clock += 300000;
    assert.match(server.requestElementTap(7), /No active/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('terminal parser rejects malformed click commands', () => {
  const server = { requestElementTap: value => value, requestTap: () => 'demo', requestRead: () => 'read' };
  for (const command of ['tap -1', 'tap 1.5', 'tap 2 extra', 'tap x']) {
    assert.match(runTerminalCommand(server, command), /Commands:/);
  }
  assert.equal(runTerminalCommand(server, 'tap'), 'demo');
  assert.equal(runTerminalCommand(server, 'read'), 'read');
});

test('clickable summary associates child labels with the correct container', () => {
  const summary = formatClickTargets({ result: { clicksAvailable: true, elements: [
    { id: 7, path: '0/1', visible: true, enabled: true, clickable: true },
    { path: '0/1/0', text: 'Display' },
    { path: '0/10/0', text: 'Unrelated' }
  ] } });
  assert.match(summary, /\s1\s+tap\s+Display/);
  assert.doesNotMatch(summary, /Unrelated/);
});
