import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import { config } from './config.ts';
import { store, type SessionRow } from './db.ts';
import { agents } from './adapters/index.ts';
import type { Agent, KEvent, Parser, Trust } from './adapters/types.ts';
import { DEFAULT_CODEX_MODEL } from './adapters/codex.ts';
import { discoverArtifactBatches } from './artifacts.ts';

type Live = {
  child: ChildProcess;
  parser: Parser;
  agent: Agent;
  /** Artifact batches that already existed when the current turn began. */
  artifactBaseline: Set<string>;
  idleTimer?: NodeJS.Timeout;
  /** Set when we killed it on purpose, so the exit is not reported as a crash. */
  stopping?: boolean;
  /** Per-turn agents end their turn by exiting; persistent ones send an event. */
  turnEnded?: boolean;
};

const live = new Map<string, Live>();
const queued = new Map<string, string[]>();

/** Fires `event:<sessionId>` and `session:<sessionId>` for websocket clients. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

function emitEvent(sessionId: string, ev: KEvent) {
  bus.emit(`event:${sessionId}`, store.addEvent(sessionId, ev.kind, ev));
}

function artifactBatchIds(cwd: string) {
  return new Set(discoverArtifactBatches(cwd).map((batch) => batch.batchId));
}

function emitNewArtifactBatches(session: SessionRow, baseline: Set<string>) {
  const seen = new Set(
    store.events(session.id)
      .filter((event) => event.kind === 'artifact_batch')
      .map((event) => String(event.batchId)),
  );
  for (const batch of discoverArtifactBatches(session.cwd)) {
    if (!baseline.has(batch.batchId) && !seen.has(batch.batchId)) emitEvent(session.id, batch);
  }
}

function setStatus(sessionId: string, status: string) {
  const current = store.getSession(sessionId);
  if (current?.status === status) return; // nothing changed; don't wake clients
  store.setStatus(sessionId, status);
  bus.emit(`session:${sessionId}`, store.getSession(sessionId));
}

function armIdleTimer(sessionId: string) {
  const l = live.get(sessionId);
  if (!l) return;
  clearTimeout(l.idleTimer);
  if (config.idleMinutes <= 0 || l.agent.mode !== 'persistent') return;
  // The conversation is safe on disk; the next message resumes it.
  l.idleTimer = setTimeout(() => stop(sessionId, 'idle'), config.idleMinutes * 60_000);
}

function agentFor(session: SessionRow): Agent {
  return agents[session.agent as keyof typeof agents] ?? agents.claude;
}

/** Launch a run. For persistent agents this is once per session; for per-turn
 *  agents it is once per prompt. */
function launch(session: SessionRow, agent: Agent, prompt: string): Live {
  const plan = agent.plan({
    sessionId: session.id,
    resumeId: session.resume_id,
    started: session.started === 1,
    trust: session.trust as Trust,
    model: session.model,
  });

  const child = spawn(agent.bin, plan.args, {
    cwd: session.cwd,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'kasan', FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const l: Live = {
    child,
    parser: agent.newParser(),
    agent,
    artifactBaseline: artifactBatchIds(session.cwd),
  };
  live.set(session.id, l);
  store.setStarted(session.id);

  createInterface({ input: child.stdout! }).on('line', (line) => {
    const t = line.trim();
    if (!t.startsWith('{')) return; // both CLIs print the odd plain-text banner
    let raw: unknown;
    try {
      raw = JSON.parse(t);
    } catch {
      return;
    }

    for (const ev of l.parser.handle(raw)) {
      if (ev.kind === 'meta' && ev.model) store.setModel(session.id, ev.model);
      if (ev.kind === 'turn_end') {
        if (ev.costUsd) store.setCost(session.id, ev.costUsd);
        l.turnEnded = true;
        emitNewArtifactBatches(session, l.artifactBaseline);
        emitEvent(session.id, ev);
        setStatus(session.id, 'idle');
        armIdleTimer(session.id);
        continue;
      }
      emitEvent(session.id, ev);
    }

    // Codex tells us its thread id partway through the first run.
    const rid = l.parser.resumeId();
    if (rid && rid !== session.resume_id) {
      store.setResumeId(session.id, rid);
      session.resume_id = rid;
    }
  });

  let stderrTail = '';
  child.stderr!.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  child.on('exit', (code, signal) => {
    clearTimeout(l.idleTimer);
    if (live.get(session.id) === l) live.delete(session.id);
    if (!store.getSession(session.id)) return;

    // 143 is 128+SIGTERM: how a `docker stop` reaches us. Not a crash.
    const clean = l.stopping || signal === 'SIGTERM' || code === 0 || code === 143;
    if (clean || l.turnEnded) {
      setStatus(session.id, 'idle');
      const next = queued.get(session.id)?.shift();
      if (next) {
        if (!queued.get(session.id)?.length) queued.delete(session.id);
        const current = store.getSession(session.id);
        if (current) {
          setStatus(session.id, 'working');
          launch(current, agentFor(current), next);
        }
      }
    } else {
      emitEvent(session.id, {
        kind: 'notice',
        tone: 'bad',
        text: `${l.agent.label} exited (code ${code}) ${stderrTail.trim().split('\n').slice(-2).join(' ')}`.trim(),
      });
      setStatus(session.id, 'error');
    }
  });

  child.on('error', (err) => {
    if (live.get(session.id) === l) live.delete(session.id);
    emitEvent(session.id, {
      kind: 'notice',
      tone: 'bad',
      text: `could not launch "${agent.bin}": ${err.message}`,
    });
    setStatus(session.id, 'error');
  });

  if (plan.writePrompt) {
    child.stdin!.write(prompt);
    child.stdin!.end();
  }

  return l;
}

export function send(sessionId: string, text: string) {
  const session = store.getSession(sessionId);
  if (!session) throw new Error('no such session');
  const agent = agentFor(session);

  emitEvent(sessionId, { kind: 'user', text });
  setStatus(sessionId, 'working');

  if (agent.mode === 'per-turn') {
    // A turn is a whole process. If one is somehow still running, let it finish
    // rather than trampling it.
    const running = live.get(sessionId);
    if (running && running.child.exitCode === null) {
      const pending = queued.get(sessionId) ?? [];
      pending.push(text);
      queued.set(sessionId, pending);
      emitEvent(sessionId, { kind: 'notice', text: `queued message${pending.length > 1 ? ` (${pending.length} waiting)` : ''}` });
      return;
    }
    launch(session, agent, text);
    return;
  }

  let l = live.get(sessionId);
  if (!l || l.child.exitCode !== null || l.child.killed) {
    l = launch(session, agent, text);
  } else {
    l.artifactBaseline = artifactBatchIds(session.cwd);
  }
  clearTimeout(l.idleTimer);
  l.child.stdin!.write(agent.encodePrompt!(text));
}

export function chooseArtifacts(sessionId: string, batchId: string, requestedIds: string[]) {
  const event = [...store.events(sessionId)].reverse().find(
    (item) => item.kind === 'artifact_batch' && item.batchId === batchId,
  );
  if (!event) throw new Error('no such artifact batch');

  const allowed = new Set((event.artifacts ?? []).map((item: any) => String(item.id)));
  const ids = [...new Set(requestedIds)].filter((id) => allowed.has(id));
  if (!ids.length || (!event.multiple && ids.length !== 1)) throw new Error('invalid artifact selection');

  emitEvent(sessionId, { kind: 'artifact_choice', batchId, ids });
  send(
    sessionId,
    `I selected ${ids.join(', ')} from artifact batch ${batchId}. Continue by refining the selected option${ids.length > 1 ? 's' : ''}.`,
  );
}

export function stop(sessionId: string, reason: 'user' | 'idle' = 'user') {
  const l = live.get(sessionId);
  if (!l) return false;
  clearTimeout(l.idleTimer);
  l.stopping = true;
  queued.delete(sessionId);
  l.child.kill('SIGTERM');
  setTimeout(() => l.child.killed || l.child.kill('SIGKILL'), 3000).unref();
  if (reason === 'user') emitEvent(sessionId, { kind: 'notice', text: 'stopped' });
  return true;
}

/** Point a session at a different agent. Conversations cannot transfer between
 *  CLIs, so this starts a fresh one in the same folder. */
export function switchAgent(sessionId: string, agentId: string) {
  const session = store.getSession(sessionId);
  if (!session) throw new Error('no such session');
  if (!(agentId in agents)) throw new Error('unknown agent');
  if (session.agent === agentId) return store.getSession(sessionId)!;

  stop(sessionId);
  store.setAgent(sessionId, agentId);
  if (agentId === 'codex') store.setModel(sessionId, DEFAULT_CODEX_MODEL);
  emitEvent(sessionId, {
    kind: 'notice',
    text: `switched to ${agents[agentId as keyof typeof agents].label} — it starts fresh, with none of the history above`,
  });
  setStatus(sessionId, 'idle');
  return store.getSession(sessionId)!;
}

export function switchModel(sessionId: string, model: string) {
  const session = store.getSession(sessionId);
  if (!session) throw new Error('no such session');
  if (session.agent !== 'codex') throw new Error('model selection is only available for Codex');
  if (session.model === model) return session;

  store.setModel(sessionId, model);
  emitEvent(sessionId, { kind: 'notice', text: `model changed to ${model} for the next message` });
  return store.getSession(sessionId)!;
}

export function remove(sessionId: string) {
  stop(sessionId);
  store.remove(sessionId);
}

export const isLive = (sessionId: string) => live.has(sessionId);

export function shutdown() {
  for (const [, l] of live) {
    l.stopping = true;
    l.child.kill('SIGTERM');
  }
}
