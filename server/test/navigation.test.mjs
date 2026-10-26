import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionServer } from '../src/connection-server.mjs';
import { runTerminalCommand, formatClickTargets } from '../src/terminal-commands.mjs';

async function fixture(t) {
  let clock = 1000;
  const token = 'c'.repeat(48);
  const server = createConnectionServer(token, () => {}, () => clock);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const headers = { Authorization: `Bearer ${token}` };
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const { session } = await send('/v1/session', 'POST');
  const path = `/v1/session/${session}`;
  const next = () => send(`${path}/next`);
  const result = (id, value) => send(`${path}/result`, 'POST', { id, result: value });
  const read = async (complete = true) => {
    assert.match(server.requestRead(), /queued/);
    const command = await next();
    await result(command.id, { snapshot: 'navigation-screen', clicksAvailable: complete, elements: [
      { id: 5, visible: true, enabled: true, scrollable: true, scrollDirections: ['down'] },
      { id: 6, visible: true, enabled: false, scrollable: true, scrollDirections: ['up', 'down'] },
      { id: 7, visible: false, enabled: true, scrollable: true, scrollDirections: ['down'] },
      { id: 8, visible: true, enabled: true, clickable: true }
    ] });
  };
  return { server, next, result, read, stop: () => send(path, 'DELETE'), advance: ms => { clock += ms; } };
}

test('scroll queues only an advertised direction on a valid container, once', async t => {
  const { server, next, result, read } = await fixture(t);
  assert.match(server.requestScroll(5, 'down'), /Run read/);
  await read();
  for (const [id, direction] of [[5, 'up'], [6, 'down'], [7, 'down'], [8, 'down']]) {
    assert.match(server.requestScroll(id, direction), /Choose/);
  }
  assert.match(server.requestScroll(-1, 'down'), /non-negative/);
  assert.match(server.requestScroll(5, 'left'), /Use scroll/);
  assert.match(runTerminalCommand(server, 'scroll 5 down'), /queued/);
  const command = await next();
  assert.deepEqual({ action: command.action, element: command.element, direction: command.direction, snapshot: command.snapshot },
    { action: 'scroll_element', element: 5, direction: 'down', snapshot: 'navigation-screen' });
  assert.equal((await next()).action, 'idle');
  assert.match(server.requestBack(), /pending/);
  await result(command.id, { accepted: true });
  assert.match(server.requestBack(), /Run read/);
  assert.match(server.requestScroll(5, 'down'), /Run read/);
});

test('back requires a fresh complete read and consumes it even when Android rejects the action', async t => {
  const { server, next, result, read, advance } = await fixture(t);
  assert.match(server.requestBack(), /Run read/);
  await read(false);
  assert.match(server.requestBack(), /Run read/);
  await read();
  advance(30000);
  assert.match(server.requestBack(), /Run read/);
  assert.match(server.requestScroll(5, 'down'), /Run read/);
  await read();
  assert.match(runTerminalCommand(server, 'back'), /queued/);
  const command = await next();
  assert.equal(command.action, 'back');
  assert.equal(command.snapshot, 'navigation-screen');
  await result(command.id, { error: 'Screen changed' });
  assert.match(server.requestBack(), /Run read/);
});

test('stop drops queued navigation and session expiry blocks new navigation', async t => {
  const { server, read, stop, advance } = await fixture(t);
  await read();
  server.requestBack();
  await stop();
  assert.match(server.requestBack(), /No active/);
  assert.match(server.requestScroll(5, 'down'), /No active/);
  advance(300000);
  assert.match(server.requestRead(), /No active/);
});

test('live session expiry blocks back and scroll even with a stored snapshot', async t => {
  const { server, read, advance } = await fixture(t);
  await read();
  advance(300000);
  assert.match(server.requestBack(), /No active/);
  assert.match(server.requestScroll(5, 'down'), /No active/);
});

test('navigation parser rejects malformed commands and reports scrollable containers', () => {
  for (const command of ['back now', 'scroll down', 'scroll -1 down', 'scroll 1.5 up', 'scroll 1 left', 'scroll 1 down extra']) {
    assert.match(runTerminalCommand({}, command), /Commands:/);
  }
  const summary = formatClickTargets({ result: { clicksAvailable: true, elements: [
    { id: 5, visible: true, enabled: true, scrollable: true, scrollDirections: ['down'], class: 'RecyclerView' },
    { id: 6, visible: true, enabled: false, scrollable: true, scrollDirections: ['down'] }
  ] } });
  assert.match(summary, /Screen actions/);
  assert.match(summary, /\s1\s+scroll down\s+RecyclerView container/);
  assert.doesNotMatch(summary, /\s2\s+scroll/);
  assert.match(formatClickTargets({ result: { clicksAvailable: false, elements: [] } }), /navigation is unavailable/);
});
