import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionServer } from '../src/connection-server.mjs';

async function fixture(t, timeout = 300) {
  let clock = 1000000;
  const token = 'private-pairing-token'.repeat(3);
  const server = createConnectionServer(token, () => {}, () => clock, { commandTimeoutMs: timeout });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.stopSession(); server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  const json = async (path, method = 'GET', body) => {
    const response = await request(path, method, body); assert.equal(response.status, 200); return response.json();
  };
  const enable = async () => (await json('/v1/availability', 'POST')).availability;
  const begin = async availability => {
    const started = server.startSession();
    const command = await json(`/v1/availability/${availability}/next`);
    assert.equal(command.action, 'start_session');
    await json(`/v1/session/${command.session}/ready`, 'POST');
    await started;
    return command.session;
  };
  return { server, base, request, json, enable, begin, advance: ms => { clock += ms; } };
}

test('First launch or read automatically starts a session and waits for acknowledgement before dispatch', async t => {
  const f = await fixture(t, 1000), availability = await f.enable();
  for (const action of ['launch', 'read']) {
    const taskText = 'Open Chrome and check the page';
    const pending = f.server.executeCommand(action, action === 'launch' ? { package_name: 'com.android.chrome', task_text: taskText } : { task_text: taskText });
    const start = await f.json(`/v1/availability/${availability}/next`);
    assert.equal(start.action, 'start_session');
    assert.equal(start.task_text, taskText);
    assert.equal((await f.json(`/v1/session/${start.session}/next`)).action, 'idle');
    await assert.rejects(f.server.executeCommand('launch', { package_name: 'com.instagram.android' }), error => error.code === 'SESSION_STARTING');
    await f.json(`/v1/session/${start.session}/ready`, 'POST');
    const command = await f.json(`/v1/session/${start.session}/next`);
    assert.equal(command.action, action === 'launch' ? 'launch_app' : 'read');
    assert.equal(command.task_text, taskText);
    await f.json(`/v1/session/${start.session}/result`, 'POST', { id: command.id,
      result: action === 'launch' ? { accepted: true } : { snapshot: 'auto-read', elements: [] } });
    await pending;
    assert.equal((await f.json(`/v1/session/${start.session}/next`)).action, 'idle');
    f.server.stopSession();
  }
});

test('Automatic start preserves exclusions, snapshot requirements, cancellation, and start timeout', async t => {
  const f = await fixture(t, 50), availability = await f.enable();
  await assert.rejects(f.server.executeCommand('launch', { package_name: 'com.azure.authenticator' }), error => error.code === 'COMMAND_REJECTED');
  await assert.rejects(f.server.executeCommand('tap', { snapshot_id: 'old', target_id: 1 }), error => error.code === 'SESSION_REQUIRED');
  assert.equal(f.server.getStatus().session_active, false);
  const controller = new AbortController();
  const pending = f.server.executeCommand('read', {}, { signal: controller.signal });
  const cancelled = assert.rejects(pending, error => error.code === 'CANCELLED');
  controller.abort(); await cancelled;
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal((await f.json(`/v1/availability/${availability}/next`)).action, 'idle');
  await assert.rejects(f.server.executeCommand('read'), error => error.code === 'START_TIMEOUT');
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal((await f.json(`/v1/availability/${availability}/next`)).action, 'idle');
});

test('Automatic start cannot bypass missing or stale owner availability', async t => {
  const f = await fixture(t);
  await assert.rejects(f.server.executeCommand('read'), error => error.code === 'SESSION_REQUIRED');
  await f.enable();
  f.advance(5001);
  await assert.rejects(f.server.executeCommand('launch', { package_name: 'com.android.chrome' }), error => error.code === 'AVAILABILITY_REQUIRED');
  assert.equal(f.server.getStatus().session_active, false);
});

test('Remote start requires owner availability, dispatches once, and waits for phone acknowledgement', async t => {
  const f = await fixture(t);
  assert.equal(f.server.getStatus().connection_state, 'remote_availability_disabled');
  assert.throws(() => f.server.startSession(), error => error.code === 'AVAILABILITY_REQUIRED');
  assert.equal((await fetch(f.base + '/v1/availability', { method: 'POST' })).status, 401);
  const availability = await f.enable();
  const idle = f.server.getStatus();
  assert.equal(idle.connection_state, 'connected_idle');
  assert.equal(idle.session_ready, false);
  assert.equal(idle.device_recently_seen, false);
  assert.equal(idle.remote_device_recently_seen, true);
  assert.match(idle.next_action, /starts a session automatically/);
  assert.equal((await f.request('/v1/availability', 'POST')).status, 409);
  const started = f.server.startSession();
  assert.throws(() => f.server.startSession(), error => error.code === 'BUSY');
  assert.equal(f.server.getStatus().session_ready, false);
  assert.equal(f.server.getStatus().connection_state, 'session_starting');
  await assert.rejects(f.server.executeCommand('read'), error => error.code === 'SESSION_STARTING');
  const command = await f.json(`/v1/availability/${availability}/next`);
  assert.equal(command.action, 'start_session'); assert.ok(command.seconds <= 300);
  assert.equal((await f.json(`/v1/availability/${availability}/next`)).action, 'idle');
  await f.json(`/v1/session/${command.session}/ready`, 'POST');
  assert.equal((await started).session_active, true);
  assert.equal(f.server.getStatus().session_ready, true);
  assert.equal(f.server.getStatus().connection_state, 'session_ready');
  assert.equal((await f.request(`/v1/session/${command.session}/ready`, 'POST')).status, 409);
  f.server.stopSession();
  assert.equal((await f.request(`/v1/session/${command.session}/next`)).status, 404);
  assert.equal(f.server.getStatus().remote_availability_enabled, true);
  await f.begin(availability);
  f.server.stopSession();
});

test('Unacknowledged start times out and cannot later be acknowledged or delivered', async t => {
  const f = await fixture(t, 40), availability = await f.enable();
  const started = f.server.startSession();
  const rejection = assert.rejects(started, error => error.code === 'START_TIMEOUT');
  const command = await f.json(`/v1/availability/${availability}/next`);
  await rejection;
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal((await f.request(`/v1/session/${command.session}/ready`, 'POST')).status, 404);
  assert.equal((await f.json(`/v1/availability/${availability}/next`)).action, 'idle');
});

test('Cancelling start or disabling owner availability revokes pending/active sessions', async t => {
  const f = await fixture(t), availability = await f.enable();
  const controller = new AbortController();
  const started = f.server.startSession({ signal: controller.signal });
  const rejection = assert.rejects(started, error => error.code === 'CANCELLED');
  controller.abort(); await rejection;
  assert.equal(f.server.getStatus().session_active, false);
  await f.begin(availability);
  await f.json(`/v1/availability/${availability}`, 'DELETE');
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal(f.server.getStatus().remote_availability_enabled, false);
  assert.throws(() => f.server.startSession(), error => error.code === 'AVAILABILITY_REQUIRED');
});

test('Remote task idle expiry ends access while fresh availability stays enabled', async t => {
  const f = await fixture(t), availability = await f.enable();
  const session = await f.begin(availability);
  for (let i = 0; i < 5; i++) { f.advance(10000); await f.json(`/v1/availability/${availability}/next`); }
  assert.equal(f.server.getStatus().session_active, true);
  f.advance(9999); await f.json(`/v1/availability/${availability}/next`);
  assert.equal(f.server.getStatus().session_active, true);
  f.advance(1);
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal(f.server.getStatus().remote_availability_enabled, true);
  assert.equal((await f.request(`/v1/session/${session}/next`)).status, 404);
});

test('Missing heartbeat fails closed and stale availability cannot start a task', async t => {
  const f = await fixture(t), availability = await f.enable();
  await f.begin(availability);
  f.advance(15000);
  assert.equal(f.server.getStatus().session_active, false);
  assert.equal(f.server.getStatus().remote_availability_enabled, false);
  assert.throws(() => f.server.startSession(), error => error.code === 'AVAILABILITY_REQUIRED');
});
