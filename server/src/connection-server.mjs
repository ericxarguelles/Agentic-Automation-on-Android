import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { buildActionTable } from './terminal-view.mjs';
import { canLaunchPackage } from './app-policy.mjs';

export class DeviceCommandError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function createConnectionServer(token, onResult = () => {}, now = Date.now, { commandTimeoutMs = 10000 } = {}) {
  if (!token || token.length < 24) throw new Error('A strong pairing token is required');
  let session = null;
  let waiter = null;
  let availability = null;
  let startWaiter = null;
  const newSession = extra => ({ id: randomUUID(), expires: now() + 300000, lastSeen: now(), queued: null, pending: null, snapshot: null, ...extra });
  const terminateSession = (code = 'SESSION_STOPPED', message = 'Session stopped. An action already executing may still complete.') => {
    const existed = session !== null;
    session = null;
    if (waiter) waiter.reject(new DeviceCommandError(code, message));
    if (startWaiter) startWaiter.reject(new DeviceCommandError(code, message));
    return existed;
  };
  const expireSession = () => {
    if (session && now() >= session.expires) terminateSession('SESSION_EXPIRED', 'Device session expired. Enable a new session in the app.');
    if (session?.remote && session.ready && now() - session.lastCommandAt >= 60000) terminateSession('SESSION_IDLE', 'Task session ended after 60 seconds without a tool command.');
    if (availability && now() - availability.lastSeen >= 15000) {
      availability = null;
      if (session?.remote) terminateSession('DEVICE_OFFLINE', 'Phone availability heartbeat expired.');
    }
  };
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401).end(JSON.stringify({ error: 'Invalid pairing token' }));
      return;
    }
    expireSession();
    if (req.method === 'GET' && req.url === '/v1/hello') {
      res.end(JSON.stringify({ name: 'Android Phone Control', protocol: 1, status: 'ready' }));
    } else if (req.method === 'POST' && req.url === '/v1/availability') {
      if (availability || session) { res.writeHead(409).end('{}'); return; }
      availability = { id: randomUUID(), lastSeen: now() };
      res.end(JSON.stringify({ availability: availability.id }));
    } else if (availability && req.method === 'GET' && req.url === `/v1/availability/${availability.id}/next`) {
      availability.lastSeen = now();
      if (session?.remote && !session.ready && !session.startDelivered) {
        session.startDelivered = true;
        res.end(JSON.stringify({ action: 'start_session', session: session.id, task_text: session.taskText ?? '', seconds: Math.max(1, Math.floor((session.expires - now()) / 1000)) }));
      } else res.end(JSON.stringify({ action: 'idle' }));
    } else if (availability && req.method === 'DELETE' && req.url === `/v1/availability/${availability.id}`) {
      availability = null;
      if (session?.remote) terminateSession('AVAILABILITY_STOPPED', 'Owner disabled remote availability.');
      res.end('{}');
    } else if (session?.remote && req.method === 'POST' && req.url === `/v1/session/${session.id}/ready`) {
      if (!availability || session.ready) { res.writeHead(409).end('{}'); return; }
      session.ready = true; session.lastSeen = now(); session.lastCommandAt = now();
      startWaiter?.resolve({ session_active: true, session_seconds_remaining: Math.max(0, Math.floor((session.expires - now()) / 1000)), message: 'Phone acknowledged session. Read, act, verify, then call phone_stop_session in all completion/error paths.' });
      res.end('{}');
    } else if (req.method === 'POST' && req.url === '/v1/session') {
      if (session) { res.writeHead(409).end('{}'); return; }
      if (availability) { res.writeHead(409).end('{}'); return; }
      session = newSession({ ready: true });
      res.end(JSON.stringify({ session: session.id }));
    } else if (session && req.url === `/v1/session/${session.id}/next` && req.method === 'GET') {
      const command = session.queued;
      session.lastSeen = now();
      session.queued = null;
      res.end(JSON.stringify(command ?? { action: 'idle' }));
    } else if (session && req.url === `/v1/session/${session.id}/result` && req.method === 'POST') {
      const current = session;
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (Buffer.byteLength(body) > 1048576) req.destroy();
      });
      req.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (session !== current || now() >= current.expires || !current.pending || result.id !== current.pending) {
            res.writeHead(409).end('{}'); return;
          }
          if (current.pendingAction === 'read' && result.result?.clicksAvailable === true &&
              typeof result.result.snapshot === 'string' && Array.isArray(result.result.elements)) {
            current.snapshot = {
              id: result.result.snapshot, created: now(),
              targets: new Set(result.result.elements.filter(element => element.visible === true &&
                element.enabled === true && element.clickable === true && Number.isSafeInteger(element.id)).map(element => element.id)),
              editableTargets: new Set(result.result.elements.filter(element => element.visible === true &&
                element.enabled === true && element.editable === true && element.supportsSetText === true &&
                element.password !== true && Number.isSafeInteger(element.id)).map(element => element.id)),
              scrollTargets: new Map(result.result.elements.filter(element => element.visible === true &&
                element.enabled === true && element.scrollable === true && Number.isSafeInteger(element.id) &&
                Array.isArray(element.scrollDirections)).map(element => [element.id,
                  new Set(element.scrollDirections.filter(direction => direction === 'up' || direction === 'down'))]))
            };
          }
          current.lastSeen = now();
          if (current.snapshot && current.pendingAction === 'read') current.snapshot.actions = buildActionTable(result.result);
          current.pending = null;
          if (waiter?.id === result.id) waiter.resolve(result.result);
          onResult(result);
          res.end('{}');
        } catch { res.writeHead(400).end('{}'); }
      });
    } else if (session && req.url === `/v1/session/${session.id}` && req.method === 'DELETE') {
      terminateSession();
      res.end('{}');
    } else {
      res.writeHead(404).end(JSON.stringify({ error: 'Unknown endpoint' }));
    }
  });
  const queue = (action, parameters = {}) => {
    if (!session || now() >= session.expires) return 'No active session. Enable one in the app.';
    if (session.pending) return 'A command is already pending. Restart the session if the device disconnected.';
    const id = randomUUID();
    session.pending = id;
    session.pendingAction = action;
    session.lastCommandAt = now();
    session.snapshot = null;
    session.queued = { id, action, ...parameters, task_text: session.taskText ?? '' };
    return ({ ime_enter: 'Keyboard submit queued.', read: 'Screen read queued.', tap_test: 'Test-button tap queued.', tap_element: 'Element tap queued.',
      scroll_element: 'Element scroll queued.', swipe_element: 'Element swipe queued.', back: 'Back queued.', set_text: 'Text replacement queued.', launch_app: 'App launch queued.' })[action];
  };
  server.requestRead = () => queue('read');
  server.requestTap = () => queue('tap_test');
  server.requestLaunchApp = packageName => {
    if (!canLaunchPackage(packageName)) return 'Invalid or blocked app package. Notes and authenticator apps are excluded.';
    return queue('launch_app', { package: packageName });
  };
  const recentSnapshot = () => {
    if (!session || now() >= session.expires) return 'No active session. Enable one in the app.';
    if (session.pending) return 'A command is already pending.';
    const snapshot = session.snapshot;
    if (!snapshot || now() - snapshot.created >= 30000) return 'No recent navigation snapshot. Run read again.';
    return snapshot;
  };
  server.requestElementTap = element => {
    if (!Number.isSafeInteger(element) || element < 0) return 'Use tap followed by a non-negative element ID.';
    const snapshot = recentSnapshot();
    if (typeof snapshot === 'string') return snapshot;
    if (!snapshot.targets.has(element)) return 'Choose a visible, enabled, clickable element ID from read.';
    return queue('tap_element', { snapshot: snapshot.id, element });
  };
  server.requestScroll = (element, direction) => {
    if (!Number.isSafeInteger(element) || element < 0 || !['up', 'down'].includes(direction)) {
      return 'Use scroll ID up or scroll ID down with a non-negative element ID.';
    }
    const snapshot = recentSnapshot();
    if (typeof snapshot === 'string') return snapshot;
    if (!snapshot.scrollTargets.get(element)?.has(direction)) return 'Choose a target marked scroll and an advertised direction from the latest read.';
    return queue('scroll_element', { snapshot: snapshot.id, element, direction });
  };
  server.requestBack = () => {
    const snapshot = recentSnapshot();
    if (typeof snapshot === 'string') return snapshot;
    return queue('back', { snapshot: snapshot.id });
  };
  server.requestSwipe = (element, direction) => {
    if (!Number.isSafeInteger(element) || element < 0 || !['up', 'down', 'left', 'right'].includes(direction)) return 'Invalid swipe target or direction.';
    const snapshot = recentSnapshot();
    if (typeof snapshot === 'string') return snapshot;
    if (!snapshot.actions.some(item => item.elementId === element)) return 'Choose a target from the latest read.';
    return queue('swipe_element', { snapshot: snapshot.id, element, direction });
  };
  server.requestSetText = (element, text) => {
    if (!Number.isSafeInteger(element) || element < 0) return 'Use type followed by a non-negative element ID and a JSON-quoted string.';
    if (typeof text !== 'string' || text.length > 1000 || text.includes('\u0000')) {
      return 'Text must be a string of at most 1000 UTF-16 code units with no NUL characters.';
    }
    const snapshot = recentSnapshot();
    if (typeof snapshot === 'string') return snapshot;
    if (!snapshot.editableTargets.has(element)) return 'Choose a visible, enabled, non-password field marked type in the latest read. Open the search/text field first if none are listed.';
    return queue('set_text', { snapshot: snapshot.id, element, text });
  };
  server.getStatus = () => {
    expireSession();
    return {
      session_active: session !== null,
      device_recently_seen: session !== null && now() - session.lastSeen < 5000,
      session_seconds_remaining: session ? Math.max(0, Math.ceil((session.expires - now()) / 1000)) : 0,
      command_pending: session?.pending !== null && session?.pending !== undefined,
      snapshot_available: !!session?.snapshot && now() - session.snapshot.created < 30000,
      remote_availability_enabled: availability !== null,
      remote_device_recently_seen: availability !== null && now() - availability.lastSeen < 5000,
      session_ready: session?.ready === true,
      connection_state: session ? (session.ready ? 'session_ready' : 'session_starting') :
        availability && now() - availability.lastSeen < 5000 ? 'connected_idle' :
          availability ? 'awaiting_device_heartbeat' : 'remote_availability_disabled',
      next_action: session ? 'Do not take over an existing session belonging to another task.' :
        availability && now() - availability.lastSeen < 5000
          ? 'Phone is connected and idle. Call phone_launch_app, phone_action_and_observe with launch, or phone_read_screen directly; the server starts a session automatically. session_ready=false and device_recently_seen=false are normal before a session starts.'
          : availability ? 'Wait for the phone availability heartbeat before starting a task.'
            : 'Ask the owner to enable remote availability in Android Agent.'
    };
  };
  server.stopSession = () => ({ stopped: terminateSession(), message: 'Session revoked on server. Device stops polling after its next response; an executing action may still complete.' });
  server.startSession = ({ signal, task_text } = {}) => {
    expireSession();
    if (signal?.aborted) throw new DeviceCommandError('CANCELLED', 'Session start cancelled.');
    if (session) throw new DeviceCommandError('BUSY', 'A session already exists. Do not take over another task.');
    if (!availability || now() - availability.lastSeen >= 5000) throw new DeviceCommandError('AVAILABILITY_REQUIRED', 'Enable remote availability in the Android companion first.');
    if (task_text !== undefined && (typeof task_text !== 'string' || task_text.length > 2000 || task_text.includes('\u0000'))) throw new DeviceCommandError('INVALID_ARGUMENT', 'Task text must be at most 2000 characters with no NUL.');
    session = newSession({ remote: true, ready: false, startDelivered: false, taskText: task_text?.trim() || '' });
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); startWaiter = null; };
      const abort = () => terminateSession('CANCELLED', 'Session start cancelled; request revoked.');
      const timer = setTimeout(() => terminateSession('START_TIMEOUT', 'Phone did not acknowledge session start. Request revoked; check the phone before retrying.'), commandTimeoutMs);
      startWaiter = { resolve(value) { cleanup(); resolve(value); }, reject(error) { cleanup(); reject(error); } };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  };
  server.executeCommand = async (action, args = {}, { signal } = {}) => {
    const commandStarted = performance.now();
    if (signal?.aborted) throw new DeviceCommandError('CANCELLED', 'Tool call cancelled before dispatch.');
    expireSession();
    // Only entry-point commands can establish a lease. Snapshot-bound mutations
    // must never create a new session using IDs from an expired session.
    if (!session && ['read', 'launch'].includes(action) && availability) {
      if (action === 'launch' && !canLaunchPackage(args.package_name)) {
        throw new DeviceCommandError('COMMAND_REJECTED', 'Invalid or blocked app package. Notes and authenticator apps are excluded.');
      }
      const starting = server.startSession({ signal, task_text: args.task_text });
      const lease = session;
      await starting;
      if (session !== lease) throw new DeviceCommandError('SESSION_EXPIRED', 'Session ended before the command could be dispatched.');
    }
    if (!session) throw new DeviceCommandError('SESSION_REQUIRED', 'Call phone_start_session when owner-enabled remote availability is ready, or enable a manual session in Android.');
    if (!session.ready) throw new DeviceCommandError('SESSION_STARTING', 'Wait for phone_start_session to complete.');
    if (session.pending) throw new DeviceCommandError('BUSY', 'A device command is pending. Wait for its result.');
    if (args.task_text !== undefined) {
      if (typeof args.task_text !== 'string' || args.task_text.length > 2000 || args.task_text.includes('\u0000')) throw new DeviceCommandError('INVALID_ARGUMENT', 'Invalid task text.');
      if (!session.taskText && args.task_text.trim()) session.taskText = args.task_text.trim();
    }
    let message;
    if (action === 'read') message = server.requestRead();
    else if (action === 'launch') message = server.requestLaunchApp(args.package_name);
    else {
      const snapshot = recentSnapshot();
      if (typeof snapshot === 'string' || snapshot.id !== args.snapshot_id) {
        const code = !session.snapshot ? 'SNAPSHOT_MISSING_OR_CONSUMED' : now() - session.snapshot.created >= 30000 ? 'SNAPSHOT_EXPIRED' : 'SNAPSHOT_REPLACED';
        throw new DeviceCommandError(code, 'Read the screen again and use its snapshot_id and target_id.');
      }
      const target = snapshot.actions.find(item => item.id === args.target_id);
      if (action !== 'back' && !target) throw new DeviceCommandError('INVALID_TARGET', 'Choose a target_id from the latest read.');
      switch (action) {
        case 'submit':
          if (!target.submit) throw new DeviceCommandError('SUBMIT_UNAVAILABLE', 'Choose a focused field marked can_submit in the latest read.');
          message = queue('ime_enter', { snapshot: snapshot.id, element: target.elementId }); break;
        case 'tap': message = server.requestElementTap(target.elementId); break;
        case 'type': message = server.requestSetText(target.elementId, args.text); break;
        case 'scroll': message = server.requestScroll(target.elementId, args.direction); break;
        case 'swipe': message = server.requestSwipe(target.elementId, args.direction); break;
        case 'back': message = server.requestBack(); break;
        default: throw new DeviceCommandError('INVALID_ACTION', 'Unsupported device action.');
      }
    }
    if (!message.endsWith('queued.')) throw new DeviceCommandError('COMMAND_REJECTED', message);
    const current = session;
    const id = session.pending;
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); waiter = null; };
      const abort = () => {
        if (session === current) terminateSession('CANCELLED', 'Tool call cancelled; session revoked. Do not retry an action whose outcome is unknown.');
      };
      const timer = setTimeout(() => {
        if (session === current) {
          if (now() >= current.expires) terminateSession('SESSION_EXPIRED', 'Device session expired. Enable a new session in the app.');
          else terminateSession('TIMEOUT', 'Device result timed out; session revoked. An executing action may have completed. Do not automatically retry.');
        }
      }, Math.max(1, Math.min(commandTimeoutMs, current.expires - now())));
      waiter = {
        id,
        resolve(value) { cleanup(); resolve({ ...value, timings: { ...value?.timings, command_round_trip_ms: Math.round(performance.now() - commandStarted) } }); },
        reject(error) { cleanup(); reject(error); }
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  };
  server.on('close', () => terminateSession('SERVER_CLOSED', 'Device server closed.'));
  return server;
}
