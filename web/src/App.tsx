import { useEffect, useState } from 'react';
import Auth from './views/Auth';
import Home from './views/Home';
import Timeline from './views/Timeline';
import Backfill from './views/Backfill';
import Me from './views/Me';
import { getTheme, restoreAuth } from './lib/pb';
import type { Family } from './lib/pb';

type Tab = 'home' | 'timeline' | 'backfill' | 'me';

export default function App() {
  const [session, setSession] = useState<{ userId: string; nickname: string; family: Family } | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  useEffect(() => {
    document.documentElement.dataset.theme = getTheme();
    restoreAuth().then((s) => { if (s) setSession(s); setReady(true); });
  }, []);

  if (!ready) {
    return <div className="splash"><div className="splash-logo">🍼</div><div>加载中…</div></div>;
  }

  if (!session) {
    return <Auth onDone={(s) => setSession(s)} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">🍼 Chengxi Baby Log</span>
        <span className="brand-sub">{session.family.babyNickname}</span>
      </header>
      <main className="main">
        {tab === 'home' && <Home family={session.family} userId={session.userId} nickname={session.nickname} onBackfill={() => setTab('backfill')} />}
        {tab === 'timeline' && <Timeline family={session.family} />}
        {tab === 'backfill' && <Backfill family={session.family} userId={session.userId} onDone={() => setTab('timeline')} />}
        {tab === 'me' && (
          <Me
            family={session.family} nickname={session.nickname}
            onFamilyChange={(f) => setSession({ ...session, family: f })}
            onLogout={() => { setSession(null); setTab('home'); }}
          />
        )}
      </main>
      <nav className="tabbar">
        {([['home', '🍼', '记录'], ['timeline', '📋', '时间线'], ['backfill', '✏️', '补录'], ['me', '👤', '我的']] as Array<[Tab, string, string]>).map(([k, emoji, label]) => (
          <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            <span className="tab-emoji">{emoji}</span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
