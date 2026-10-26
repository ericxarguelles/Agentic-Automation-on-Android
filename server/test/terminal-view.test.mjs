import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActionTable, createTerminalController } from '../src/terminal-view.mjs';
import { runTerminalCommand, formatClickTargets } from '../src/terminal-commands.mjs';
import { createConnectionServer } from '../src/connection-server.mjs';

const screen = { clicksAvailable: true, snapshot: 'settings', elements: [
  { id: 2, path: '0/0', visible: true, enabled: true, clickable: true, text: 'Search Settings' },
  { id: 4, path: '0/1', visible: true, enabled: true, scrollable: true, scrollDirections: ['down'], class: 'android.widget.ScrollView' },
  { id: 7, path: '0/1/0', visible: true, enabled: true, clickable: true, text: 'Google' },
  { id: 11, path: '0/1/1', visible: true, enabled: false, clickable: true, text: 'Disabled' },
  { id: 14, path: '0/1/2', visible: false, enabled: true, clickable: true, text: 'Hidden' },
  { id: 15, path: '0/1/3', visible: true, enabled: true, text: 'Passive text' }
] };

test('action table has consecutive IDs and a single entry per actionable node', () => {
  const table = buildActionTable(screen);
  assert.deepEqual(table.map(item => item.id), [1, 2, 3]);
  assert.deepEqual(table.map(item => item.elementId), [2, 4, 7]);
  assert.equal(table[0].label, 'Search Settings');
  assert.equal(table[1].label, 'ScrollView container');
  assert.deepEqual(table[1].directions, ['down']);
  const editable = buildActionTable({ elements: [{ ...screen.elements[0], editable: true, supportsSetText: true }] });
  assert.equal(editable.length, 1);
  assert.equal(editable[0].tap, true);
  assert.equal(editable[0].type, true);
});

test('passive tree changes do not introduce gaps or renumber unchanged actions', () => {
  const changed = { ...screen, elements: [
    { id: 1, visible: true, enabled: true, text: 'Extra passive node' },
    ...screen.elements.map(item => ({ ...item, id: item.id + 20 }))
  ] };
  assert.deepEqual(buildActionTable(changed).map(({ elementId, ...item }) => item),
    buildActionTable(screen).map(({ elementId, ...item }) => item));
});

test('screen output explains missing edit fields and strips terminal control characters', () => {
  const summary = formatClickTargets({ result: screen });
  assert.match(summary, /No editable fields on this screen/);
  assert.match(summary, /Open a search\/text field/);
  assert.match(summary, /IDs are local to this snapshot/);
  const injected = buildActionTable({ elements: [{ ...screen.elements[0], text: 'Display\u001b[31m\nNext' }] });
  assert.doesNotMatch(injected[0].label, /[\u0000-\u001f]/);
});

test('terminal alias translates tap, scroll and type IDs and invalidates on queue', () => {
  const calls = [];
  const server = {
    requestRead: () => 'Screen read queued.',
    requestTap: () => 'Test-button tap queued.',
    requestBack: () => 'Back queued.',
    requestElementTap: id => { calls.push(['tap', id]); return 'Element tap queued.'; },
    requestScroll: (id, direction) => { calls.push(['scroll', id, direction]); return 'Element scroll queued.'; },
    requestSetText: (id, text) => { calls.push(['type', id, text]); return 'Text replacement queued.'; }
  };
  const terminal = createTerminalController(server);
  terminal.acceptResult({ result: screen });
  assert.match(runTerminalCommand(terminal, 'tap 1'), /queued/);
  assert.deepEqual(calls.pop(), ['tap', 2]);
  assert.match(runTerminalCommand(terminal, 'tap 1'), /Choose/);
  terminal.acceptResult({ result: screen });
  runTerminalCommand(terminal, 'scroll 2 down');
  assert.deepEqual(calls.pop(), ['scroll', 4, 'down']);
  terminal.acceptResult({ result: { ...screen, elements: [{ ...screen.elements[0], id: 101, editable: true, supportsSetText: true }] } });
  runTerminalCommand(terminal, 'type 1 "display"');
  assert.deepEqual(calls.pop(), ['type', 101, 'display']);
  terminal.acceptResult({ result: screen });
  runTerminalCommand(terminal, 'read');
  assert.match(runTerminalCommand(terminal, 'tap 1'), /Choose/);
  terminal.acceptResult({ result: screen });
  runTerminalCommand(terminal, 'back');
  assert.match(runTerminalCommand(terminal, 'tap 1'), /Choose/);
  terminal.acceptResult({ result: { ...screen, clicksAvailable: false } });
  assert.match(runTerminalCommand(terminal, 'tap 1'), /Choose/);
});

test('details is local and identifies native IDs as diagnostic', () => {
  const terminal = createTerminalController({});
  assert.match(runTerminalCommand(terminal, 'details'), /No result/);
  terminal.acceptResult({ result: screen });
  assert.match(runTerminalCommand(terminal, 'details'), /native IDs are diagnostic/);
  assert.match(runTerminalCommand(terminal, 'details'), /"id": 7/);
});

test('terminal alias reaches the correct device target through an authenticated session', async t => {
  const token = 'e'.repeat(48);
  const server = createConnectionServer(token, result => terminal.acceptResult(result));
  const terminal = createTerminalController(server);
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
  runTerminalCommand(terminal, 'read');
  const read = await send(`${path}/next`);
  await send(`${path}/result`, 'POST', { id: read.id, result: screen });
  assert.match(runTerminalCommand(terminal, 'tap 3'), /queued/);
  const tap = await send(`${path}/next`);
  assert.equal(tap.action, 'tap_element');
  assert.equal(tap.element, 7);
  assert.equal(tap.snapshot, 'settings');
  assert.match(runTerminalCommand(terminal, 'tap 3'), /Choose/);
  await send(`${path}/result`, 'POST', { id: tap.id, result: { accepted: true } });
  assert.match(runTerminalCommand(terminal, 'tap 3'), /Choose/);
});
