export type Agent = { id: string; label: string };

export type Session = {
  id: string;
  title: string;
  cwd: string;
  agent: string;
  trust: string;
  model: string | null;
  status: 'idle' | 'working' | 'error';
  costUsd: number;
  createdAt: number;
  updatedAt: number;
};

export type KEvent = {
  kind: 'user' | 'text' | 'thinking' | 'tool' | 'tool_result' | 'turn_end' | 'meta' | 'notice';
  at: number;
  [k: string]: any;
};

export type DirListing = {
  path: string | null;
  parent: string | null;
  entries: { name: string; path: string; repo: boolean }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body as T;
}

export const api = {
  me: () => call<{ authed: boolean }>('/api/me'),
  login: (passcode: string) =>
    call<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ passcode }) }),
  logout: () => call<{ ok: true }>('/api/logout', { method: 'POST' }),

  agents: () => call<Agent[]>('/api/agents'),
  sessions: () => call<Session[]>('/api/sessions'),
  session: (id: string) => call<{ session: Session; events: KEvent[] }>(`/api/sessions/${id}`),
  create: (body: { cwd: string; title: string; agent: string; trust: string }) =>
    call<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(body) }),
  setAgent: (id: string, agent: string) =>
    call<Session>(`/api/sessions/${id}/agent`, { method: 'POST', body: JSON.stringify({ agent }) }),
  archive: (id: string) => call(`/api/sessions/${id}/archive`, { method: 'POST' }),
  remove: (id: string) => call(`/api/sessions/${id}`, { method: 'DELETE' }),
  rename: (id: string, title: string) =>
    call<Session>(`/api/sessions/${id}/rename`, { method: 'POST', body: JSON.stringify({ title }) }),

  dirs: (path?: string) =>
    call<DirListing>(`/api/dirs${path ? `?path=${encodeURIComponent(path)}` : ''}`),
};

export function ago(ts: number) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const shortPath = (p: string) => p.replace(/^\/workspace/, '~').replace(/^\/home\/[^/]+/, '~');
