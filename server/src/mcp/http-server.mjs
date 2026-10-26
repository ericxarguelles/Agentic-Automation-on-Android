import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPhoneMcpServer } from './tools.mjs';

/** Local-only Streamable HTTP endpoint. This is not an OAuth/public deployment. */
export function createMcpHttpServer(device, token) {
  if (!token || token.length < 24) throw new Error('A strong MCP token is required.');
  const liveServers = new Set();
  const server = http.createServer(async (req, res) => {
    const fail = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: message }));
    };
    if (req.url !== '/mcp') return fail(404, 'Unknown endpoint.');
    const port = server.address().port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host?.toLowerCase())) return fail(403, 'Host is not allowed.');
    if (req.headers.origin && !hosts.map(host => `http://${host}`).includes(req.headers.origin)) return fail(403, 'Origin is not allowed.');
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="android-phone-control-local"');
      return fail(401, 'MCP bearer token required. Use the MCP token, not the Android pairing token.');
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(405, 'Stateless MCP endpoint accepts POST only.'); }
    const mcp = createPhoneMcpServer(device);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 65536 });
    liveServers.add(mcp);
    res.setHeader('Cache-Control', 'no-store');
    res.once('close', () => { liveServers.delete(mcp); void mcp.close().catch(() => {}); });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) fail(500, 'MCP request failed.');
      else if (!res.writableEnded) res.end();
      liveServers.delete(mcp);
      await mcp.close().catch(() => {});
    }
  });
  server.on('close', () => { for (const mcp of liveServers) void mcp.close().catch(() => {}); });
  return server;
}
