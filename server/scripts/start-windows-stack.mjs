import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createConnectionServer } from '../src/connection-server.mjs';
import { createMcpHttpServer } from '../src/mcp/http-server.mjs';
import { createOAuthGateway } from '../src/mcp/oauth-gateway.mjs';
import { encryptedState } from '../src/security/encrypted-state.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
let servers = [];
try {
  const config = JSON.parse(process.env.APC_STACK_CONFIG ?? '{}');
  delete process.env.APC_STACK_CONFIG;
  const device = createConnectionServer(config.pairingToken);
  const mcp = createMcpHttpServer(device, config.mcpToken);
  const gateway = createOAuthGateway({ publicOrigin: config.publicOrigin, ownerKey: config.ownerKey, upstreamToken: config.mcpToken,
    stateStore: encryptedState(join(root, 'work/windows-stack/oauth-state.bin'), config.stateKey),
    onDiagnostic: event => console.log(JSON.stringify(event)) });
  servers = [device, mcp, gateway];
  const stop = () => {
    device.stopSession();
    for (const server of servers) { server.close(); server.closeAllConnections(); }
  };
  for (const server of servers) server.on('error', error => {
    console.error(`Stack listener failed: ${error.code ?? 'unknown'}`); process.exitCode = 1; stop();
  });
  for (const [i, server] of servers.entries()) await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(8787 + i, '127.0.0.1', resolve);
  });
  console.log('Windows stack running: device 8787, MCP 8788, OAuth gateway 8789 (all loopback).');
  console.log(`ChatGPT URL: ${config.publicOrigin}/mcp`);
  console.log(`Android address: ${config.publicOrigin}:8443`);
  console.log('Credentials and unexpired OAuth grants survive restart. Android sessions do not.');
  console.log('Use start-windows-stack.ps1 -ShowSecrets locally for pairing/approval keys. Keep this host awake.');
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} catch {
  console.error('Stack startup failed. Check port conflicts, encrypted settings, and saved origin. Credentials were not printed.');
  process.exitCode = 1;
  for (const server of servers) { server.close(); server.closeAllConnections(); }
}
