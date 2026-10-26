import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createConnectionServer } from '../src/connection-server.mjs';
import { createMcpHttpServer } from '../src/mcp/http-server.mjs';
import { benchmarkFor } from '../src/benchmark.mjs';

test('benchmark tools record actual MCP calls across stateless requests without operating the phone on start or finish', async t => {
  const { mkdtempSync, rmSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'android-benchmark-mcp-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const f = await fixture(t);
  benchmarkFor(f.device).directory = directory;
  const armed = await f.call('phone_benchmark_start', { experiment: 'test-only', task_label: 'Synthetic settings check', iteration: 1, root_cause: 'Synthetic test cause', change: 'Synthetic test correction' });
  assert.equal(armed.structuredContent.data.state, 'armed');
  assert.equal(f.device.getStatus().session_active, false);
  assert.equal(readdirSync(directory).filter(n => n.endsWith('.json')).length, 1);
  await f.pair();
  const screen = await f.read();
  const action = f.call('phone_action_and_observe', { action: 'tap', snapshot_id: screen.snapshot_id, target_id: 1, settle_ms: 0 });
  const tap = await f.next();
  await f.result(tap.id, { accepted: true });
  const read = await f.next();
  await f.result(read.id, { snapshot: 'benchmark-after', clicksAvailable: true, elements: [] });
  assert.equal((await action).structuredContent.ok, true);
  const premature = await f.call('phone_benchmark_finish', { outcome: 'success', verified: true });
  assert.equal(premature.structuredContent.error.code, 'BUSY');
  await f.call('phone_stop_session');
  const status = (await f.call('phone_benchmark_status')).structuredContent.data;
  assert.equal(status.calls.length, 3);
  assert.equal(status.summary.steps, 1);
  assert.equal(status.summary.screen_reads, 2);
  assert.equal(status.summary.ai_inference_ms, null);
  assert.equal(Object.hasOwn(status.summary.timing, 'screenshots'), false);
  const finished = (await f.call('phone_benchmark_finish', { outcome: 'success', verified: true, waste_reviewed: true, notes: 'Synthetic fixture verified' })).structuredContent.data;
  assert.equal(finished.label, 'clean_success');
  assert.equal(finished.iteration, 1);
  assert.equal(finished.finalized, true);
  assert.equal(f.device.getStatus().session_active, false);
});

async function fixture(t, commandTimeoutMs = 1000) {
  const deviceToken = 'device-token-'.repeat(4);
  const mcpToken = 'mcp-token-'.repeat(5);
  const device = createConnectionServer(deviceToken, () => {}, Date.now, { commandTimeoutMs });
  const mcp = createMcpHttpServer(device, mcpToken);
  await Promise.all([device, mcp].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
  const url = `http://127.0.0.1:${mcp.address().port}/mcp`;
  const base = `http://127.0.0.1:${device.address().port}`;
  const client = new Client({ name: 'phone-control-test', version: '1.0.0' });
  t.after(async () => {
    device.stopSession();
    await client.close();
    await Promise.all([device, mcp].map(server => new Promise(resolve => server.close(resolve))));
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${mcpToken}` } } }));
  const send = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${deviceToken}` }, body: body && JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  };
  let session;
  const pair = async () => { session = (await send('/v1/session', 'POST')).session; };
  const next = async () => {
    const deadline = Date.now() + 1000;
    do {
      const command = await send(`/v1/session/${session}/next`);
      if (command.action !== 'idle') return command;
      await new Promise(resolve => setTimeout(resolve, 5));
    } while (Date.now() < deadline);
    assert.fail('Expected a device command');
  };
  const result = (id, value) => send(`/v1/session/${session}/result`, 'POST', { id, result: value });
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  const read = async () => {
    const response = call('phone_read_screen');
    const command = await next();
    assert.equal(command.action, 'read');
    await result(command.id, { snapshot: randomUUID(), package: 'com.android.settings', clicksAvailable: true, elements: [
      { id: 7, path: '0/0', visible: true, enabled: true, clickable: true, text: 'Display' },
      { id: 10, path: '0/1', visible: true, enabled: true, scrollable: true, scrollDirections: ['down'] },
      { id: 12, path: '0/2', visible: true, enabled: true, editable: true, supportsSetText: true, hint: 'Search Settings' }
    ] });
    const reply = await response;
    assert.equal(reply.content[0].text, 'OK. Full result in structuredContent.');
    assert.ok(JSON.stringify(reply.content).length < JSON.stringify(reply.structuredContent).length / 2);
    assert.equal(reply.structuredContent.data.app_navigation_guide, undefined);
    assert.equal(reply.structuredContent.data.note, undefined);
    return reply.structuredContent.data;
  };
  return { device, client, call, read, pair, next, result, url, mcpToken, deviceToken, send };
}

test('message workflow is exposed over MCP and refuses an existing task', async t => {
  const f = await fixture(t);
  const tools = await f.client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === 'phone_send_message'));
  // An existing task must not be taken over or stopped by the workflow.
  await f.pair();
  const rejected = await f.call('phone_send_message', { recipient: 'Tote', text: 'hello', task_text: 'Text Tote hello' });
  assert.equal(rejected.structuredContent.error.code, 'BUSY');
  assert.equal(f.device.getStatus().session_active, true);
});

test('combined action returns a usable next snapshot and never repeats a successful action after read failure', async t => {
  const f = await fixture(t);
  await f.pair();
  const screen = await f.read();
  const pending = f.call('phone_action_and_observe', { action: 'tap', snapshot_id: screen.snapshot_id, target_id: 1, settle_ms: 0 });
  const tap = await f.next();
  assert.equal(tap.action, 'tap_element');
  await f.result(tap.id, { accepted: true });
  const read = await f.next();
  assert.equal(read.action, 'read');
  await f.result(read.id, { snapshot: 'after', clicksAvailable: true, elements: [{ id: 99, visible: true, enabled: true, clickable: true, text: 'Save' }] });
  const combined = (await pending).structuredContent.data;
  assert.equal(combined.observation.snapshot_id, 'after');
  assert.ok(combined.timings.action_ms >= 0);
  const next = f.call('phone_action_and_observe', { action: 'tap', snapshot_id: 'after', target_id: 1, settle_ms: 0 });
  const save = await f.next();
  assert.equal(save.element, 99);
  await f.result(save.id, { accepted: true });
  const failedRead = await f.next();
  await f.result(failedRead.id, { error: 'No accessible window.' });
  const partialReply = await next;
  assert.match(partialReply.content[0].text, /DEVICE_REJECTED.*Action acknowledged; read again, do not repeat/);
  const partial = partialReply.structuredContent;
  assert.equal(partial.ok, true);
  assert.equal(partial.data.action_result.accepted, true);
  assert.equal(partial.data.observation_error.code, 'DEVICE_REJECTED');
  assert.equal(f.device.getStatus().command_pending, false);
});

test('post-send delivery checking verifies draft, sends once and returns early with delivery evidence', async t => {
  const f = await fixture(t);
  await f.pair();
  const reading = f.call('phone_read_screen');
  const read = await f.next();
  await f.result(read.id, { snapshot: 'draft', package: 'com.google.android.apps.messaging', clicksAvailable: true, elements: [
    { id: 1, visible: true, enabled: true, editable: true, supportsSetText: true, text: 'Hi how are ya' },
    { id: 2, visible: true, enabled: true, clickable: true, description: 'Send encrypted message' }
  ] });
  await reading;
  const rejected = await f.call('phone_action_and_observe', { action: 'tap', snapshot_id: 'draft', target_id: 2, delivery_text: 'Wrong text' });
  assert.equal(rejected.structuredContent.error.code, 'INVALID_ARGUMENT');
  assert.equal(f.device.getStatus().command_pending, false);
  const sending = f.call('phone_action_and_observe', { action: 'tap', snapshot_id: 'draft', target_id: 2, delivery_text: 'Hi how are ya' });
  const tap = await f.next();
  assert.equal(tap.action, 'tap_element');
  await f.result(tap.id, { accepted: true });
  const verify = await f.next();
  assert.equal(verify.action, 'read');
  await f.result(verify.id, { snapshot: 'delivered', package: 'com.google.android.apps.messaging', clicksAvailable: true, elements: [
    { id: 5, visible: true, description: 'You said Hi how are ya 1:02 AM ., Delivered. End-to-end encrypted message' }
  ] });
  const data = (await sending).structuredContent.data;
  assert.equal(data.delivery.status, 'delivered');
  assert.equal(data.delivery.reads, 1);
  assert.equal(data.timings.settle_ms, 0);
  assert.equal(data.observation.snapshot_id, 'delivered');
  assert.equal(f.device.getStatus().command_pending, false);
});

test('keyboard submit requires advertised support, translates target IDs, and consumes its snapshot', async t => {
  const f = await fixture(t);
  await f.pair();
  const unsupported = await f.read();
  assert.equal((await f.call('phone_submit_text', { snapshot_id: unsupported.snapshot_id, target_id: 3 })).structuredContent.error.code, 'SUBMIT_UNAVAILABLE');
  const reading = f.call('phone_read_screen');
  const read = await f.next();
  await f.result(read.id, { snapshot: 'search-field', clicksAvailable: true, elements: [
    { id: 72, visible: true, enabled: true, editable: true, supportsSetText: true, supportsImeEnter: true, text: 'Alex' }
  ] });
  const screen = (await reading).structuredContent.data;
  assert.equal(screen.actions[0].can_submit, true);
  const pending = f.call('phone_submit_text', { snapshot_id: screen.snapshot_id, target_id: 1 });
  const command = await f.next();
  assert.equal(command.action, 'ime_enter');
  assert.equal(command.element, 72);
  await f.result(command.id, { accepted: true });
  assert.equal((await pending).structuredContent.data.accepted, true);
  assert.equal((await f.call('phone_submit_text', { snapshot_id: screen.snapshot_id, target_id: 1 })).structuredContent.error.code, 'SNAPSHOT_MISSING_OR_CONSUMED');
});

test('MCP HTTP handshake lists phone and benchmark tools; status exposes no credentials', async t => {
  const f = await fixture(t);
  const { tools } = await f.client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'phone_send_message', 'phone_submit_text', 'phone_action_and_observe', 'phone_status', 'phone_start_session', 'phone_launch_app', 'phone_read_screen', 'phone_tap', 'phone_type', 'phone_scroll', 'phone_swipe', 'phone_back', 'phone_stop_session',
    'phone_benchmark_start', 'phone_benchmark_status', 'phone_benchmark_mark_wasted', 'phone_benchmark_finish', 'phone_benchmark_report'
  ].sort());
  for (const tool of tools) {
    assert.ok(tool.description);
    assert.ok(tool.inputSchema);
    assert.ok(tool.outputSchema);
    assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
  }
  assert.equal(tools.find(tool => tool.name === 'phone_tap').annotations.destructiveHint, true);
  const status = (await f.call('phone_status')).structuredContent;
  assert.equal(status.data.session_active, false);
  assert.doesNotMatch(JSON.stringify(status), new RegExp(`${f.mcpToken}|${f.deviceToken}`));
  const noSession = await f.call('phone_read_screen');
  assert.equal(noSession.isError, true);
  assert.equal(noSession.structuredContent.error.code, 'SESSION_REQUIRED');
  assert.match(noSession.content[0].text, /^SESSION_REQUIRED:/);
});

test('MCP app launch requires a session, restricts package names, and waits for Android result', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('phone_launch_app', { package_name: 'com.google.android.youtube' })).structuredContent.error.code, 'SESSION_REQUIRED');
  await f.pair();
  const invalid = await f.call('phone_launch_app', { package_name: 'com.samsung.android.app.notes' });
  assert.equal(invalid.isError, true);
  const launched = f.call('phone_launch_app', { package_name: 'com.google.android.youtube' });
  const command = await f.next();
  assert.equal(command.action, 'launch_app'); assert.equal(command.package, 'com.google.android.youtube');
  await f.result(command.id, { action: 'launch_app', package: command.package, accepted: true });
  assert.equal((await launched).structuredContent.data.accepted, true);
  assert.equal(f.device.getStatus().snapshot_available, false);
  const denied = f.call('phone_launch_app', { package_name: 'com.google.android.youtube' });
  const rejected = await f.next();
  await f.result(rejected.id, { error: 'App blocked by owner policy.' });
  assert.equal((await denied).structuredContent.error.code, 'DEVICE_REJECTED');
});

test('MCP screen read exports semantic evidence without changing native target mapping', async t => {
  const f = await fixture(t);
  await f.pair();
  const pending = f.call('phone_read_screen', { detailed: true });
  const command = await f.next();
  await f.result(command.id, { snapshot: 'instagram-read', package: 'com.instagram.android', clicksAvailable: true,
    windowBounds: '[0,0][1080,2400]', elements: [{ id: 18, path: '0/0', visible: true, enabled: true,
      clickable: true, description: 'Profile', viewId: 'com.instagram.android:id/profile_tab', selected: true,
      class: 'android.widget.ImageButton', bounds: '[880,2200][1080,2380]' }] });
  const screen = (await pending).structuredContent.data;
  assert.equal(screen.actions[0].semantic_hint.name, 'Profile');
  assert.equal(screen.actions[0].role, 'button');
  assert.equal(screen.actions[0].position, 'bottom right');
  assert.match(screen.app_navigation_guide, /do not infer/);
  const tap = f.call('phone_tap', { snapshot_id: screen.snapshot_id, target_id: screen.actions[0].target_id });
  const tapped = await f.next();
  assert.equal(tapped.element, 18);
  await f.result(tapped.id, { accepted: true });
  assert.equal((await tap).structuredContent.data.accepted, true);
});

test('MCP launches installed app packages while rejecting Notes and the companion package', async t => {
  const f = await fixture(t);
  await f.pair();
  for (const package_name of ['com.instagram.android', 'com.linkedin.android', 'com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.chrome', 'com.google.android.gm', 'com.google.android.apps.authenticator2', 'com.azure.authenticator']) {
    const pending = f.call('phone_launch_app', { package_name });
    const command = await f.next();
    assert.equal(command.package, package_name);
    await f.result(command.id, { accepted: true });
    assert.equal((await pending).structuredContent.data.accepted, true);
  }
  for (const package_name of ['com.samsung.android.app.notes', 'com.androidphonecontrol', 'bad/package']) {
    assert.equal((await f.call('phone_launch_app', { package_name })).isError, true);
    assert.equal((await f.call('phone_action_and_observe', { action: 'launch', package_name })).isError, true);
    assert.match(f.device.requestLaunchApp(package_name), /blocked|Invalid/);
  }
  assert.equal(f.device.getStatus().command_pending, false);
});

test('MCP swipe consumes fresh snapshots, preserves target mapping and reports device rejection', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('phone_swipe', { snapshot_id: 'missing', target_id: 2, direction: 'up' })).structuredContent.error.code, 'SESSION_REQUIRED');
  await f.pair();
  for (const direction of ['up', 'down', 'left', 'right']) {
    const screen = await f.read();
    assert.equal((await f.call('phone_swipe', { snapshot_id: screen.snapshot_id, target_id: 999, direction })).structuredContent.error.code, 'INVALID_TARGET');
    const pending = f.call('phone_swipe', { snapshot_id: screen.snapshot_id, target_id: 2, direction });
    const command = await f.next();
    assert.equal(command.action, 'swipe_element');
    assert.equal(command.element, 10);
    assert.equal(command.direction, direction);
    await f.result(command.id, direction === 'right' ? { error: 'Target changed' } : { accepted: true });
    assert.equal((await pending).structuredContent.ok, direction !== 'right');
    assert.equal((await f.call('phone_swipe', { snapshot_id: screen.snapshot_id, target_id: 2, direction })).structuredContent.error.code, 'SNAPSHOT_MISSING_OR_CONSUMED');
  }
  assert.equal((await f.call('phone_swipe', { snapshot_id: 'x', target_id: 2, direction: 'diagonal' })).isError, true);
});

test('MCP starts an owner-enabled session after phone acknowledgement and stops it', async t => {
  const f = await fixture(t);
  const blocked = await f.call('phone_start_session');
  assert.equal(blocked.structuredContent.error.code, 'AVAILABILITY_REQUIRED');
  const { availability } = await f.send('/v1/availability', 'POST');
  const started = f.call('phone_start_session');
  let command;
  for (let i = 0; i < 30; i++) {
    command = await f.send(`/v1/availability/${availability}/next`);
    if (command.action === 'start_session') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(command.action, 'start_session');
  await f.send(`/v1/session/${command.session}/ready`, 'POST');
  assert.equal((await started).structuredContent.data.session_active, true);
  assert.equal((await f.call('phone_stop_session')).structuredContent.data.stopped, true);
  assert.equal((await f.call('phone_status')).structuredContent.data.remote_availability_enabled, true);
});

test('MCP endpoint enforces separate credentials, Host, Origin and method checks', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.url, { method: 'POST' })).status, 401);
  assert.equal((await fetch(f.url, { method: 'POST', headers: { Authorization: `Bearer ${f.deviceToken}` } })).status, 401);
  const auth = { Authorization: `Bearer ${f.mcpToken}` };
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(f.url, { method: 'POST', headers: { ...auth, Host: 'attacker.example' } }, res => {
      res.resume(); resolve(res.statusCode);
    });
    req.on('error', reject); req.end();
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await fetch(f.url, { method: 'POST', headers: { ...auth, Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await fetch(f.url, { headers: auth })).status, 405);
  assert.equal((await fetch(`${f.url}?token=${f.mcpToken}`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(f.url, { method: 'POST', headers: { ...auth,
    Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: ' '.repeat(65537) })).status, 413);
});

test('MCP read returns sequential targets and explicit snapshots; taps deliver native IDs exactly once', async t => {
  const f = await fixture(t);
  await f.pair();
  const screen = await f.read();
  assert.deepEqual(screen.actions.map(item => item.target_id), [1, 2, 3]);
  assert.equal(screen.actions[0].label, 'Display');
  assert.equal(screen.actions[2].can_type, true);
  assert.equal(screen.visible_text.includes('Display'), false); // Already present in the returned action label.
  const stale = await f.call('phone_tap', { snapshot_id: 'old-screen', target_id: 1 });
  assert.equal(stale.structuredContent.error.code, 'SNAPSHOT_REPLACED');
  const pending = f.call('phone_tap', { snapshot_id: screen.snapshot_id, target_id: 1 });
  const command = await f.next();
  assert.equal(command.action, 'tap_element');
  assert.equal(command.element, 7);
  assert.equal(command.snapshot, screen.snapshot_id);
  await f.result(command.id, { accepted: true, action: 'tap_element', element: 7 });
  const acknowledgement = (await pending).structuredContent.data;
  assert.equal(acknowledgement.accepted, true);
  assert.equal(acknowledgement.target_id, 1);
  assert.equal('element' in acknowledgement, false);
  assert.equal((await f.call('phone_tap', { snapshot_id: screen.snapshot_id, target_id: 1 })).isError, true);
  assert.equal(f.device.getStatus().command_pending, false);
});

test('MCP text, scroll and Back wait for device results and require fresh reads', async t => {
  const f = await fixture(t);
  await f.pair();
  let screen = await f.read();
  const typing = f.call('phone_type', { snapshot_id: screen.snapshot_id, target_id: 3, text: 'display-marker' });
  let command = await f.next();
  assert.equal(command.action, 'set_text');
  assert.equal(command.element, 12);
  assert.equal(command.text, 'display-marker');
  await f.result(command.id, { accepted: true, textLength: 14 });
  assert.doesNotMatch(JSON.stringify(await typing), /display-marker/);
  screen = await f.read();
  const scrolling = f.call('phone_scroll', { snapshot_id: screen.snapshot_id, target_id: 2, direction: 'down' });
  command = await f.next();
  assert.equal(command.action, 'scroll_element');
  assert.equal(command.element, 10);
  await f.result(command.id, { error: 'Scroll boundary reached' });
  assert.equal((await scrolling).structuredContent.error.code, 'DEVICE_REJECTED');
  screen = await f.read();
  const back = f.call('phone_back', { snapshot_id: screen.snapshot_id });
  command = await f.next();
  assert.equal(command.action, 'back');
  await f.result(command.id, { accepted: true });
  assert.equal((await back).structuredContent.data.accepted, true);
});

test('MCP schema rejects malformed tool arguments before device dispatch', async t => {
  const f = await fixture(t);
  await f.pair();
  const cases = [
    ['phone_tap', { target_id: 1 }],
    ['phone_type', { snapshot_id: 'screen', target_id: 1, text: 'x'.repeat(1001) }],
    ['phone_type', { snapshot_id: 'screen', target_id: 1, text: '\u0000' }],
    ['phone_tap', { snapshot_id: 'screen', target_id: -1 }],
    ['phone_scroll', { snapshot_id: 'screen', target_id: 1, direction: 'left' }],
    ['phone_status', { unexpected: true }]
  ];
  for (const [name, args] of cases) assert.equal((await f.call(name, args)).isError, true);
  assert.equal(f.device.getStatus().command_pending, false);
});

test('MCP stop revokes an in-flight session and resolves its waiting call as an error', async t => {
  const f = await fixture(t);
  await f.pair();
  const waiting = f.call('phone_read_screen');
  await f.next();
  const busy = await f.call('phone_read_screen');
  assert.equal(busy.structuredContent.error.code, 'BUSY');
  const stopped = await f.call('phone_stop_session');
  assert.equal(stopped.structuredContent.data.stopped, true);
  assert.equal((await waiting).structuredContent.error.code, 'SESSION_STOPPED');
  assert.equal((await f.call('phone_status')).structuredContent.data.session_active, false);
});

test('device timeout revokes the session instead of automatically retrying an uncertain action', async t => {
  const f = await fixture(t, 150);
  await f.pair();
  const screen = await f.read();
  const pending = f.call('phone_tap', { snapshot_id: screen.snapshot_id, target_id: 1 });
  await f.next(); // Simulate delivery without a result: the action might already have executed.
  const response = await pending;
  assert.equal(response.structuredContent.error.code, 'TIMEOUT');
  assert.equal(f.device.getStatus().session_active, false);
  assert.equal((await f.call('phone_tap', { snapshot_id: screen.snapshot_id, target_id: 1 })).isError, true);
});

test('abort signal revokes the device session and rejects the pending command', async t => {
  const f = await fixture(t);
  await f.pair();
  const abort = new AbortController();
  const waiting = f.device.executeCommand('read', {}, { signal: abort.signal });
  const rejected = assert.rejects(waiting, error => error.code === 'CANCELLED');
  await f.next();
  abort.abort();
  await rejected;
  assert.equal(f.device.getStatus().session_active, false);
});

test('disconnecting an HTTP tool call revokes its device session', async t => {
  const f = await fixture(t);
  await f.pair();
  const abort = new AbortController();
  const pending = fetch(f.url, {
    method: 'POST', signal: abort.signal,
    headers: { Authorization: `Bearer ${f.mcpToken}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'phone_read_screen', arguments: {} } })
  });
  const rejected = assert.rejects(pending);
  await f.next();
  abort.abort();
  await rejected;
  const deadline = Date.now() + 500;
  while (f.device.getStatus().session_active && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.device.getStatus().session_active, false);
});
