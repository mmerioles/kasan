import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, shortPath, type KEvent, type Session } from '../api.ts';
import { markdown } from '../markdown.ts';
import { Dot, Pending } from '../components/Bits.tsx';

/* ---------------- one line of transcript ---------------- */

function ToolLine({ ev, result }: { ev: KEvent; result?: KEvent }) {
  const [open, setOpen] = useState(false);
  const failed = result && !result.ok;
  return (
    <>
      <button className="tool" onClick={() => setOpen((o) => !o)}>
        <span className="caret">{open ? '▾' : '▸'}</span>
        <span className="name">{ev.name}</span>
        <span className="arg">{ev.summary}</span>
        {failed && <span className="bad">!</span>}
      </button>
      {open && (
        <div className="tool-open">
          <div className="lbl">sent</div>
          <pre>{JSON.stringify(ev.input, null, 2)}</pre>
          {result && (
            <>
              <div className="lbl">{result.ok ? 'got back' : 'failed'}</div>
              <pre>{result.preview || '(nothing)'}</pre>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const short = text.length > 220;
  return (
    <div className="turn">
      <div className="who">thinking</div>
      <div className="thinking" onClick={() => short && setOpen((o) => !o)}
           style={{ cursor: short ? 'pointer' : 'default' }}>
        {open || !short ? text : `${text.slice(0, 220)}…`}
      </div>
    </div>
  );
}

/* ---------------- the screen ---------------- */

export function SessionView({ id, onBack }: { id: string; onBack: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<KEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');

  const ws = useRef<WebSocket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);

  /* --- socket, with reconnect --- */
  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: number;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/ws?session=${encodeURIComponent(id)}`);
      ws.current = sock;

      sock.onopen = () => { retry = 0; setConnected(true); };
      sock.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.t === 'hello') {
          setSession(msg.session);
          setEvents(msg.events);
        } else if (msg.t === 'event') {
          setEvents((prev) => [...prev, msg.event]);
        } else if (msg.t === 'session') {
          setSession(msg.session);
        } else if (msg.t === 'error') {
          setErr(msg.message);
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry += 1;
        timer = window.setTimeout(connect, Math.min(1000 * retry, 8000));
      };
      sock.onerror = () => sock.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws.current?.close();
    };
  }, [id]);

  /* --- keep the newest line in view, unless the reader scrolled up --- */
  useLayoutEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [events.length, session?.status]);

  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stick.current = gap < 140;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* --- pair each tool call with its result --- */
  const results = useMemo(() => {
    const m = new Map<string, KEvent>();
    for (const e of events) if (e.kind === 'tool_result') m.set(e.id, e);
    return m;
  }, [events]);

  function send() {
    const text = draft.trim();
    if (!text || !connected) return;
    ws.current?.send(JSON.stringify({ t: 'prompt', text }));
    setDraft('');
    stick.current = true;
    if (box.current) box.current.style.height = 'auto';
  }

  function stop() {
    ws.current?.send(JSON.stringify({ t: 'stop' }));
  }

  const working = session?.status === 'working';

  return (
    <div ref={scroller}>
      <div className="topbar" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--paper)' }}>
        <button className="btn plain" onClick={onBack}>←</button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row">
            {session && <Dot status={session.status} />}
            <div className="hand truncate" style={{ fontSize: 19 }}>{session?.title ?? '…'}</div>
          </div>
          <div className="tiny faint truncate">{session ? shortPath(session.cwd) : ''}</div>
        </div>
        {working && <button className="btn small" onClick={stop}>stop</button>}
      </div>

      <div className="page" style={{ paddingTop: 0 }}>
        {!connected && (
          <div className="notice">reconnecting…</div>
        )}

        <div className="log">
          {events.map((e, i) => {
            switch (e.kind) {
              case 'user':
                return (
                  <div className="turn" key={i}>
                    <div className="who">you</div>
                    <div className="mine">{e.text}</div>
                  </div>
                );
              case 'text':
                return (
                  <div className="turn" key={i}>
                    <div className="said">{markdown(e.text)}</div>
                  </div>
                );
              case 'thinking':
                return <Thinking key={i} text={e.text} />;
              case 'tool':
                return <ToolLine key={i} ev={e} result={results.get(e.id)} />;
              case 'tool_result':
                return null; // shown inside its tool line
              case 'turn_end':
                return (
                  <div className="turnbar" key={i}>
                    <span>
                      {(e.durationMs / 1000).toFixed(1)}s
                      {e.costUsd ? ` · $${e.costUsd.toFixed(3)}` : ''}
                    </span>
                  </div>
                );
              case 'notice':
                return (
                  <div className={`notice${e.tone === 'bad' ? ' bad' : ''}`} key={i}>
                    {e.text}
                    {e.code && <div className="notice-code">{e.code}</div>}
                  </div>
                );
              default:
                return null;
            }
          })}

          {working && (
            <div className="turn"><Pending /></div>
          )}

          {events.length === 0 && (
            <div className="empty">
              <div className="hand">say what you want done</div>
              <div className="tiny faint" style={{ marginTop: 6 }}>
                it keeps going after you close this tab
              </div>
            </div>
          )}
        </div>

        <div ref={bottom} />

        {err && <div className="err">{err}</div>}

        <div className="composer">
          <div className="row">
            <label className="field grow">
              <textarea
                ref={box}
                rows={1}
                value={draft}
                placeholder={working ? 'add a note…' : 'what should it do?'}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  // Enter sends on a real keyboard; phones get the button.
                  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(hover: none)').matches) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
            </label>
            <button className="btn fill" onClick={send} disabled={!draft.trim() || !connected}>
              send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
