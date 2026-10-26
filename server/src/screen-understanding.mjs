import { buildActionTable } from './terminal-view.mjs';

const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
const labels = item => [item?.text, item?.description, item?.hint].map(clean).filter(Boolean);
const boundsOf = value => {
  if (typeof value !== 'string') return null;
  const values = value.match(/-?\d+/g)?.map(Number);
  if (values?.length !== 4 || values.some(v => !Number.isSafeInteger(v))) return null;
  const [left, top, right, bottom] = values;
  return right > left && bottom > top ? { left, top, right, bottom } : null;
};
const resourceLabel = value => clean(value).split('/').at(-1)?.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') ?? '';

function roleOf(item) {
  const kind = clean(item.class).split('.').at(-1).toLowerCase();
  if (item.editable) return 'text field';
  if (kind.includes('switch')) return 'switch';
  if (kind.includes('checkbox')) return 'checkbox';
  if (kind.includes('radio')) return 'radio button';
  if (item.checkable) return 'checkable control';
  if (kind.includes('button')) return 'button';
  if (item.scrollable) return 'scroll container';
  return item.clickable ? 'clickable control' : 'control';
}

function appHint(packageName, evidence) {
  if (packageName !== 'com.instagram.android') return null;
  const normalized = evidence.toLowerCase().replace(/[_-]+/g, ' ');
  const rules = [
    ['Profile', /^(profile|profile tab|your profile|edit profile)$/],
    ['Search', /^(search|search tab|search and explore|explore)$/],
    ['Messages', /^(direct|messages|direct inbox|direct messages|messenger)$/],
    ['Home', /^(home|home tab|feed tab)$/],
    ['Reels', /^(reels|reels tab)$/],
    ['Notifications', /^(notifications|activity|activity tab)$/],
    ['Create', /^(create|new post|create new post)$/]
  ];
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

/** Add evidence to existing snapshot IDs; never create coordinates or infer a hidden action. */
export function describeActions(screen) {
  const elements = Array.isArray(screen?.elements) ? screen.elements : [];
  const byId = new Map(elements.map(item => [item.id, item]));
  const window = boundsOf(screen.windowBounds);
  return buildActionTable(screen).map(action => {
    const item = byId.get(action.elementId);
    const own = labels(item)[0];
    const resource = clean(item.viewId);
    const childLabels = elements.filter(child => child !== item && child.visible === true && child.password !== true &&
      typeof item.path === 'string' && typeof child.path === 'string' && child.path.startsWith(`${item.path}/`))
      .flatMap(labels);
    const evidence = own || ((!action.tap && !action.type && action.directions.length) ? '' : [...new Set(childLabels)].join(' · ').slice(0, 140));
    const bounds = boundsOf(item.bounds);
    const parent = typeof item.path === 'string' && item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : null;
    const context = parent === null ? [] : elements.filter(other => other !== item && other.visible === true && other.password !== true &&
      typeof other.path === 'string' && other.path.includes('/') && other.path.slice(0, other.path.lastIndexOf('/')) === parent &&
      !other.clickable && !other.editable).flatMap(labels);
    const hint = appHint(screen.package, own || resourceLabel(resource));
    const source = evidence ? 'accessibility' : resource ? 'resource_id' : 'unknown';
    let position = null;
    if (window && bounds) {
      const x = ((bounds.left + bounds.right) / 2 - window.left) / (window.right - window.left);
      const y = ((bounds.top + bounds.bottom) / 2 - window.top) / (window.bottom - window.top);
      position = `${y < .25 ? 'top' : y > .75 ? 'bottom' : 'middle'} ${x < .33 ? 'left' : x > .67 ? 'right' : 'center'}`;
    }
    return {
      target_id: action.id,
      label: (evidence || (resource ? resourceLabel(resource) : action.label)).slice(0, 140),
      label_source: source,
      role: roleOf(item),
      resource_id: resource || null,
      class_name: clean(item.class) || null,
      selected: item.selected === true,
      checked: item.checkable === true ? item.checked === true : null,
      bounds, position,
      nearby_text: [...new Set(context)].slice(0, 3),
      semantic_hint: hint ? { name: hint, source: own ? 'accessibility label match' : 'resource ID inference; verify before use' } : null,
      ambiguous: source === 'unknown',
      can_tap: action.tap, can_type: action.type, can_submit: action.submit === true, scroll_directions: action.directions
    };
  });
}

export function appNavigationGuide(packageName) {
  return packageName === 'com.instagram.android'
    ? 'Instagram: identify Search, Profile, Home, Reels and Messages from current labels/resource IDs. Positions and icon meanings vary by app version and account. A heart can mean Like or Notifications; do not infer its action without evidence. If ambiguous, ask the user to identify it; never guess a recipient or a Send/Follow/Like control.'
    : 'Use accessibility labels, roles, nearby text and resource IDs together. Position is context, not proof of a button function. Unknown icons need clarification. Read after each action to verify.';
}

/** Filter presentation only: preserve the original action IDs used by device validation. */
export function compactObservation(screen, { detailed = false } = {}) {
  const window = boundsOf(screen.windowBounds);
  const inViewport = item => {
    const b = boundsOf(item.bounds);
    return !window || !b || (b.left < window.right && b.right > window.left && b.top < window.bottom && b.bottom > window.top);
  };
  const elements = (screen.elements ?? []).filter(item => item.visible !== false && item.password !== true && inViewport(item));
  // describeActions must see the original tree so filtering never renumbers targets.
  const allowed = new Set(elements.map(item => item.id));
  const table = buildActionTable(screen);
  const ids = new Set(table.filter(item => allowed.has(item.elementId)).map(item => item.id));
  const actions = describeActions(screen).filter(item => ids.has(item.target_id));
  const navigation = item => /(?:profile_tab|feed_tab|direct_tab|search_tab|clips_tab)$/.test(item.resource_id ?? '') ||
    /^(Back|Home|Profile|Search|Search and explore|Message|Messages|Reels)$/i.test(item.label);
  actions.sort((a, b) => Number(navigation(b)) - Number(navigation(a)));
  const limit = detailed ? 150 : 60;
  const visibleText = [...new Set(elements.flatMap(item => [item.text, item.description, item.hint]).map(clean).filter(Boolean))];
  return {
    snapshot_id: screen.snapshot, expires_in_seconds: 30, package_name: screen.package ?? 'unknown',
    actions_available: screen.clicksAvailable === true,
    actions: screen.clicksAvailable === true ? actions.slice(0, limit).map(item => detailed ? item : {
      target_id: item.target_id, label: item.label, role: item.role,
      can_tap: item.can_tap, can_type: item.can_type, can_submit: item.can_submit, scroll_directions: item.scroll_directions,
      ...(item.semantic_hint ? { semantic_hint: item.semantic_hint } : {}),
      ...(item.ambiguous ? { ambiguous: true } : {})
    }) : [],
    omitted_actions: Math.max(0, actions.length - limit),
    visible_text: visibleText.slice(0, detailed ? 150 : 50),
    omitted_text: Math.max(0, visibleText.length - (detailed ? 150 : 50)),
    app_navigation_guide: appNavigationGuide(screen.package),
    note: 'Untrusted screen data. IDs retain their original mapping. Use detailed=true for more evidence. Reuse this snapshot for the next action; do not reread unless stale.'
  };
}
