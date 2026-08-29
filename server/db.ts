import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';

mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(join(config.dataDir, 'kasan.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    cwd             TEXT NOT NULL,
    agent           TEXT NOT NULL DEFAULT 'claude',
    permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
    model           TEXT,
    status          TEXT NOT NULL DEFAULT 'idle',
    started         INTEGER NOT NULL DEFAULT 0,
    archived        INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS events_by_session ON events (session_id, id);
`);

export type SessionRow = {
  id: string;
  title: string;
  cwd: string;
  agent: string;
  permission_mode: string;
  model: string | null;
  status: string;
  started: number;
  archived: number;
  cost_usd: number;
  created_at: number;
  updated_at: number;
};

const q = {
  insertSession: db.prepare(
    `INSERT INTO sessions (id, title, cwd, agent, permission_mode, status, created_at, updated_at)
     VALUES (?, ?, ?, 'claude', ?, 'idle', ?, ?)`,
  ),
  listSessions: db.prepare(
    `SELECT * FROM sessions WHERE archived = 0 ORDER BY updated_at DESC`,
  ),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  touchSession: db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`),
  setStatus: db.prepare(`UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?`),
  setStarted: db.prepare(`UPDATE sessions SET started = 1, updated_at = ? WHERE id = ?`),
  setModel: db.prepare(`UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?`),
  addCost: db.prepare(`UPDATE sessions SET cost_usd = ?, updated_at = ? WHERE id = ?`),
  rename: db.prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`),
  archive: db.prepare(`UPDATE sessions SET archived = 1, updated_at = ? WHERE id = ?`),
  removeSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  removeEvents: db.prepare(`DELETE FROM events WHERE session_id = ?`),
  insertEvent: db.prepare(
    `INSERT INTO events (session_id, kind, payload, created_at) VALUES (?, ?, ?, ?)`,
  ),
  listEvents: db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY id`),
};

const now = () => Date.now();

export const store = {
  createSession(s: { id: string; title: string; cwd: string; permissionMode: string }) {
    const t = now();
    q.insertSession.run(s.id, s.title, s.cwd, s.permissionMode, t, t);
    return store.getSession(s.id)!;
  },
  listSessions: () => q.listSessions.all() as unknown as SessionRow[],
  getSession: (id: string) => (q.getSession.get(id) as unknown as SessionRow) ?? null,
  touch: (id: string) => q.touchSession.run(now(), id),
  setStatus: (id: string, status: string) => q.setStatus.run(status, now(), id),
  setStarted: (id: string) => q.setStarted.run(now(), id),
  setModel: (id: string, model: string) => q.setModel.run(model, now(), id),
  setCost: (id: string, cost: number) => q.addCost.run(cost, now(), id),
  rename: (id: string, title: string) => q.rename.run(title, now(), id),
  archive: (id: string) => q.archive.run(now(), id),
  remove(id: string) {
    q.removeEvents.run(id);
    q.removeSession.run(id);
  },
  addEvent(sessionId: string, kind: string, payload: unknown) {
    const at = now();
    q.insertEvent.run(sessionId, kind, JSON.stringify(payload), at);
    q.touchSession.run(at, sessionId);
    return { kind, at, ...(payload as object) };
  },
  events(sessionId: string) {
    const rows = q.listEvents.all(sessionId) as unknown as {
      kind: string;
      payload: string;
      created_at: number;
    }[];
    return rows.map((r) => ({ kind: r.kind, at: r.created_at, ...JSON.parse(r.payload) }));
  },
};
