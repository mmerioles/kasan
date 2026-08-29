import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { WobbleDefs } from './components/Bits.tsx';
import { Login } from './screens/Login.tsx';
import { Sessions } from './screens/Sessions.tsx';
import { NewSession } from './screens/NewSession.tsx';
import { SessionView } from './screens/SessionView.tsx';

/** Routes live in the hash so the back button works and links survive a reload. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return [hash, (h: string) => { location.hash = h; }] as const;
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [route, go] = useHash();

  useEffect(() => {
    api.me().then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
  }, []);

  let view;
  if (authed === null) {
    view = null; // a blank beat, rather than a flash of the wrong screen
  } else if (!authed) {
    view = <Login onIn={() => setAuthed(true)} />;
  } else if (route === '/new') {
    view = <NewSession onMade={(id) => go(`/s/${id}`)} onBack={() => go('/')} />;
  } else if (route.startsWith('/s/')) {
    view = <SessionView id={route.slice(3)} onBack={() => go('/')} />;
  } else {
    view = (
      <Sessions
        onOpen={(id) => go(`/s/${id}`)}
        onNew={() => go('/new')}
        onOut={() => { setAuthed(false); go('/'); }}
      />
    );
  }

  return (
    <>
      <WobbleDefs />
      {view}
    </>
  );
}
