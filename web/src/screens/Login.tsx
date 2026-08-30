import { useState } from 'react';
import { api } from '../api.ts';
import { DoodlePearto } from '../components/Bits.tsx';

export function Login({ onIn }: { onIn: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api.login(passcode);
      onIn();
    } catch (e) {
      setErr((e as Error).message);
      setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: '14vh' }}>
      <div className="center" style={{ marginBottom: 26 }}>
        <div style={{ opacity: 0.9 }}><DoodlePearto /></div>
        <div className="wordmark" style={{ marginTop: 10 }}>kasan</div>
        <div className="muted tiny" style={{ marginTop: 8 }}>a quiet control room for coding agents</div>
      </div>

      <form onSubmit={submit} className="stack" style={{ maxWidth: 320, margin: '0 auto' }}>
        <label className="field">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="passcode"
            autoFocus
            autoComplete="current-password"
            aria-label="passcode"
          />
        </label>
        {err && <div className="err center">{err}</div>}
        <button className="btn fill" type="submit" disabled={busy || !passcode}>
          {busy ? 'checking…' : 'come in'}
        </button>
      </form>
    </div>
  );
}
