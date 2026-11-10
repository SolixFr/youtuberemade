'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Me } from '@/lib/types';
import { AppProvider, useApp } from './app-context';
import { BottomNav, Guide, Masthead, type GuideChannel, type GuideMode } from './chrome';
import { GlobalDialogs } from './dialogs';
import { Player } from './player';
import { StoryComposer, StoryViewer } from './stories';
import { IconButton, ToastProvider } from './ui';
import { PostComposer, UploadDialog } from './upload';

function subscribeResize(cb: () => void) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

function useGuideMode(): GuideMode {
  const path = usePathname();
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1440);
  if (width < 792) return 'none';
  if (path.startsWith('/watch') || path.startsWith('/studio') || path.startsWith('/messages')) return 'drawer';
  if (path.startsWith('/shorts')) return width >= 1312 ? 'mini' : 'drawer';
  return width >= 1312 ? 'full' : 'mini';
}

function MiniPlayer() {
  const app = useApp();
  const router = useRouter();
  const path = usePathname();
  const mini = app.mini;
  const [time, setTime] = useState(0);
  if (!mini || path.startsWith('/watch') || path.startsWith('/shorts')) return null;
  const expand = () => {
    app.setMini(null);
    router.push(`/watch?v=${mini.videoId}&t=${Math.floor(time || mini.time)}`);
  };
  return (
    <div className="miniplayer">
      <div className="mini-video">
        <Player video={{ id: mini.videoId, src: mini.src, captions: mini.captions, duration: mini.duration, description: '' }} compact startAt={mini.time} autoplay={mini.playing} onTime={setTime} hotkeys />
        <div className="mini-top">
          <IconButton icon="open_in_full" label="Expand" onClick={expand} />
          <IconButton icon="close" label="Close" onClick={() => app.setMini(null)} />
        </div>
      </div>
      <button type="button" className="mini-info" onClick={expand}>
        <span className="mini-title">{mini.title}</span>
        <span className="muted small">{mini.channelName}</span>
      </button>
      <IconButton icon="close" label="Close" className="mobile-only" onClick={() => app.setMini(null)} />
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
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
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

function Frame({ children, subscriptions, badges }: { children: ReactNode; subscriptions: GuideChannel[]; badges: { notifications: number; messages: number } }) {
  const mode = useGuideMode();
  const path = usePathname();
  const app = useApp();
  const route = path.split('/')[1] || 'home';
  const { setDrawer } = app;
  useEffect(() => setDrawer(false), [path, setDrawer]); // close the drawer on navigation
  return (
    <div className={`app mode-${mode} route-${route}`}>
      <a href="#main" className="skip-link">Skip to content</a>
      <Masthead badges={badges} />
      <Guide mode={mode} subscriptions={subscriptions} />
      <main className="page" id="main">{children}</main>
      <BottomNav />
      <MiniPlayer />
      <Overlays />
      <GlobalKeys />
    </div>
  );
}

export function AppShell({ me, subscriptions, badges, children }: { me: Me | null; subscriptions: GuideChannel[]; badges: { notifications: number; messages: number }; children: ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider me={me}>
        <Suspense>
          <Frame subscriptions={subscriptions} badges={badges}>{children}</Frame>
        </Suspense>
      </AppProvider>
    </ToastProvider>
  );
}
