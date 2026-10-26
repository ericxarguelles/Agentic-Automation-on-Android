import { randomBytes } from 'node:crypto';
import { createConnectionServer } from './connection-server.mjs';
import { createInterface } from 'node:readline';
import { runTerminalCommand, formatClickTargets } from './terminal-commands.mjs';
import { createTerminalController } from './terminal-view.mjs';
import { createMcpHttpServer } from './mcp/http-server.mjs';

const token = randomBytes(24).toString('hex');
const mcpToken = randomBytes(24).toString('hex');
const server = createConnectionServer(token, result => {
  terminal.acceptResult(result);
  const targets = formatClickTargets(result);
  console.log(targets || JSON.stringify(result, null, 2));
});
const terminal = createTerminalController(server);
const mcpServer = createMcpHttpServer(server, mcpToken);
const shutdown = () => {
  server.stopSession();
  server.close();
  mcpServer.close();
  cli.close();
};
server.on('error', error => {
  console.error(`Device server: ${error.message}`);
  process.exitCode = 1;
  shutdown();
});
mcpServer.on('error', error => {
  console.error(`MCP server: ${error.message}`);
  process.exitCode = 1;
  shutdown();
});
mcpServer.listen(8788, '127.0.0.1', () => {
  console.log('Local MCP endpoint: http://127.0.0.1:8788/mcp');
  console.log(`MCP bearer token (AI client only): ${mcpToken}`);
});
server.listen(8787, '127.0.0.1', () => {
  console.log('Local connection test running on port 8787.');
  console.log('Emulator address: http://10.0.2.2:8787');
  console.log('USB device address (after adb reverse): http://127.0.0.1:8787');
  console.log(`Pairing token: ${token}`);
  console.log('Enable a five-minute test session in the app. Type read for screen elements.');
  console.log('Type tap to click the demo button (open the single-tap test screen first).');
  console.log('After read, type tap ID to click a visible, enabled, clickable element within 30 seconds.');
  console.log('After read, type scroll ID up|down for an advertised scroll direction, or back to return.');
  console.log('After read, type type ID "text" to replace an editable field, or type ID "" to clear it.');
  console.log('Use the sequential IDs from the action table. Type details for the raw device result.');
  console.log('Token changes on restart. Press Ctrl+C to stop.');
});
const cli = createInterface({ input: process.stdin, output: process.stdout });
cli.on('line', line => {
  console.log(runTerminalCommand(terminal, line));
});
process.once('SIGINT', shutdown);
