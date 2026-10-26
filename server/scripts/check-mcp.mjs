import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = process.env.APC_MCP_TOKEN;
const client = new Client({ name: 'phone-control-smoke-test', version: '1.0.0' });
try {
  if (!token) throw new Error('MCP token is missing. Use scripts/test-mcp.ps1.');
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8788/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' }
  }));
  const { tools } = await client.listTools();
  console.log(`MCP handshake verified. ${tools.length} tools discovered:`);
  for (const tool of tools) console.log(`  ${tool.name}`);
  const status = await client.callTool({ name: 'phone_status', arguments: {} });
  console.log(JSON.stringify(status.structuredContent, null, 2));
  if (process.argv.includes('--read')) {
    const screen = await client.callTool({ name: 'phone_read_screen', arguments: {} });
    console.log(JSON.stringify(screen.structuredContent ?? screen.content, null, 2));
    if (screen.isError) process.exitCode = 1;
  }
} catch (error) {
  console.error(`MCP check failed: ${String(error.message).split(token || '\u0000').join('[redacted]')}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
