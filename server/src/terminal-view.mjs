const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();

export function buildActionTable(screen) {
  if (!Array.isArray(screen?.elements)) return [];
  return screen.elements.filter(item => Number.isSafeInteger(item.id) && item.id >= 0 &&
    item.visible === true && item.enabled === true && item.password !== true).map(item => {
    const tap = item.clickable === true;
    const type = item.editable === true && item.supportsSetText === true;
    const directions = item.scrollable === true && Array.isArray(item.scrollDirections)
      ? [...new Set(item.scrollDirections.filter(direction => ['up', 'down'].includes(direction)))] : [];
    const children = typeof item.path === 'string' ? screen.elements.filter(child =>
      child.visible !== false && child.password !== true && typeof child.path === 'string' &&
      (child.path === item.path || item.path === '' || child.path.startsWith(`${item.path}/`))) : [item];
    const labels = children.flatMap(child => [child.text, child.description, child.hint]).map(clean).filter(Boolean);
    const ownLabel = [item.text, item.description, item.hint].map(clean).find(Boolean);
    const label = !tap && !type && directions.length
      ? ownLabel || `${clean(item.class).split('.').at(-1) || 'Scroll'} container`
      : [...new Set(labels)].join(' · ') || clean(item.class).split('.').at(-1) || 'Unlabelled control';
    return { elementId: item.id, tap, type, ...(item.editable === true && item.supportsImeEnter === true ? { submit: true } : {}), directions, label: label.slice(0, 140) };
  }).filter(item => item.tap || item.type || item.submit || item.directions.length)
    .map((item, index) => ({ id: index + 1, ...item }));
}

/** Terminal IDs are aliases only; the authenticated device protocol retains native IDs. */
export function createTerminalController(server) {
  let table = [];
  let lastMessage = null;
  const queued = message => {
    if (message.endsWith('queued.')) table = [];
    return message;
  };
  const target = id => table.find(item => item.id === id);
  const missing = 'Choose an ID from the latest screen action table. Run read again if needed.';
  return {
    acceptResult(message) {
      lastMessage = message;
      table = message.result?.clicksAvailable === true && typeof message.result.snapshot === 'string'
        ? buildActionTable(message.result) : [];
    },
    requestRead: () => queued(server.requestRead()),
    requestTap: () => queued(server.requestTap()),
    requestBack: () => queued(server.requestBack()),
    requestElementTap(id) {
      const item = target(id);
      return item ? queued(server.requestElementTap(item.elementId)) : missing;
    },
    requestScroll(id, direction) {
      const item = target(id);
      return item ? queued(server.requestScroll(item.elementId, direction)) : missing;
    },
    requestSetText(id, text) {
      const item = target(id);
      return item ? queued(server.requestSetText(item.elementId, text)) : missing;
    },
    details() {
      return lastMessage
        ? 'Raw device result (native IDs are diagnostic; use table IDs for terminal commands):\n' + JSON.stringify(lastMessage, null, 2)
        : 'No result yet. Run read first.';
    }
  };
}
