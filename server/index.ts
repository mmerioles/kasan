import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, normalize as normPath } from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from './config.ts';
import { store, db } from './db.ts';
import * as auth from './auth.ts';
import * as manager from './manager.ts';
import { browse, allowed } from './fsbrowse.ts';
import { agents, isAgentId, isTrust, AGENT_IDS } from './adapters/index.ts';

const WEB_DIR = resolve('web/dist');

// A restart orphans every agent process, so no session is mid-turn or actively
// failing any more. Whatever went wrong stays in the transcript as a notice;
// the card should not keep reporting it.
db.exec(`UPDATE sessions SET status = 'idle' WHERE status IN ('working', 'error')`);

const json = (res: ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', ...headers });
  res.end(payload);
};

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new Error('invalid json');
  }
}

const shape = (s: NonNullable<ReturnType<typeof store.getSession>>) => ({
  id: s.id,
  title: s.title,
  cwd: s.cwd,
  agent: s.agent,
  trust: s.trust,
  model: s.model,
  status: s.status,
  costUsd: s.cost_usd,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(url: string, res: ServerResponse) {
  if (!existsSync(WEB_DIR)) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    return res.end('kasan: web/dist is missing — run `npm run build`.');
  }
  const rel = normPath(decodeURIComponent(url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR) || !existsSync(file) || rel === '/' || rel === '\\') {
    file = join(WEB_DIR, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const isHtml = extname(file) === '.html';
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  const ip = req.socket.remoteAddress ?? 'unknown';

  try {
    // ---- auth ------------------------------------------------------------
    if (path === '/api/login' && req.method === 'POST') {
      if (!auth.loginAllowed(ip)) return json(res, 429, { error: 'too many attempts, wait a minute' });
      const body = await readBody(req);
      const ok = auth.checkPasscode(body.passcode);
      auth.noteLogin(ip, ok);
      if (!ok) return json(res, 401, { error: 'wrong passcode' });
      return json(res, 200, { ok: true }, { 'set-cookie': auth.cookieHeader(auth.issueToken()) });
    }

    if (path === '/api/logout' && req.method === 'POST') {
      return json(res, 200, { ok: true }, { 'set-cookie': auth.clearCookie() });
    }

    if (path === '/api/me') {
      return json(res, 200, { authed: auth.isAuthed(req) });
    }

    // ---- everything below needs a session --------------------------------
    if (path.startsWith('/api/')) {
      if (!auth.isAuthed(req)) return json(res, 401, { error: 'unauthorized' });

      if (path === '/api/dirs') {
        const p = url.searchParams.get('path') ?? undefined;
        return json(res, 200, await browse(p || undefined));
      }

      if (path === '/api/agents') {
        return json(res, 200, AGENT_IDS.map((id) => ({ id, label: agents[id].label })));
      }

      if (path === '/api/sessions' && req.method === 'GET') {
        return json(res, 200, store.listSessions().map(shape));
      }

      if (path === '/api/sessions' && req.method === 'POST') {
        const body = await readBody(req);
        const cwd = resolve(String(body.cwd ?? ''));
        if (!allowed(cwd)) return json(res, 400, { error: 'that folder is outside the workspace' });
        if (!existsSync(cwd)) return json(res, 400, { error: 'that folder does not exist' });

        const agent = isAgentId(body.agent) ? body.agent : 'claude';
        const trust = isTrust(body.trust) ? body.trust : 'go';
        const title = String(body.title ?? '').trim() || cwd.split('/').filter(Boolean).pop() || 'session';

        const s = store.createSession({ id: auth.newId(), title, cwd, agent, trust });
        return json(res, 200, shape(s));
      }

      const m = path.match(/^\/api\/sessions\/([\w-]+)(\/\w+)?$/);
      if (m) {
        const s = store.getSession(m[1]);
        if (!s) return json(res, 404, { error: 'no such session' });
        const sub = m[2];

        if (!sub && req.method === 'GET') {
          return json(res, 200, { session: shape(s), events: store.events(s.id) });
        }
        if (!sub && req.method === 'DELETE') {
          manager.remove(s.id);
          return json(res, 200, { ok: true });
        }
        if (sub === '/archive' && req.method === 'POST') {
          manager.stop(s.id);
          store.archive(s.id);
          return json(res, 200, { ok: true });
        }
        if (sub === '/rename' && req.method === 'POST') {
          const body = await readBody(req);
          const title = String(body.title ?? '').trim();
          if (title) store.rename(s.id, title);
          return json(res, 200, shape(store.getSession(s.id)!));
        }
        if (sub === '/agent' && req.method === 'POST') {
          const body = await readBody(req);
          if (!isAgentId(body.agent)) return json(res, 400, { error: 'unknown agent' });
          return json(res, 200, shape(manager.switchAgent(s.id, body.agent)));
        }
        if (sub === '/stop' && req.method === 'POST') {
          return json(res, 200, { stopped: manager.stop(s.id) });
        }
      }

      return json(res, 404, { error: 'not found' });
    }

    await serveStatic(path, res);
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

// ---- websockets ---------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws' || !auth.isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  const id = url.searchParams.get('session') ?? '';
  if (!store.getSession(id)) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, id));
});

wss.on('connection', (ws, _req, sessionId: string) => {
  const send = (msg: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  send({ t: 'hello', session: shape(store.getSession(sessionId)!), events: store.events(sessionId) });

  const onEvent = (ev: unknown) => send({ t: 'event', event: ev });
  const onSession = (s: any) => s && send({ t: 'session', session: shape(s) });
  manager.bus.on(`event:${sessionId}`, onEvent);
  manager.bus.on(`session:${sessionId}`, onSession);

  const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 30_000);

  ws.on('message', (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    try {
      if (msg.t === 'prompt' && typeof msg.text === 'string' && msg.text.trim()) {
        manager.send(sessionId, msg.text);
      } else if (msg.t === 'stop') {
        manager.stop(sessionId);
      }
    } catch (err) {
      send({ t: 'error', message: (err as Error).message });
    }
  });

  ws.on('close', () => {
    clearInterval(ping);
    manager.bus.off(`event:${sessionId}`, onEvent);
    manager.bus.off(`session:${sessionId}`, onSession);
  });
});

server.listen(config.port, config.host, () => {
  console.log(`\n  kasan — http://localhost:${config.port}`);
  console.log(`  workspace: ${config.workspace.join(', ')}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    manager.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
