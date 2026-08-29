import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { config } from './config.ts';
import { store, type SessionRow } from './db.ts';
import { buildArgs, encodePrompt, normalize, type KEvent, type PermissionMode } from './adapters/claude.ts';

type Live = {
  child: ChildProcessWithoutNullStreams;
  idleTimer?: NodeJS.Timeout;
};

const live = new Map<string, Live>();

/** Fires `event:<sessionId>` and `session:<sessionId>` for websocket clients. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

function emitEvent(sessionId: string, ev: KEvent) {
  const stored = store.addEvent(sessionId, ev.kind, ev);
  bus.emit(`event:${sessionId}`, stored);
}

function setStatus(sessionId: string, status: SessionRow['status']) {
  store.setStatus(sessionId, status);
  bus.emit(`session:${sessionId}`, store.getSession(sessionId));
}

function armIdleTimer(sessionId: string) {
  const l = live.get(sessionId);
  if (!l) return;
  clearTimeout(l.idleTimer);
  if (config.idleMinutes <= 0) return;
  l.idleTimer = setTimeout(() => {
    // The conversation is safe on disk; the next message resumes it.
    stop(sessionId, 'idle');
  }, config.idleMinutes * 60_000);
}

function start(session: SessionRow) {
  const args = buildArgs({
    sessionId: session.id,
    permissionMode: session.permission_mode as PermissionMode,
    resume: session.started === 1,
  });

  const child = spawn(config.claudeBin, args, {
    cwd: session.cwd,
    env: {
      ...process.env,
      // Let Claude Code know it is not attached to a human terminal.
      CLAUDE_CODE_ENTRYPOINT: 'kasan',
      FORCE_COLOR: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  const l: Live = { child };
  live.set(session.id, l);
  store.setStarted(session.id);

  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.trim()) return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return; // Not JSON — the CLI occasionally prints a stray banner.
    }
    for (const ev of normalize(raw)) {
      if (ev.kind === 'meta' && ev.model) store.setModel(session.id, ev.model);
      if (ev.kind === 'turn_end') {
        store.setCost(session.id, ev.costUsd);
        emitEvent(session.id, ev);
        setStatus(session.id, 'idle');
        armIdleTimer(session.id);
        continue;
      }
      emitEvent(session.id, ev);
    }
  });

  let stderrTail = '';
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  child.on('exit', (code, signal) => {
    clearTimeout(l.idleTimer);
    live.delete(session.id);
    const current = store.getSession(session.id);
    if (!current) return;
    // 143 is 128+SIGTERM: how a `docker stop` reaches us. Not a crash.
    if (signal === 'SIGTERM' || code === 0 || code === 143) {
      setStatus(session.id, 'idle');
    } else {
      emitEvent(session.id, {
        kind: 'notice',
        tone: 'bad',
        text: `agent exited (code ${code}) ${stderrTail.trim().split('\n').slice(-3).join(' ')}`.trim(),
      });
      setStatus(session.id, 'error');
    }
  });

  child.on('error', (err) => {
    live.delete(session.id);
    emitEvent(session.id, {
      kind: 'notice',
      tone: 'bad',
      text: `could not launch "${config.claudeBin}": ${err.message}`,
    });
    setStatus(session.id, 'error');
  });

  return l;
}

export function send(sessionId: string, text: string) {
  const session = store.getSession(sessionId);
  if (!session) throw new Error('no such session');

  let l = live.get(sessionId);
  if (!l || l.child.exitCode !== null || l.child.killed) {
    l = start(session);
  }

  clearTimeout(l.idleTimer);
  emitEvent(sessionId, { kind: 'user', text });
  setStatus(sessionId, 'working');
  l.child.stdin.write(encodePrompt(text));
}

export function stop(sessionId: string, reason: 'user' | 'idle' = 'user') {
  const l = live.get(sessionId);
  if (!l) return false;
  clearTimeout(l.idleTimer);
  l.child.kill('SIGTERM');
  // Don't let a wedged process linger.
  setTimeout(() => l.child.killed || l.child.kill('SIGKILL'), 3000).unref();
  if (reason === 'user') {
    emitEvent(sessionId, { kind: 'notice', text: 'stopped' });
  }
  return true;
}

export function remove(sessionId: string) {
  stop(sessionId);
  store.remove(sessionId);
}

export const isLive = (sessionId: string) => live.has(sessionId);

export function shutdown() {
  for (const [, l] of live) l.child.kill('SIGTERM');
}
