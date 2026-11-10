'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useDB, useHydrated, videoOf } from '@/lib/store';
import { AppProvider, useApp } from './app-context';
import { ChannelName } from './cards';
import { BottomNav, Guide, Masthead, type GuideMode } from './chrome';
import { GlobalDialogs } from './dialogs';
import { Player } from './player';
import { StoryComposer, StoryViewer } from './stories';
import { Icon, IconButton, ToastProvider, useIsMobile } from './ui';
import { PostComposer, UploadDialog } from './upload';

function useGuideMode(): GuideMode {
  const path = usePathname();
  const [w, setW] = useState(1440);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  if (w < 792) return 'none';
  if (path.startsWith('/watch') || path.startsWith('/studio')) return 'drawer';
  if (path.startsWith('/shorts')) return w >= 1312 ? 'mini' : 'drawer';
  return w >= 1312 ? 'full' : 'mini';
}

function ThemeSync() {
  const d = useDB();
  useEffect(() => {
    const apply = () => {
      const dark = d.user.theme === 'dark' || (d.user.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0f0f' : '#ffffff');
    };
    apply();
    const q = matchMedia('(prefers-color-scheme: dark)');
    q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, [d.user.theme]);
  return null;
}

function MiniPlayer() {
  const app = useApp();
  const d = useDB();
  const router = useRouter();
  const path = usePathname();
  const mobile = useIsMobile();
  const v = videoOf(d, app.mini?.videoId);
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (path.startsWith('/watch') || path.startsWith('/shorts')) app.setMini(null);
  }, [path, app]);
  if (!app.mini || !v) return null;
  const expand = () => {
    const id = v.id;
    app.setMini(null);
    router.push(`/watch?v=${id}&t=${Math.floor(time)}`);
  };
  return (
    <div className="miniplayer">
      <div className="mini-video">
        <Player v={v} compact startAt={app.mini.time} autoplay={app.mini.playing} onTime={setTime} hotkeys />
        <div className="mini-top">
          <IconButton icon="open_in_full" label="Expand" onClick={expand} />
          <IconButton icon="close" label="Close" onClick={() => app.setMini(null)} />
        </div>
      </div>
      <div className="mini-info" onClick={expand}>
        <div className="mini-title">{v.title}</div>
        <ChannelName channelId={v.channelId} />
      </div>
      {mobile && <IconButton icon="close" label="Close" onClick={() => app.setMini(null)} />}
    </div>
  );
}

function Overlays() {
  const app = useApp();
  const { dialog } = app;
  return (
    <>
      {dialog?.kind === 'upload' && <UploadDialog short={dialog.short} onClose={app.close} />}
      {dialog?.kind === 'post' && <PostComposer onClose={app.close} />}
      {dialog?.kind === 'story' && <StoryComposer onClose={app.close} />}
      {dialog && !['upload', 'post', 'story'].includes(dialog.kind) && <GlobalDialogs dialog={dialog} />}
      {app.story && <StoryViewer startChannel={app.story} onClose={app.closeStory} />}
    </>
  );
}

function GlobalKeys() {
  const app = useApp();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (e.key === '/') {
        const input = document.querySelector<HTMLInputElement>('.search-box input');
        if (input) { e.preventDefault(); input.focus(); }
      } else if (e.key === '?') app.open({ kind: 'shortcuts' });
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [app]);
  return null;
}

function Frame({ children }: { children: ReactNode }) {
  const mode = useGuideMode();
  const path = usePathname();
  const app = useApp();
  useEffect(() => { app.setDrawer(false); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`app mode-${mode} ${path.startsWith('/shorts') ? 'route-shorts' : ''} ${path.startsWith('/watch') ? 'route-watch' : ''} ${path.startsWith('/studio') ? 'route-studio' : ''}`}>
      <Masthead />
      <Guide mode={mode} />
      <main className="page">{children}</main>
      <BottomNav />
      <MiniPlayer />
      <Overlays />
      <GlobalKeys />
      <ThemeSync />
    </div>
  );
}

/** First paint (and the server render) shows skeletons; the app renders once local data is available. */
function Skeleton() {
  return (
    <div className="app mode-full">
      <header className="masthead"><div className="mh-start"><span className="icon-btn"><Icon name="menu" /></span><Link href="/" className="logo"><span className="logo-word">Vidora</span></Link></div></header>
      <main className="page">
        <div className="grid skeleton-grid">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="card skeleton"><div className="thumb" /><div className="card-meta"><span className="sk-avatar" /><div className="sk-lines"><span /><span /></div></div></div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useHydrated();
  if (!ready) return <Skeleton />;
  return (
    <ToastProvider>
      <AppProvider>
        <Suspense fallback={<Skeleton />}>
          <Frame>{children}</Frame>
        </Suspense>
      </AppProvider>
    </ToastProvider>
  );
}
