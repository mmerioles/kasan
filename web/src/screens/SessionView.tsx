import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ago, artifactUrl, feedbackUrl, shortPath, type KEvent, type ModelOption, type Session } from '../api.ts';
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

function ArtifactBatch({
  ev,
  sessionId,
  disabled,
  chosen,
  onChoose,
  onReview,
}: {
  ev: KEvent;
  sessionId: string;
  disabled: boolean;
  chosen?: string[];
  onChoose: (batchId: string, ids: string[]) => void;
  onReview: (image: { src: string; label: string }) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const activeIds = chosen ?? selected;

  function toggle(id: string) {
    if (chosen) return;
    setSelected((current) => ev.multiple
      ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
      : [id]);
  }

  return (
    <section className="artifact-batch" aria-label={ev.title}>
      <div className="artifact-grid">
        {ev.artifacts.map((artifact: any) => {
          const active = activeIds.includes(artifact.id);
          return (
            <div
              className={`artifact-option${active ? ' selected' : ''}`}
              key={artifact.id}
            >
              <button
                type="button"
                className="artifact-select"
                aria-pressed={active}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.artifact-preview')) {
                    onReview({
                      src: artifactUrl(sessionId, ev.batchId, artifact.file),
                      label: `${ev.title} — ${artifact.label}`,
                    });
                    return;
                  }
                  toggle(artifact.id);
                }}
              >
                <span className="artifact-preview">
                  <img
                    src={artifactUrl(sessionId, ev.batchId, artifact.file)}
                    alt={artifact.description || artifact.label}
                    loading="lazy"
                  />
                </span>
                <span className="artifact-copy">
                  <span className="artifact-label">{artifact.label}</span>
                  {artifact.description && <span className="tiny faint">{artifact.description}</span>}
                </span>
                <span className="artifact-check" aria-hidden="true">{active ? '●' : '○'}</span>
              </button>
              <button
                type="button"
                className="artifact-review hand"
                onClick={() => onReview({
                  src: artifactUrl(sessionId, ev.batchId, artifact.file),
                  label: `${ev.title} — ${artifact.label}`,
                })}
              >
                open larger + mark up
              </button>
            </div>
          );
        })}
      </div>
      <div className="artifact-actions">
        <button
          type="button"
          className="btn fill small"
          disabled={!selected.length || disabled || Boolean(chosen)}
          onClick={() => onChoose(ev.batchId, selected)}
        >
          {chosen ? 'selection sent' : `continue with ${selected.length || 'selection'}`}
        </button>
      </div>
    </section>
  );
}

type Point = { x: number; y: number };
type Mark =
  | { tool: 'pen'; points: Point[] }
  | { tool: 'arrow' | 'box'; start: Point; end: Point };

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
  ctx.strokeStyle = '#e53935';
  ctx.fillStyle = '#e53935';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (mark.tool === 'pen') {
    if (mark.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(mark.points[0].x, mark.points[0].y);
    for (const point of mark.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    return;
  }
  if (mark.tool === 'box') {
    ctx.strokeRect(mark.start.x, mark.start.y, mark.end.x - mark.start.x, mark.end.y - mark.start.y);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(mark.start.x, mark.start.y);
  ctx.lineTo(mark.end.x, mark.end.y);
  ctx.stroke();
  const angle = Math.atan2(mark.end.y - mark.start.y, mark.end.x - mark.start.x);
  const head = 22;
  ctx.beginPath();
  ctx.moveTo(mark.end.x, mark.end.y);
  ctx.lineTo(mark.end.x - head * Math.cos(angle - Math.PI / 6), mark.end.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(mark.end.x - head * Math.cos(angle + Math.PI / 6), mark.end.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function CaptureEditor({ sessionId, initialImage, mode = 'feedback', onClose, onSend }: {
  sessionId: string;
  initialImage?: { src: string; label: string } | null;
  /** 'feedback' sends the marked-up image straight to the agent;
   *  'attach' hands it back to the composer as an attached photo. */
  mode?: 'feedback' | 'attach';
  onClose: () => void;
  onSend: (saved: { file: string; absolutePath: string }, note: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [shot, setShot] = useState<{ src: string; label: string } | null>(initialImage ?? null);
  const [tool, setTool] = useState<Mark['tool']>('pen');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [active, setActive] = useState<Mark | null>(null);
  const [note, setNote] = useState('');
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const imageEl = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (mode === 'attach') return; // the photo being marked up is the only image here
    function pasteImage(event: ClipboardEvent) {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        setShot({ src: reader.result, label: `pasted ${file.name || 'screenshot'}` });
        setMarks([]);
        setActive(null);
        setError('');
      };
      reader.onerror = () => setError('Could not read that pasted image.');
      reader.readAsDataURL(file);
    }
    window.addEventListener('paste', pasteImage);
    return () => window.removeEventListener('paste', pasteImage);
  }, [mode]);

  function redraw(extra: Mark | null = active) {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !canvas.current) return;
    ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
    for (const mark of marks) drawMark(ctx, mark);
    if (extra) drawMark(ctx, extra);
  }

  useEffect(() => { redraw(); }, [marks, active]);

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * event.currentTarget.width / rect.width,
      y: (event.clientY - rect.top) * event.currentTarget.height / rect.height,
    };
  }

  async function capture() {
    setBusy(true);
    setError('');
    try {
      const result = await api.screenshot(sessionId, url.trim() || undefined);
      setShot({ src: feedbackUrl(sessionId, result.file), label: result.url });
      setUrl(result.url);
      setMarks([]);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  async function submit() {
    const img = imageEl.current;
    const overlay = canvas.current;
    if (!img || !overlay) return;
    setBusy(true);
    setError('');
    try {
      const output = document.createElement('canvas');
      output.width = overlay.width;
      output.height = overlay.height;
      const ctx = output.getContext('2d')!;
      ctx.drawImage(img, 0, 0, output.width, output.height);
      ctx.drawImage(overlay, 0, 0);
      const saved = await api.saveAnnotation(sessionId, output.toDataURL('image/png'));
      onSend(saved, note.trim());
      onClose();
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="capture-backdrop" role="dialog" aria-modal="true" aria-label="Capture and annotate UI">
      <section className="capture-dialog">
        <header className="capture-header">
          <div>
            <h2 className="hand">{mode === 'attach' ? 'mark up this photo' : initialImage ? 'review & mark up' : 'paste & mark up'}</h2>
            <div className="tiny faint">{mode === 'attach' ? 'draw on it, then keep it attached to your message' : initialImage ? 'zoom in, draw directly on the image, then send your feedback' : 'copy a screenshot, paste it here, then draw directly on it'}</div>
          </div>
          <button className="btn plain" onClick={onClose} aria-label="Close">×</button>
        </header>
        {!initialImage && mode === 'feedback' && <>
          <div className={`capture-paste${shot ? ' compact' : ''}`}>
            <span className="capture-paste-key">⌘V / Ctrl+V</span>
            <span className="hand">paste a screenshot anywhere in this window</span>
          </div>
          <div className="capture-or tiny faint"><span>or capture a running preview</span></div>
          <div className="capture-url-row">
            <label className="field grow"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="auto-detect preview, or paste http://…" /></label>
            <button className="btn small" onClick={capture} disabled={busy}>{busy && !shot ? 'capturing…' : shot ? 'recapture' : 'capture'}</button>
          </div>
        </>}
        {error && <div className="err">{error}</div>}
        {!shot && <div className="capture-empty hand">Paste an image to start giving feedback.</div>}
        {shot && (
          <>
            <div className="capture-tools" role="toolbar" aria-label="Drawing and zoom tools">
              {(['arrow', 'box', 'pen'] as const).map((item) => (
                <button key={item} className={`capture-tool${tool === item ? ' active' : ''}`} onClick={() => setTool(item)}>{item}</button>
              ))}
              <span className="grow" />
              <button className="capture-tool" onClick={() => setMarks((current) => current.slice(0, -1))} disabled={!marks.length}>undo</button>
              <button className="capture-tool" onClick={() => setMarks([])} disabled={!marks.length}>clear</button>
              <span className="capture-tool-divider" />
              <button className="capture-tool" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.5, value - .25))}>−</button>
              <button className="capture-tool zoom-readout" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button className="capture-tool" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + .25))}>+</button>
            </div>
            <div className="capture-stage-scroll">
              <div className="capture-stage" style={{ width: `${zoom * 100}%` }}>
                <img
                  ref={imageEl}
                  src={shot.src}
                  alt={shot.label}
                  onLoad={(event) => {
                    if (!canvas.current) return;
                    canvas.current.width = event.currentTarget.naturalWidth;
                    canvas.current.height = event.currentTarget.naturalHeight;
                    redraw(null);
                  }}
                />
                <canvas
                  ref={canvas}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const start = point(event);
                    setActive(tool === 'pen' ? { tool, points: [start] } : { tool, start, end: start });
                  }}
                  onPointerMove={(event) => {
                    if (!active) return;
                    const next = point(event);
                    setActive(active.tool === 'pen'
                      ? { ...active, points: [...active.points, next] }
                      : { ...active, end: next });
                  }}
                  onPointerUp={() => {
                    if (active) setMarks((current) => [...current, active]);
                    setActive(null);
                  }}
                />
              </div>
            </div>
            {mode === 'feedback' && (
              <label className="field capture-note"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note: what should change?" /></label>
            )}
            <footer className="capture-actions">
              <span className="tiny faint truncate">{shot.label}</span>
              <button className="btn fill" onClick={submit} disabled={busy}>
                {busy ? 'saving…' : mode === 'attach' ? 'keep markup' : 'send feedback'}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

/* ---------------- photos attached to a prompt ---------------- */

type Photo = {
  key: string;
  name: string;
  /** What the thumbnail shows: a local object URL, or the saved file once marked up. */
  src: string;
  local: boolean;
  /** Where the agent will find it, once the server has written it down. */
  path: string | null;
  state: 'saving' | 'ready' | 'error';
};

const readDataUrl = (file: File) => new Promise<string>((done, fail) => {
  const reader = new FileReader();
  reader.onload = () => (typeof reader.result === 'string' ? done(reader.result) : fail(new Error('could not read that image')));
  reader.onerror = () => fail(new Error('could not read that image'));
  reader.readAsDataURL(file);
});

const freePreview = (photo: Photo) => { if (photo.local) URL.revokeObjectURL(photo.src); };

/** Photos already on disk, spotted in a prompt so the transcript can show them. */
const photosInText = (text: string) => [...new Set(
  [...text.matchAll(/\.kasan\/feedback\/([\w.-]+\.(?:png|jpg|jpeg|webp|gif))/g)].map((m) => m[1]),
)];

/* ---------------- the screen ---------------- */

function SessionRail({ current, onOpen }: { current: Session | null; onOpen: (id: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.sessions().then((next) => {
      if (alive) {
        setSessions(next
          .filter((s) => s.id !== current?.id)
          .sort((a, b) => Number(b.status === 'working') - Number(a.status === 'working') || b.updatedAt - a.updatedAt));
      }
    }).catch(() => {});
    load();
    const timer = window.setInterval(load, 3000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current?.id]);

  async function makeSibling() {
    if (!current || making) return;
    setMaking(true);
    try {
      const next = await api.create({
        cwd: current.cwd,
        title: '',
        agent: current.agent,
        trust: current.trust,
        model: current.model ?? undefined,
      });
      onOpen(next.id);
    } catch (error) {
      window.alert(`Could not create the session: ${(error as Error).message}`);
      setMaking(false);
    }
  }

  return (
    <aside className="session-rail" aria-label="Other sessions">
      <div className="session-rail-label">recent sessions</div>
      <div className="session-rail-list">
        {sessions.map((s) => (
          <div className="session-rail-item" key={s.id}>
            <button
              className="session-rail-open"
              onClick={() => onOpen(s.id)}
              title={`${s.title} — ${s.status}`}
              aria-label={`Open ${s.title}, ${s.status}`}
            >
              <Dot status={s.status} />
              <span className="session-rail-copy">
                <span className="session-rail-title">{s.title}</span>
                <span className="session-rail-status">
                  {s.status === 'working' ? 'working…' : s.status === 'error' ? 'needs attention' : ago(s.updatedAt)}
                </span>
              </span>
            </button>
            <button
              className="session-rail-remove"
              disabled={removing === s.id}
              title={`Delete ${s.title}`}
              aria-label={`Delete ${s.title}`}
              onClick={async () => {
                setRemoving(s.id);
                try {
                  await api.remove(s.id);
                  setSessions((list) => list.filter((item) => item.id !== s.id));
                } catch (error) {
                  window.alert(`Could not delete the session: ${(error as Error).message}`);
                } finally {
                  setRemoving(null);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="session-rail-new"
        disabled={!current || making}
        onClick={makeSibling}
        title={current ? `New session in ${shortPath(current.cwd)} using ${current.model ?? current.agent}` : 'New session'}
        aria-label="New session with the same directory and model"
      >
        <span aria-hidden="true">+</span>
        <span className="session-rail-new-copy">new</span>
      </button>
    </aside>
  );
}

export function SessionView({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<KEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const [switching, setSwitching] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSeed, setCaptureSeed] = useState<{ src: string; label: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);
  const historyIndex = useRef<number | null>(null);
  const historyDraft = useRef('');
  const modelMenu = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);

  useEffect(() => {
    if (!session?.agent) return;
    api.models(session.agent).then(setModels).catch(() => {});
  }, [session?.agent]);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(session?.title ?? '');
  }, [session?.title, editingTitle]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!modelMenu.current?.contains(event.target as Node)) setModelMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [modelMenuOpen]);

  /* --- attached photos belong to one session; let their previews go --- */
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    photosRef.current.forEach(freePreview);
    photosRef.current = [];
  }, [id]);

  /* --- socket, with reconnect --- */
  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: number;

    setSession(null);
    setEvents([]);
    setErr('');

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

  const artifactChoices = useMemo(() => {
    const choices = new Map<string, string[]>();
    for (const event of events) {
      if (event.kind === 'artifact_choice') choices.set(event.batchId, event.ids);
    }
    return choices;
  }, [events]);

  const promptHistory = useMemo(
    () => events.filter((e) => e.kind === 'user').map((e) => String(e.text)),
    [events],
  );

  function recallPrompt(direction: -1 | 1) {
    if (promptHistory.length === 0) return;

    if (historyIndex.current === null) {
      if (direction > 0) return;
      historyDraft.current = draft;
      historyIndex.current = promptHistory.length - 1;
    } else {
      const next = historyIndex.current + direction;
      if (next < 0) return;
      if (next >= promptHistory.length) {
        historyIndex.current = null;
        setDraft(historyDraft.current);
        return;
      }
      historyIndex.current = next;
    }

    setDraft(promptHistory[historyIndex.current]);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  /* --- photos attached to the next prompt --- */

  async function keepPhoto(key: string, file: File) {
    try {
      const saved = await api.savePhoto(id, await readDataUrl(file));
      setPhotos((current) => current.map((photo) =>
        photo.key === key ? { ...photo, path: saved.absolutePath, state: 'ready' } : photo));
    } catch (error) {
      setPhotos((current) => current.map((photo) =>
        photo.key === key ? { ...photo, state: 'error' } : photo));
      setErr(`${file.name || 'photo'}: ${(error as Error).message}`);
    }
  }

  function addPhotos(files: ArrayLike<File> | null) {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    setErr('');
    const queued: Photo[] = images.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name || 'photo',
      src: URL.createObjectURL(file),
      local: true,
      path: null,
      state: 'saving',
    }));
    setPhotos((current) => [...current, ...queued]);
    queued.forEach((photo, index) => keepPhoto(photo.key, images[index]));
  }

  function dropPhoto(key: string) {
    setPhotos((current) => {
      const going = current.find((photo) => photo.key === key);
      if (going) freePreview(going);
      return current.filter((photo) => photo.key !== key);
    });
    if (editingPhoto === key) setEditingPhoto(null);
  }

  const uploading = photos.some((photo) => photo.state === 'saving');
  const attached = photos.filter((photo) => photo.path);

  function send() {
    const text = draft.trim();
    if ((!text && !attached.length) || !connected || uploading) return;
    const list = attached.map((photo) => `- ${photo.path}`).join('\n');
    const message = attached.length
      ? `${text}${text ? '\n\n' : ''}${attached.length > 1 ? 'Attached photos:' : 'Attached photo:'}\n${list}`
      : text;
    ws.current?.send(JSON.stringify({ t: 'prompt', text: message }));
    photos.forEach(freePreview);
    setPhotos([]);
    setDraft('');
    historyIndex.current = null;
    historyDraft.current = '';
    stick.current = true;
    if (box.current) box.current.style.height = 'auto';
  }

  function stop() {
    ws.current?.send(JSON.stringify({ t: 'stop' }));
  }

  const working = session?.status === 'working';
  const selectedModel = models.find((model) => model.id === session?.model);

  async function chooseModel(model: string) {
    if (!session || switching || session.model === model) {
      setModelMenuOpen(false);
      return;
    }
    setModelMenuOpen(false);
    setSwitching(true);
    try { setSession(await api.setModel(session.id, model)); }
    catch (error) { setErr((error as Error).message); }
    finally { setSwitching(false); }
  }

  async function saveTitle() {
    if (!session || savingTitle) return;
    const title = titleDraft.trim();
    setEditingTitle(false);
    if (!title || title === session.title) {
      setTitleDraft(session.title);
      return;
    }
    setSavingTitle(true);
    try { setSession(await api.rename(session.id, title)); }
    catch (error) {
      setTitleDraft(session.title);
      setErr((error as Error).message);
    } finally { setSavingTitle(false); }
  }

  return (
    <div ref={scroller} className="session-shell">
      <SessionRail current={session} onOpen={onOpen} />
      <main className="session-main">
      <div className="topbar" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--paper)' }}>
        <button className="btn plain topbar-back" onClick={onBack} aria-label="Back to sessions">←</button>
        <div className="session-heading">
          <div className="row">
            {session && <Dot status={session.status} />}
            {editingTitle ? (
              <input
                className="session-title-input"
                value={titleDraft}
                autoFocus
                aria-label="Session title"
                disabled={savingTitle}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={saveTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    setTitleDraft(session?.title ?? '');
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="session-title-button hand truncate"
                disabled={!session || savingTitle}
                title="Rename session"
                onClick={() => setEditingTitle(true)}
              >
                {session?.title ?? '…'}
              </button>
            )}
          </div>
          <div className="tiny faint truncate">{session ? shortPath(session.cwd) : ''}</div>
          {models.length > 0 && (
            <div className="model-menu-wrap" ref={modelMenu}>
              <button
                type="button"
                className="model-trigger"
                disabled={switching}
                aria-haspopup="listbox"
                aria-expanded={modelMenuOpen}
                title="Change model for the next message"
                onClick={() => setModelMenuOpen((open) => !open)}
              >
                <span>{selectedModel?.id ?? session?.model ?? 'model'}</span>
                <span className="model-caret">{modelMenuOpen ? '▴' : '▾'}</span>
              </button>
              {modelMenuOpen && (
                <div className="model-menu sketch" role="listbox" aria-label={`${session?.agent ?? ''} model`}>
                  {models.map((model) => {
                    const selected = model.id === selectedModel?.id;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`model-menu-item${selected ? ' selected' : ''}`}
                        key={model.id}
                        onClick={() => chooseModel(model.id)}
                      >
                        <span className="grow">
                          <span className="model-menu-title">{model.label}</span>
                          <span className="tiny faint">{model.hint}</span>
                        </span>
                        {selected && <span className="hand tiny">current</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="topbar-actions">
          {working && <button className="btn small" onClick={stop}>stop</button>}
        </div>
      </div>

      <div className="page" style={{ paddingTop: 0 }}>
        {!connected && (
          <div className="notice">reconnecting…</div>
        )}

        <div className="log">
          {events.map((e, i) => {
            switch (e.kind) {
              case 'user': {
                const sent = photosInText(String(e.text));
                return (
                  <div className="turn" key={i}>
                    <div className="who">you</div>
                    <div className="mine">{e.text}</div>
                    {sent.length > 0 && (
                      <div className="mine-photos">
                        {sent.map((file) => (
                          <img key={file} src={feedbackUrl(id, file)} alt="attached photo" loading="lazy" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
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
              case 'artifact_batch':
                return (
                  <ArtifactBatch
                    key={i}
                    ev={e}
                    sessionId={id}
                    disabled={Boolean(working)}
                    chosen={artifactChoices.get(e.batchId)}
                    onChoose={(batchId, ids) => {
                      ws.current?.send(JSON.stringify({ t: 'artifact_choice', batchId, ids }));
                      stick.current = true;
                    }}
                    onReview={(image) => {
                      setCaptureSeed(image);
                      setCaptureOpen(true);
                    }}
                  />
                );
              case 'artifact_choice':
                return null; // reflected in its artifact batch card
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

        <div
          className={`composer${dropping ? ' dropping' : ''}`}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            setDropping(false);
            addPhotos(event.dataTransfer.files);
          }}
        >
          <div className="composer-tools">
            <button type="button" className="capture-launch hand" onClick={() => fileInput.current?.click()}>
              photos
            </button>
            <button type="button" className="capture-launch hand" onClick={() => { setCaptureSeed(null); setCaptureOpen(true); }}>
              capture
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => { addPhotos(event.target.files); event.target.value = ''; }}
            />
          </div>
          {photos.length > 0 && (
            <div className="photo-strip" aria-label="Photos attached to this message">
              {photos.map((photo) => (
                <div className={`photo-chip${photo.state === 'error' ? ' bad' : ''}`} key={photo.key}>
                  <button
                    type="button"
                    className="photo-open"
                    disabled={photo.state !== 'ready'}
                    title={photo.state === 'ready' ? `${photo.name} — click to mark up` : photo.name}
                    onClick={() => setEditingPhoto(photo.key)}
                  >
                    <img src={photo.src} alt={photo.name} />
                    {photo.state !== 'ready' && (
                      <span className="photo-veil hand">{photo.state === 'saving' ? '…' : '!'}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="photo-remove hand"
                    aria-label={`Remove ${photo.name}`}
                    title="Remove"
                    onClick={() => dropPhoto(photo.key)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="photo-add hand" aria-label="Add more photos" onClick={() => fileInput.current?.click()}>+</button>
            </div>
          )}
          <div className="row">
            <label className="field grow">
              <textarea
                ref={box}
                rows={1}
                value={draft}
                placeholder={working ? 'add a note…' : photos.length ? 'what should it do with these?' : 'what should it do?'}
                onChange={(e) => {
                  setDraft(e.target.value);
                  historyIndex.current = null;
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onPaste={(event) => {
                  if (!Array.from(event.clipboardData.files).some((item) => item.type.startsWith('image/'))) return;
                  event.preventDefault();
                  addPhotos(event.clipboardData.files);
                }}
                onKeyDown={(e) => {
                  const el = e.currentTarget;
                  const beforeCaret = el.value.slice(0, el.selectionStart);
                  const afterCaret = el.value.slice(el.selectionEnd);
                  const onFirstLine = !beforeCaret.includes('\n');
                  const onLastLine = !afterCaret.includes('\n');
                  if (e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.metaKey && onFirstLine) {
                    e.preventDefault();
                    recallPrompt(-1);
                    return;
                  }
                  if (e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey && !e.metaKey && historyIndex.current !== null && onLastLine) {
                    e.preventDefault();
                    recallPrompt(1);
                    return;
                  }
                  // Enter sends on a real keyboard; phones get the button.
                  if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(hover: none)').matches) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
            </label>
            <button
              className="btn fill"
              onClick={send}
              disabled={(!draft.trim() && !attached.length) || !connected || uploading}
            >
              {uploading ? 'wait…' : 'send'}
            </button>
          </div>
        </div>
      </div>
      </main>
      {captureOpen && (
        <CaptureEditor
          sessionId={id}
          initialImage={captureSeed}
          onClose={() => { setCaptureOpen(false); setCaptureSeed(null); }}
          onSend={(saved, note) => {
            const text = `Review the annotated UI screenshot at ${saved.absolutePath}.${note ? ` Feedback: ${note}` : ' The red marks indicate what I want changed.'}`;
            ws.current?.send(JSON.stringify({ t: 'prompt', text }));
            stick.current = true;
          }}
        />
      )}
      {editingPhoto && (() => {
        const photo = photos.find((item) => item.key === editingPhoto);
        if (!photo) return null;
        return (
          <CaptureEditor
            sessionId={id}
            mode="attach"
            initialImage={{ src: photo.src, label: photo.name }}
            onClose={() => setEditingPhoto(null)}
            onSend={(saved) => {
              setPhotos((current) => current.map((item) => item.key === photo.key
                ? { ...item, src: feedbackUrl(id, saved.file), local: false, path: saved.absolutePath, state: 'ready' }
                : item));
              freePreview(photo);
              setEditingPhoto(null);
            }}
          />
        );
      })()}
    </div>
  );
}
