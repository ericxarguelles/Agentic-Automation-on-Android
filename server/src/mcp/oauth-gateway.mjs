import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const secret = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Google Account Linking relays used by Gemini custom MCP apps. Never allow
// arbitrary googleusercontent.com hosts or arbitrary paths on these relays.
const geminiRelayHosts = ['oauth-redirect.googleusercontent.com',
  'oauth-redirect-sandbox.googleusercontent.com', 'oauth-redirect-test.googleusercontent.com'];
const formDestinations = ['https://chatgpt.com', 'https://chat.openai.com',
  ...geminiRelayHosts.map(host => `https://${host}`), 'https://gemini.google.com'];

/** Single-owner development gateway. All grants are revoked on process restart. */
export function createOAuthGateway({ publicOrigin, ownerKey, upstreamToken, upstreamPort = 8788, now = Date.now, onDiagnostic = () => {}, stateStore }) {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.port) {
    throw new Error('Public origin must be an HTTPS origin without a path, credentials, or custom port.');
  }
  if (ownerKey?.length < 32 || upstreamToken?.length < 24 || !ownerKey || !upstreamToken) throw new Error('Strong owner and upstream keys are required.');
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) throw new Error('Invalid upstream port.');
  const issuer = origin.origin;
  const resource = `${issuer}/mcp`;
  const clients = new Map(), pending = new Map(), codes = new Map(), access = new Map(), refresh = new Map();
  const restored = stateStore?.load();
  if (restored) {
    if (restored.version !== 1 || restored.issuer !== issuer) throw new Error('OAuth state does not match this server origin.');
    for (const [name, map, limit] of [['clients', clients, 256], ['access', access, 512], ['refresh', refresh, 512]]) {
      const entries = restored[name];
      if (!Array.isArray(entries) || entries.length > limit) throw new Error('Invalid saved OAuth state.');
      for (const entry of entries) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Number.isFinite(entry[1]?.expires)) throw new Error('Invalid saved OAuth entry.');
        if (entry[1].expires > now()) map.set(entry[0], entry[1]);
      }
    }
  }
  const persist = () => {
    try { stateStore?.save({ version: 1, issuer, clients: [...clients], access: [...access], refresh: [...refresh] }); }
    catch {
      // Fail closed if durability is lost; never return newly issued unsaved credentials.
      for (const map of [clients, access, refresh, pending, codes]) map.clear();
      throw new Error('OAuth state could not be saved.');
    }
  };
  let rateWindow = now(), requests = 0, failedApprovals = 0;
  const prune = () => {
    for (const map of [clients, pending, codes, access, refresh]) for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
  };
  const redirectAllowed = value => {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return false;
      if (geminiRelayHosts.includes(u.hostname)) {
        return !u.search && /^\/(r|a)\/user_bound_custom-mcp-[A-Za-z0-9_-]+$/.test(u.pathname);
      }
      return ['chatgpt.com', 'chat.openai.com'].includes(u.hostname) &&
        (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname) ||
          u.pathname === '/connector_platform/oauth/callback' || u.pathname.startsWith('/connector_platform/oauth/callback/'));
    } catch { return false; }
  };
  const issue = grant => {
    if (access.size >= 512 || refresh.size >= 512) throw new Error('Grant capacity reached. Restart the gateway.');
    const token = secret(), renewal = secret(), family = grant.family ?? secret();
    access.set(hash(token), { client: grant.client, family, expires: now() + 3600000 });
    refresh.set(hash(renewal), { client: grant.client, family, expires: now() + 86400000 });
    persist();
    return { access_token: token, token_type: 'Bearer', expires_in: 3600, refresh_token: renewal, scope: 'phone.control' };
  };
  const server = http.createServer(async (req, res) => {
    // Log fixed route names only: never query strings, credentials, bodies, codes, or client IDs.
    const knownRoutes = new Set(['/register', '/authorize', '/approve', '/token', '/revoke', '/mcp',
      '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']);
    let diagnosticRoute = 'other', diagnosticError, diagnosticMethod, diagnosticTool, diagnosticProtocol, diagnosticRpcCode;
    try { const path = new URL(req.url, issuer).pathname; if (knownRoutes.has(path)) diagnosticRoute = path; } catch { }
    res.once('finish', () => { try { onDiagnostic({ route: diagnosticRoute, status: res.statusCode,
      ...(diagnosticError ? { error: diagnosticError } : {}), ...(diagnosticMethod ? { method: diagnosticMethod } : {}),
      ...(diagnosticTool ? { tool: diagnosticTool } : {}), ...(diagnosticProtocol ? { protocol: diagnosticProtocol } : {}),
      ...(diagnosticRpcCode !== undefined ? { rpcCode: diagnosticRpcCode } : {}) }); } catch { } });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Preserve Origin on same-origin form POSTs; disclose no referrer to other sites.
    // no-referrer can turn a browser form's Origin into "null", breaking approval.
    res.setHeader('Referrer-Policy', 'same-origin');
    // Chromium also checks form-action on the 303 redirect after approval.
    // Actual callback paths remain constrained by registration and exact matching.
    res.setHeader('Content-Security-Policy', `default-src 'none'; form-action 'self' ${formDestinations.join(' ')}; frame-ancestors 'none'; base-uri 'none'`);
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const fail = (status, error) => { diagnosticError = error; send(status, { error }); };
    try {
      const local = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
      if (![origin.host, ...local].includes(req.headers.host?.toLowerCase())) return fail(403, 'invalid_host');
      if (req.headers.origin && req.headers.origin !== issuer) return fail(403, 'invalid_origin');
      if (now() - rateWindow >= 60000) { rateWindow = now(); requests = 0; failedApprovals = 0; }
      if (++requests > 300) return fail(429, 'rate_limited');
      prune();
      const url = new URL(req.url, issuer);
      const readBody = async type => {
        if (!req.headers['content-type']?.toLowerCase().startsWith(type)) throw new Error('Unsupported content type');
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Body too large'); chunks.push(chunk); }
        return Buffer.concat(chunks).toString('utf8');
      };
      if (req.method === 'GET' && ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(url.pathname)) {
        return send(200, { resource, authorization_servers: [issuer], scopes_supported: ['phone.control'], bearer_methods_supported: ['header'] });
      }
      if (req.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
        return send(200, { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
          registration_endpoint: `${issuer}/register`, revocation_endpoint: `${issuer}/revoke`,
          response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none', 'client_secret_post'], code_challenge_methods_supported: ['S256'],
          scopes_supported: ['phone.control'], authorization_response_iss_parameter_supported: true });
      }
      if (req.method === 'POST' && url.pathname === '/register') {
        if (clients.size >= 256) return fail(429, 'registration_capacity');
        const body = JSON.parse(await readBody('application/json'));
        if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 10 || !body.redirect_uris.every(redirectAllowed) ||
            (body.token_endpoint_auth_method && !['none', 'client_secret_post'].includes(body.token_endpoint_auth_method))) return fail(400, 'invalid_client_metadata');
        const id = secret();
        const authMethod = body.token_endpoint_auth_method || 'none';
        const clientSecret = authMethod === 'client_secret_post' ? secret() : undefined;
        clients.set(id, { redirects: body.redirect_uris, expires: now() + 86400000,
          authMethod, ...(clientSecret ? { secretHash: hash(clientSecret) } : {}) });
        persist();
        return send(201, { client_id: id, client_id_issued_at: Math.floor(now() / 1000), redirect_uris: body.redirect_uris,
          token_endpoint_auth_method: authMethod,
          ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: Math.floor((now() + 86400000) / 1000) } : {}),
          grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
      }
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const p = url.searchParams, client = p.get('client_id'), redirect = p.get('redirect_uri');
        if (!clients.get(client)?.redirects.includes(redirect) || p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' ||
            !/^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge') ?? '') || (p.get('resource') && p.get('resource') !== resource) ||
            (p.get('scope') ?? 'phone.control').split(' ').some(scope => scope !== 'phone.control')) return fail(400, 'invalid_authorization_request');
        if (pending.size >= 256) return fail(429, 'authorization_capacity');
        const nonce = secret();
        pending.set(nonce, { client, redirect, challenge: p.get('code_challenge'), state: p.get('state'), expires: now() + 300000 });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const provider = geminiRelayHosts.includes(new URL(redirect).hostname) ? 'Google for Gemini' : 'ChatGPT';
        return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Approve phone access</title><h1>Android Phone Control</h1><p>Approve this connection only if you just initiated it from ${provider}.</p><p>It can read accessible screen text and request taps, typing, scrolling and Back during sessions you enable on Android. This approval does not start a device session.</p><p>Callback: ${escape(redirect)}</p><form method="post" action="/approve"><input type="hidden" name="request" value="${nonce}"><label>Owner approval key from your Windows server terminal <input type="password" name="key" required autocomplete="off"></label><button name="decision" value="approve">Approve connection</button><button name="decision" value="deny">Deny</button></form></html>`);
      }
      if (req.method === 'POST' && url.pathname === '/approve') {
        if (req.headers.origin !== issuer) return fail(403, 'approval_requires_same_origin');
        const p = new URLSearchParams(await readBody('application/x-www-form-urlencoded'));
        const nonce = p.get('request'), grant = pending.get(nonce);
        if (!grant) return fail(400, 'expired_request');
        if (failedApprovals >= 5) return fail(429, 'approval_rate_limited');
        if (!equal(p.get('key'), ownerKey)) { failedApprovals++; return fail(403, 'invalid_owner_key'); }
        pending.delete(nonce);
        const destination = new URL(grant.redirect);
        destination.searchParams.set('iss', issuer);
        if (grant.state !== null) destination.searchParams.set('state', grant.state);
        if (p.get('decision') === 'approve') {
          const code = secret(); codes.set(hash(code), { ...grant, expires: now() + 60000 }); destination.searchParams.set('code', code);
        } else destination.searchParams.set('error', 'access_denied');
        res.writeHead(303, { Location: destination.href }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const p = new URLSearchParams(await readBody('application/x-www-form-urlencoded'));
        const registered = clients.get(p.get('client_id'));
        if (registered?.authMethod === 'client_secret_post' &&
            !equal(hash(p.get('client_secret') ?? ''), registered.secretHash)) return fail(401, 'invalid_client');
        // A secret-authenticated grant must never become a public grant after
        // its registration expires. Legacy public registrations remain valid.
        if (!registered) return fail(400, 'invalid_grant');
        if (p.get('resource') && p.get('resource') !== resource) return fail(400, 'invalid_target');
        if (p.get('grant_type') === 'authorization_code') {
          const key = hash(p.get('code') ?? ''), grant = codes.get(key);
          if (!grant || grant.client !== p.get('client_id') || grant.redirect !== p.get('redirect_uri') ||
              !/^[A-Za-z0-9._~-]{43,128}$/.test(p.get('code_verifier') ?? '') || !equal(hash(p.get('code_verifier')), grant.challenge)) return fail(400, 'invalid_grant');
          codes.delete(key); return send(200, issue(grant));
        }
        if (p.get('grant_type') === 'refresh_token') {
          const key = hash(p.get('refresh_token') ?? ''), grant = refresh.get(key);
          if (!grant || grant.client !== p.get('client_id') || (p.get('scope') && p.get('scope') !== 'phone.control')) return fail(400, 'invalid_grant');
          refresh.delete(key); return send(200, issue(grant));
        }
        return fail(400, 'unsupported_grant_type');
      }
      if (req.method === 'POST' && url.pathname === '/revoke') {
        const p = new URLSearchParams(await readBody('application/x-www-form-urlencoded'));
        const registered = clients.get(p.get('client_id'));
        if (registered?.authMethod === 'client_secret_post' &&
            !equal(hash(p.get('client_secret') ?? ''), registered.secretHash)) return fail(401, 'invalid_client');
        const key = hash(p.get('token') ?? ''), grant = access.get(key) ?? refresh.get(key);
        if (grant?.client === p.get('client_id')) for (const map of [access, refresh]) for (const [id, value] of map) if (value.family === grant.family) map.delete(id);
        persist();
        return send(200, {});
      }
      if (url.pathname !== '/mcp' || url.search) return fail(404, 'not_found');
      const supplied = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      if (!supplied || !access.has(hash(supplied))) {
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp", scope="phone.control"`);
        return fail(401, 'invalid_token');
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(405, 'method_not_allowed'); }
      const body = await readBody('application/json');
      try {
        const rpc = JSON.parse(body);
        const methods = ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/templates/list', 'prompts/list'];
        diagnosticMethod = methods.includes(rpc.method) ? rpc.method : 'other';
        const tools = ['phone_status', 'phone_start_session', 'phone_launch_app', 'phone_read_screen', 'phone_tap', 'phone_type', 'phone_scroll', 'phone_swipe', 'phone_back', 'phone_stop_session'];
        if (rpc.method === 'tools/call') diagnosticTool = tools.includes(rpc.params?.name) ? rpc.params.name : 'other';
      } catch { diagnosticMethod = 'invalid_json'; }
      const version = req.headers['mcp-protocol-version'];
      diagnosticProtocol = typeof version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : version ? 'other' : 'absent';
      const abort = new AbortController();
      res.once('close', () => { if (!res.writableEnded) abort.abort(); });
      let upstream;
      try { upstream = await fetch(`http://127.0.0.1:${upstreamPort}/mcp`, { method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${upstreamToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          ...(req.headers['mcp-protocol-version'] ? { 'MCP-Protocol-Version': req.headers['mcp-protocol-version'] } : {}) }, body,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
      } catch { return fail(502, 'upstream_unavailable_or_timeout'); }
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      try {
        const rpc = JSON.parse(responseBody.toString('utf8'));
        if (Number.isSafeInteger(rpc.error?.code)) diagnosticRpcCode = rpc.error.code;
        if (upstream.status >= 400) {
          diagnosticError = typeof rpc.error?.message === 'string' && rpc.error.message.startsWith('Bad Request: Unsupported protocol version:')
            ? 'unsupported_protocol_version' : 'upstream_request_rejected';
        }
      } catch { if (upstream.status >= 400) diagnosticError = 'upstream_request_rejected'; }
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
      res.end(responseBody);
    } catch { if (!res.headersSent) fail(400, 'request_failed'); else res.end(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => { for (const map of [clients, pending, codes, access, refresh]) map.clear(); });
  return server;
}
