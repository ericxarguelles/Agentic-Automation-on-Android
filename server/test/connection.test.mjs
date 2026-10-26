import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionServer } from '../src/connection-server.mjs';

test('authenticated sessions deliver commands once and reject stale results', async () => {
  const token = 'a'.repeat(48);
  const server = createConnectionServer(token);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/v1/hello`)).status, 401);
    assert.equal((await fetch(`${base}/v1/hello`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    const headers = { Authorization: `Bearer ${token}` };
    assert.deepEqual(await (await fetch(`${base}/v1/hello`, { headers })).json(), {
      name: 'Android Phone Control', protocol: 1, status: 'ready'
    });
    assert.equal((await fetch(`${base}/v1/tap`, { headers })).status, 404);
    assert.match(server.requestRead(), /No active/);
    const { session } = await (await fetch(`${base}/v1/session`, { method: 'POST', headers })).json();
    assert.equal((await fetch(`${base}/v1/session`, { method: 'POST', headers })).status, 409);
    assert.match(server.requestRead(), /queued/);
    const command = await (await fetch(`${base}/v1/session/${session}/next`, { headers })).json();
    assert.equal(command.action, 'read');
    assert.equal((await (await fetch(`${base}/v1/session/${session}/next`, { headers })).json()).action, 'idle');
    assert.match(server.requestRead(), /pending/);
    const resultUrl = `${base}/v1/session/${session}/result`;
    assert.equal((await fetch(resultUrl, { method: 'POST', headers, body: JSON.stringify({ id: 'wrong' }) })).status, 409);
    assert.equal((await fetch(resultUrl, { method: 'POST', headers, body: JSON.stringify({ id: command.id, screen: {} }) })).status, 200);
    assert.equal((await fetch(resultUrl, { method: 'POST', headers, body: JSON.stringify({ id: command.id }) })).status, 409);
    assert.match(server.requestTap(), /queued/);
    const tap = await (await fetch(`${base}/v1/session/${session}/next`, { headers })).json();
    assert.equal(tap.action, 'tap_test');
    assert.equal((await (await fetch(`${base}/v1/session/${session}/next`, { headers })).json()).action, 'idle');
    assert.match(server.requestTap(), /pending/);
    assert.equal((await fetch(resultUrl, { method: 'POST', headers, body: JSON.stringify({ id: tap.id, result: { accepted: true } }) })).status, 200);
    await fetch(`${base}/v1/session/${session}`, { method: 'DELETE', headers });
    assert.match(server.requestRead(), /No active/);
    assert.match(server.requestTap(), /No active/);
    assert.equal((await fetch(`${base}/v1/session/${session}/next`, { headers })).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('owner session survives two minutes and expires exactly at five minutes', async t => {
  let clock = 1000000;
  const token = 'a'.repeat(48);
  const server = createConnectionServer(token, () => {}, () => clock);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(`${base}/v1/session`, { method: 'POST', headers });
  assert.equal(response.status, 200);
  const { session } = await response.json();
  assert.equal(server.getStatus().session_seconds_remaining, 300);
  clock += 120000;
  assert.equal(server.getStatus().session_active, true);
  assert.equal(server.getStatus().session_seconds_remaining, 180);
  assert.equal((await fetch(`${base}/v1/session/${session}/next`, { headers })).status, 200);
  clock += 179999;
  assert.equal(server.getStatus().session_active, true);
  assert.equal(server.getStatus().session_seconds_remaining, 1);
  clock += 1;
  assert.equal(server.getStatus().session_active, false);
  assert.equal(server.getStatus().session_seconds_remaining, 0);
  assert.equal((await fetch(`${base}/v1/session/${session}/next`, { headers })).status, 404);
  assert.match(server.requestRead(), /No active/);
});
