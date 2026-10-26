import { buildActionTable } from './terminal-view.mjs';

export function runTerminalCommand(server, line) {
  const command = line.trim();
  if (command === 'read') return server.requestRead();
  if (command === 'tap') return server.requestTap();
  if (command === 'back') return server.requestBack();
  if (command === 'details') return server.details();
  const match = /^tap (\d+)$/.exec(command);
  if (match) return server.requestElementTap(Number(match[1]));
  const scroll = /^scroll (\d+) (up|down)$/.exec(command);
  if (scroll) return server.requestScroll(Number(scroll[1]), scroll[2]);
  const type = /^type (\d+) (.+)$/.exec(command);
  if (type) {
    try {
      const text = JSON.parse(type[2]);
      if (typeof text === 'string') return server.requestSetText(Number(type[1]), text);
    } catch { /* Fall through to a syntax error without echoing the supplied text. */ }
    return 'Use type ID "text" with a valid JSON-quoted string; use "" to clear the field.';
  }
  return 'Commands: read, tap ID, type ID "text", scroll ID up|down, back, details, tap (demo button)';
}

export function formatClickTargets(message) {
  const screen = message.result;
  if (!Array.isArray(screen?.elements)) return '';
  if (!screen.clicksAvailable) return 'This screen was truncated; navigation is unavailable. Type details to inspect its text.';
  const table = buildActionTable(screen);
  const lines = table.map(item => {
    const actions = [item.tap && 'tap', item.type && 'type',
      item.directions.length && `scroll ${item.directions.join('/')}`].filter(Boolean).join(', ');
    return `${String(item.id).padStart(3)}  ${actions.padEnd(25)} ${item.label}`;
  });
  return `Screen: ${cleanPackage(screen.package)}\nScreen actions (latest read only; expire in 30 seconds)\n` +
    ` ID  ACTIONS                   LABEL\n${lines.join('\n') || '  No supported actions on this screen.'}\n` +
    (!table.some(item => item.type) ? 'No editable fields on this screen. Open a search/text field, then run read again.\n' : '') +
    'Use tap ID, type ID "text", scroll ID up|down, or back. Run read again after each action.\n' +
    'Type details for the raw device result. IDs are local to this snapshot and may change on the next read.';
}

const cleanPackage = value => String(value ?? 'unknown app').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 160);
