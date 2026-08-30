import { useEffect, useState } from 'react';
import { api, ago, shortPath, type Session } from '../api.ts';
import { Dot, DoodleBaguette } from '../components/Bits.tsx';

export function Sessions({
  onOpen,
  onNew,
  onOut,
}: {
  onOpen: (id: string) => void;
  onNew: () => void;
  onOut: () => void;
}) {
  const [list, setList] = useState<Session[] | null>(null);
  const [err, setErr] = useState('');

  async function load() {
    try {
      setList(await api.sessions());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    // Cheap freshness: the list is a glance surface, not a live one.
    const t = setInterval(load, 5000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="wordmark grow">kasan</div>
        <button className="btn plain tiny muted" onClick={async () => { await api.logout(); onOut(); }}>
          sign out
        </button>
      </div>

      <div className="page" style={{ paddingTop: 4 }}>
        <button className="btn fill" style={{ width: '100%' }} onClick={onNew}>
          + new session
        </button>

        {err && <div className="err">{err}</div>}

        {list && list.length === 0 && (
          <div className="empty">
            <DoodleBaguette />
            <div className="hand">nothing baking yet</div>
            <div className="tiny faint" style={{ marginTop: 6 }}>
              start a session and it will keep working while you walk away
            </div>
          </div>
        )}

        <div className="stack" style={{ marginTop: 18 }}>
          {list?.map((s) => (
            <div className="sketch" key={s.id}>
              <button className="card" onClick={() => onOpen(s.id)}>
                <div className="row">
                  <Dot status={s.status} />
                  <div className="card-title grow truncate">{s.title}</div>
                </div>
                <div className="tiny faint truncate" style={{ marginTop: 4, marginLeft: 21 }}>
                  {shortPath(s.cwd)}
                </div>
                <div className="tiny muted" style={{ marginTop: 6, marginLeft: 21 }}>
                  <span className="hand">{s.agent}</span>
                  <span className="faint"> · </span>
                  {s.status === 'working' ? 'working…' : s.status === 'error' ? 'stopped early' : ago(s.updatedAt)}
                  {s.costUsd > 0 && <span className="faint"> · ${s.costUsd.toFixed(2)}</span>}
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
