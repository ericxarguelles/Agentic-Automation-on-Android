import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createOAuthGateway } from '../src/mcp/oauth-gateway.mjs';
import { createMcpHttpServer } from '../src/mcp/http-server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function setup(t, realMcp = false, stateStore) {
  let time = Date.now(), calls = 0;
  const diagnostics = [];
  const ownerKey = 'owner-'.repeat(8), upstreamToken = 'upstream-'.repeat(5);
  const upstream = realMcp ? createMcpHttpServer({ getStatus: () => ({ session_active: false }) }, upstreamToken) : http.createServer((req, res) => {
    calls++; assert.equal(req.headers.authorization, `Bearer ${upstreamToken}`);
    assert.equal(req.headers.origin, undefined);
    res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const issuer = 'https://phone.example.ts.net';
  const gatewayOptions = { publicOrigin: issuer, ownerKey, upstreamToken, upstreamPort: upstream.address().port, now: () => time,
    onDiagnostic: event => diagnostics.push(event), stateStore };
  let gateway = createOAuthGateway(gatewayOptions);
  gateway.prependListener('request', (_req, res) => res.setHeader('Connection', 'close'));
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await Promise.all([gateway, upstream].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }))); });
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const post = (path, body, origin = issuer) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: {
    'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: new URLSearchParams(body) });
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const register = async () => {
    const response = await fetch(base + '/register', json({ redirect_uris: [redirect], token_endpoint_auth_method: 'none' }));
    assert.equal(response.status, 201); return (await response.json()).client_id;
  };
  const verifier = 'v'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorize = async (client, callback = redirect) => {
    const response = await fetch(base + '/authorize?' + new URLSearchParams({ client_id: client, redirect_uri: callback,
      response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'test-state', resource: issuer + '/mcp', scope: 'phone.control' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /form-action 'self' https:\/\/chatgpt.com https:\/\/chat.openai.com /);
    assert.ok(policy.includes('https://oauth-redirect.googleusercontent.com'));
    assert.ok(policy.includes('https://gemini.google.com'));
    assert.ok(!policy.includes('*'));
    return (await response.text()).match(/name="request" value="([^"]+)"/)[1];
  };
  const grant = async () => {
    const client = await register(), nonce = await authorize(client);
    const approved = await post('/approve', { request: nonce, key: ownerKey, decision: 'approve' });
    assert.equal(approved.status, 303);
    const destination = new URL(approved.headers.get('location'));
    assert.equal(destination.searchParams.get('iss'), issuer);
    assert.equal(destination.searchParams.get('state'), 'test-state');
    const code = destination.searchParams.get('code');
    return { client, code, nonce, exchange: { grant_type: 'authorization_code', client_id: client, code, code_verifier: verifier, redirect_uri: redirect, resource: issuer + '/mcp' } };
  };
  const restart = async () => {
    const port = gateway.address().port;
    await new Promise(resolve => { gateway.close(resolve); gateway.closeAllConnections(); });
    gateway = createOAuthGateway(gatewayOptions);
    gateway.prependListener('request', (_req, res) => res.setHeader('Connection', 'close'));
    await new Promise(resolve => gateway.listen(port, '127.0.0.1', resolve));
  };
  return { base, issuer, json, post, register, authorize, grant, ownerKey, diagnostics, restart, advance: ms => { time += ms; }, calls: () => calls };
}

test('OAuth metadata, redirect restrictions, and unauthenticated MCP rejection', async t => {
  const f = await setup(t);
  const metadata = await (await fetch(f.base + '/.well-known/oauth-authorization-server')).json();
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  const protectedResource = await (await fetch(f.base + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(protectedResource.resource, f.issuer + '/mcp');
  const unauth = await fetch(f.base + '/mcp', f.json({}));
  assert.equal(unauth.status, 401); assert.match(unauth.headers.get('www-authenticate'), /resource_metadata/);
  for (const redirect of ['https://evil.example/callback', 'https://chatgpt.com.evil.example/connector_platform/oauth/callback', 'http://chatgpt.com/connector_platform/oauth/callback', 'https://chatgpt.com/other']) {
    assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [redirect] }))).status, 400);
  }
  const client = await f.register();
  assert.equal((await fetch(f.base + '/authorize?' + new URLSearchParams({ client_id: client, response_type: 'code' }))).status, 400);
  assert.equal(f.calls(), 0);
  for (const redirect of ['https://chatgpt.com/connector_platform_oauth_redirect', 'https://chatgpt.com/connector/oauth/callback_123']) {
    assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [redirect], token_endpoint_auth_method: 'none' }))).status, 201);
  }
  for (const redirect of ['https://chatgpt.com/connector_platform_oauth_redirect/evil', 'https://chatgpt.com/connector/oauth/id/extra']) {
    assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [redirect] }))).status, 400);
  }
});

test('Gemini registers six relay callbacks, authenticates, and preserves exact callback and PKCE binding', async t => {
  let saved;
  const f = await setup(t, false, { load: () => structuredClone(saved), save: value => { saved = structuredClone(value); } });
  const redirects = ['oauth-redirect.googleusercontent.com', 'oauth-redirect-sandbox.googleusercontent.com',
    'oauth-redirect-test.googleusercontent.com'].flatMap(host => ['r', 'a'].map(path =>
    `https://${host}/${path}/user_bound_custom-mcp-123456789-phone_example_ts_net`));
  const registration = await fetch(f.base + '/register', f.json({ redirect_uris: redirects, token_endpoint_auth_method: 'client_secret_post' }));
  assert.equal(registration.status, 201);
  const client = await registration.json();
  assert.equal(client.token_endpoint_auth_method, 'client_secret_post');
  assert.ok(client.client_secret);
  assert.ok(!JSON.stringify(saved).includes(client.client_secret));
  await f.restart();
  for (const redirect of redirects) await f.authorize(client.client_id, redirect);
  const nonce = await f.authorize(client.client_id, redirects[0]);
  const approved = await f.post('/approve', { request: nonce, key: f.ownerKey, decision: 'approve' });
  assert.equal(approved.status, 303);
  const destination = new URL(approved.headers.get('location'));
  assert.equal(destination.origin + destination.pathname, redirects[0]);
  assert.equal(destination.searchParams.get('state'), 'test-state');
  const exchange = { grant_type: 'authorization_code', client_id: client.client_id, client_secret: client.client_secret,
    code: destination.searchParams.get('code'), code_verifier: 'v'.repeat(64), redirect_uri: redirects[0] };
  assert.equal((await f.post('/token', { ...exchange, client_secret: '' })).status, 401);
  assert.equal((await f.post('/token', { ...exchange, client_secret: 'wrong' })).status, 401);
  assert.equal((await f.post('/token', { ...exchange, redirect_uri: redirects[1] })).status, 400);
  assert.equal((await f.post('/token', { ...exchange, code_verifier: 'x'.repeat(64) })).status, 400);
  const response = await f.post('/token', exchange);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  assert.equal((await f.post('/token', exchange)).status, 400);
  const renew = { grant_type: 'refresh_token', client_id: client.client_id, client_secret: client.client_secret, refresh_token: tokens.refresh_token };
  assert.equal((await f.post('/token', { ...renew, client_secret: '' })).status, 401);
  const renewed = await f.post('/token', renew);
  assert.equal(renewed.status, 200);
  const rotated = await renewed.json();
  assert.equal((await f.post('/revoke', { client_id: client.client_id, token: rotated.refresh_token })).status, 401);
  assert.equal((await f.post('/revoke', { client_id: client.client_id, client_secret: client.client_secret, token: rotated.refresh_token })).status, 200);
  assert.equal((await f.post('/token', { ...renew, refresh_token: rotated.refresh_token })).status, 400);
  for (const sensitive of [client.client_secret, tokens.access_token, tokens.refresh_token]) {
    assert.ok(!JSON.stringify(saved).includes(sensitive));
    assert.ok(!JSON.stringify(f.diagnostics).includes(sensitive));
  }
});

test('Gemini callback allowlist rejects lookalikes and non-MCP Google redirects', async t => {
  const f = await setup(t);
  const relay = 'https://oauth-redirect.googleusercontent.com';
  const path = '/r/user_bound_custom-mcp-123-phone_example';
  for (const redirect of [relay + '/r/another-app', relay + '/r/user_bound_custom-mcp-',
    relay + path + '/extra', relay + path + '?next=https://evil.example', relay + path + '#fragment',
    relay + '/r/user_bound_custom-mcp-123%2Fextra', relay + ':8443' + path,
    'http://oauth-redirect.googleusercontent.com' + path, 'https://user@oauth-redirect.googleusercontent.com' + path,
    'https://oauth-redirect.googleusercontent.com.evil.example' + path, 'https://other.googleusercontent.com' + path]) {
    const r = await fetch(f.base + '/register', f.json({ redirect_uris: [redirect] }));
    assert.equal(r.status, 400, redirect);
  }
  const good = relay + path;
  assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [good], token_endpoint_auth_method: 'none' }))).status, 201);
  assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [good, 'https://evil.example/callback'] }))).status, 400);
  assert.equal((await fetch(f.base + '/register', f.json({ redirect_uris: [good], token_endpoint_auth_method: 'client_secret_basic' }))).status, 400);
});

test('Owner approval, PKCE, resource binding, single-use codes, refresh rotation, and revocation', async t => {
  const f = await setup(t);
  const client = await f.register(), nonce = await f.authorize(client);
  assert.equal((await f.post('/approve', { request: nonce, key: f.ownerKey }, 'https://evil.example')).status, 403);
  assert.equal((await f.post('/approve', { request: nonce, key: f.ownerKey }, 'null')).status, 403);
  assert.equal((await fetch(f.base + '/approve', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ request: nonce, key: f.ownerKey }) })).status, 403);
  assert.equal((await f.post('/approve', { request: nonce, key: 'wrong' })).status, 403);
  const g = await f.grant();
  assert.equal((await f.post('/token', { ...g.exchange, code_verifier: 'x'.repeat(64) })).status, 400);
  assert.equal((await f.post('/token', { ...g.exchange, resource: 'https://wrong.example/mcp' })).status, 400);
  const exchanged = await f.post('/token', g.exchange); assert.equal(exchanged.status, 200);
  const tokens = await exchanged.json();
  assert.equal((await f.post('/token', g.exchange)).status, 400);
  assert.equal((await f.post('/approve', { request: g.nonce, key: f.ownerKey })).status, 400);
  const call = token => fetch(f.base + '/mcp', { ...f.json({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  assert.equal((await call(tokens.access_token)).status, 200); assert.equal(f.calls(), 1);
  const renew = { grant_type: 'refresh_token', client_id: g.client, refresh_token: tokens.refresh_token };
  assert.equal((await f.post('/token', { ...renew, client_id: 'wrong' })).status, 400);
  const rotated = await (await f.post('/token', renew)).json();
  assert.ok(rotated.access_token); assert.equal((await f.post('/token', renew)).status, 400);
  await f.post('/revoke', { client_id: g.client, token: rotated.refresh_token });
  assert.equal((await call(tokens.access_token)).status, 401);
  assert.equal((await call(rotated.access_token)).status, 401);
});

test('Expired approval/code/access and approval brute force are rejected', async t => {
  const f = await setup(t);
  const g = await f.grant();
  f.advance(61000); assert.equal((await f.post('/token', g.exchange)).status, 400);
  const g2 = await f.grant(), tokens = await (await f.post('/token', g2.exchange)).json();
  const nonce = await f.authorize(g2.client);
  for (let i = 0; i < 5; i++) assert.equal((await f.post('/approve', { request: nonce, key: 'wrong' })).status, 403);
  assert.equal((await f.post('/approve', { request: nonce, key: f.ownerKey })).status, 429);
  f.advance(3600001);
  assert.equal((await fetch(f.base + '/mcp', { ...f.json({}), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.access_token}` } })).status, 401);
  assert.equal((await f.post('/approve', { request: nonce, key: f.ownerKey })).status, 400);
});

test('Official MCP client initializes, discovers phone and benchmark tools, and reads status through OAuth gateway', async t => {
  const f = await setup(t, true);
  const g = await f.grant(), tokens = await (await f.post('/token', g.exchange)).json();
  const client = new Client({ name: 'oauth-gateway-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(f.base + '/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  }));
  assert.equal((await client.listTools()).tools.length, 18);
  assert.equal((await client.callTool({ name: 'phone_status', arguments: {} })).structuredContent.data.session_active, false);
  assert.ok(f.diagnostics.some(event => event.tool === 'phone_status' && event.status === 200));
  const rejected = await fetch(f.base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.access_token}`, 'MCP-Protocol-Version': '2099-01-01' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
  assert.equal(rejected.status, 400);
  assert.ok(f.diagnostics.some(event => event.error === 'unsupported_protocol_version' && event.rpcCode === -32000));
  const log = JSON.stringify(f.diagnostics);
  for (const sensitive of [tokens.access_token, tokens.refresh_token, f.ownerKey, g.code, g.nonce, 'test-state']) assert.ok(!log.includes(sensitive));
});

test('Persisted grants survive gateway restart; consumed refresh and revoked grants stay invalid', async t => {
  let saved = null;
  const stateStore = { load: () => structuredClone(saved), save: value => { saved = structuredClone(value); } };
  const f = await setup(t, false, stateStore);
  const g = await f.grant();
  const tokens = await (await f.post('/token', g.exchange)).json();
  const call = token => fetch(f.base + '/mcp', { ...f.json({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  await f.restart();
  assert.equal((await call(tokens.access_token)).status, 200);
  // A registered client survives too, but authorization requests/codes are deliberately ephemeral.
  await f.authorize(g.client);
  assert.equal((await f.post('/token', g.exchange)).status, 400);
  const renew = { grant_type: 'refresh_token', client_id: g.client, refresh_token: tokens.refresh_token };
  const rotated = await (await f.post('/token', renew)).json();
  assert.ok(rotated.access_token);
  await f.restart();
  assert.equal((await f.post('/token', renew)).status, 400);
  await f.post('/revoke', { client_id: g.client, token: rotated.refresh_token });
  await f.restart();
  assert.equal((await call(tokens.access_token)).status, 401);
  assert.equal((await call(rotated.access_token)).status, 401);
  const raw = JSON.stringify(saved);
  assert.ok(!raw.includes(tokens.access_token)); assert.ok(!raw.includes(tokens.refresh_token));
});
