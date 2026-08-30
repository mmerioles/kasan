import { useEffect, useState } from 'react';
import { api, shortPath, type DirListing, type ModelOption } from '../api.ts';
import { Radio } from '../components/Bits.tsx';

const TRUSTS = [
  { id: 'go', label: 'just go', hint: 'runs unattended — nothing to approve' },
  { id: 'workspace', label: 'edits only', hint: 'can change files here, but not run commands freely' },
  { id: 'read', label: 'read only', hint: 'looks and plans, changes nothing' },
];

export function NewSession({ onMade, onBack }: { onMade: (id: string) => void; onBack: () => void }) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleTouched, setTouched] = useState(false);
  const [trust, setTrust] = useState('go');
  const [agent, setAgent] = useState('claude');
  const [agentList, setAgentList] = useState<{ id: string; label: string }[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState('');
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

  useEffect(() => {
    go();
    api.agents().then(setAgentList).catch(() => {});
  }, []);

  useEffect(() => {
    api.models(agent).then((list) => { setModels(list); setModel(list[0]?.id ?? ''); }).catch(() => {});
  }, [agent]);

  async function create() {
    if (!cwd || busy) return;
    setBusy(true);
    setErr('');
    try {
      const s = await api.create({ cwd, title: title.trim(), agent, trust, model });
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

        <div className="hand muted" style={{ fontSize: 15 }}>who</div>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          {agentList.map((a) => (
            <button
              key={a.id}
              className={`btn small${agent === a.id ? ' fill' : ''}`}
              onClick={() => setAgent(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="rule dash" />

        {models.length > 0 && (
          <>
            <div className="hand muted" style={{ fontSize: 15 }}>model</div>
            <div className="model-list" style={{ marginTop: 6 }}>
              {models.map((m) => (
                <label className={`model-option${model === m.id ? ' selected' : ''}`} key={m.id}>
                  <input type="radio" name="model" checked={model === m.id} onChange={() => setModel(m.id)} />
                  <span className="grow">
                    <span className="t">{m.label}</span>
                    <span className="tiny faint">{m.hint}</span>
                  </span>
                  {model === m.id && <span className="tiny hand">selected</span>}
                </label>
              ))}
            </div>
            <div className="rule dash" />
          </>
        )}

        <div className="hand muted" style={{ fontSize: 15 }}>trust</div>
        <div style={{ marginTop: 2 }}>
          {TRUSTS.map((m) => (
            <label className="opt" key={m.id}>
              <input
                type="radio"
                name="trust"
                checked={trust === m.id}
                onChange={() => setTrust(m.id)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
              <Radio on={trust === m.id} />
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
