import { useEffect, useState } from 'react';
import { api, shortPath, type DirListing } from '../api.ts';
import { Radio } from '../components/Bits.tsx';

const MODES = [
  { id: 'bypassPermissions', label: 'just go', hint: 'runs unattended — nothing to approve' },
  { id: 'acceptEdits', label: 'ask before commands', hint: 'edits files freely, checks in on shell commands' },
  { id: 'default', label: 'ask me everything', hint: 'pauses on every tool — you must be watching' },
];

export function NewSession({ onMade, onBack }: { onMade: (id: string) => void; onBack: () => void }) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTouched] = useState(false);
  const [mode, setMode] = useState('bypassPermissions');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(path?: string) {
    setErr('');
    try {
      const l = await api.dirs(path);
      setListing(l);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { go(); }, []);

  async function create() {
    if (!cwd || busy) return;
    setBusy(true);
    setErr('');
    try {
      const s = await api.create({ cwd, title: title.trim(), permissionMode: mode });
      onMade(s.id);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <button className="btn plain" onClick={onBack}>← back</button>
        <div className="hand grow" style={{ fontSize: 20 }}>new session</div>
      </div>

      <div className="page" style={{ paddingTop: 4 }}>
        <div className="hand muted" style={{ fontSize: 15 }}>where</div>
        <div className="sketch" style={{ padding: '6px 14px', marginTop: 6 }}>
          {listing?.path && (
            <div className="tiny faint truncate" style={{ padding: '8px 4px 6px' }}>
              {shortPath(listing.path)}
            </div>
          )}
          {listing?.parent && (
            <button className="pick" onClick={() => go(listing.parent ?? undefined)}>
              <span className="faint">↑</span>
              <span className="grow faint">up a level</span>
            </button>
          )}
          {listing?.entries.length === 0 && (
            <div className="tiny faint" style={{ padding: '10px 4px' }}>no folders here</div>
          )}
          {listing?.entries.map((e) => (
            <button
              className="pick"
              key={e.path}
              onClick={() => { setCwd(e.path); if (!titleTouched) setTitle(e.name); go(e.path); }}
            >
              <span className="faint">{e.repo ? '◆' : '▸'}</span>
              <span className="grow truncate">{e.name}</span>
              {cwd === e.path && <span className="hand tiny">chosen</span>}
            </button>
          ))}
        </div>

        {cwd && (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            working in <span className="hand" style={{ fontSize: 15 }}>{shortPath(cwd)}</span>
          </div>
        )}

        <div className="rule dash" />

        <div className="hand muted" style={{ fontSize: 15 }}>call it</div>
        <label className="field" style={{ marginTop: 6 }}>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTouched(true); }}
            placeholder="what are you working on?"
            aria-label="session name"
          />
        </label>

        <div className="rule dash" />

        <div className="hand muted" style={{ fontSize: 15 }}>trust</div>
        <div style={{ marginTop: 2 }}>
          {MODES.map((m) => (
            <label className="opt" key={m.id}>
              <input
                type="radio"
                name="mode"
                checked={mode === m.id}
                onChange={() => setMode(m.id)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
              <Radio on={mode === m.id} />
              <span>
                <span className="t">{m.label}</span>
                <span className="tiny faint" style={{ display: 'block' }}>{m.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {err && <div className="err">{err}</div>}

        <button
          className="btn fill"
          style={{ width: '100%', marginTop: 18 }}
          disabled={!cwd || busy}
          onClick={create}
        >
          {busy ? 'setting up…' : cwd ? 'start' : 'pick a folder first'}
        </button>
      </div>
    </>
  );
}
