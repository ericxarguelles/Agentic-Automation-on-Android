import { randomBytes } from 'node:crypto';
import { createOAuthGateway } from '../src/mcp/oauth-gateway.mjs';

const ownerKey = randomBytes(32).toString('base64url');
try {
  const gateway = createOAuthGateway({ publicOrigin: process.env.APC_PUBLIC_ORIGIN, ownerKey, upstreamToken: process.env.APC_MCP_TOKEN,
    onDiagnostic: event => console.log(`OAuth gateway ${event.route}: HTTP ${event.status}${event.error ? ` (${event.error})` : ''}` +
      `${event.method ? ` method=${event.method}` : ''}${event.tool ? ` tool=${event.tool}` : ''}` +
      `${event.protocol ? ` protocol=${event.protocol}` : ''}${event.rpcCode !== undefined ? ` rpcCode=${event.rpcCode}` : ''}`) });
  gateway.on('error', error => { console.error(`OAuth gateway: ${error.code ?? 'startup failed'}`); process.exitCode = 1; });
  gateway.listen(8789, '127.0.0.1', () => {
    console.log('OAuth gateway listening on 127.0.0.1:8789. Funnel must target 8789, not 8788 or 8787.');
    console.log(`ChatGPT Server URL: ${new URL('/mcp', process.env.APC_PUBLIC_ORIGIN).href}`);
    console.log(`Owner approval key (enter only on your own authorization page): ${ownerKey}`);
    console.log('Keep this key private. Restarting the gateway revokes all OAuth grants. Device sessions still require Android approval.');
  });
  process.once('SIGINT', () => { gateway.close(); gateway.closeAllConnections(); });
} catch { console.error('Gateway configuration invalid. Use scripts/start-funnel-gateway.ps1.'); process.exitCode = 1; }
