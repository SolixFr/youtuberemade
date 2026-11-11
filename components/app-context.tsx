'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { badgeCounts } from '@/lib/actions/account';
import type { Me } from '@/lib/types';

export type DialogState =
  | { kind: 'upload'; short?: boolean }
  | { kind: 'post' }
  | { kind: 'story' }
  | { kind: 'share'; title: string; path: string; startAt?: number }
  | { kind: 'save'; videoId: string }
  | { kind: 'report'; what: string; targetId: string }
  | { kind: 'shortcuts' }
  | { kind: 'clip'; videoId: string; at: number; duration: number; title: string }
  | { kind: 'signin'; reason: string };

export interface QueueItem { id: string; title: string }

export interface MiniState {
  videoId: string;
  title: string;
  channelName: string;
  src: string;
  captions: string | null;
  duration: number;
  time: number;
  playing: boolean;
}

interface AppApi {
  me: Me | null;
  dialog: DialogState | null;
  open: (d: DialogState) => void;
  close: () => void;
  /** Runs fn when signed in; otherwise shows the sign-in prompt with a reason. */
  requireAuth: (reason: string, fn: () => void) => void;
  story: string | null;
  openStory: (channelId: string) => void;
  closeStory: () => void;
  mini: MiniState | null;
  setMini: (m: MiniState | null) => void;
  drawer: boolean;
  setDrawer: (v: boolean) => void;
  /** Hamburger toggle: collapse the full guide into the icon-only rail. */
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;
}

const COLLAPSE_EVENT = 'vidora-guide-collapsed';
function subscribeCollapsed(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(COLLAPSE_EVENT, cb);
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(COLLAPSE_EVENT, cb); };
}
function readCollapsed(): boolean {
  try { return localStorage.getItem('vidora-guide-collapsed') === '1'; } catch { return false; }
}

const Ctx = createContext<AppApi | null>(null);

export function AppProvider({ me: initialMe, children }: { me: Me | null; children: ReactNode }) {
  // `me` starts as the server snapshot; a light poll keeps the subscriber count
  // fresh so gates (Stories etc.) reflect growth from the simulated audience.
  const [subscribers, setSubscribers] = useState(initialMe?.subscribers ?? 0);
  useEffect(() => {
    if (!initialMe) return;
    const poll = () => badgeCounts().then((r) => { if (r.ok) setSubscribers(r.data.subscribers); }).catch(() => {});
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, [initialMe]);
  const me = useMemo(() => (initialMe ? { ...initialMe, subscribers } : null), [initialMe, subscribers]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [mini, setMini] = useState<MiniState | null>(null);
  const [drawer, setDrawer] = useState(false);
  // Server renders the full guide; the stored preference is applied after hydration.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const setCollapsed = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(readCollapsed()) : v;
    try { localStorage.setItem('vidora-guide-collapsed', next ? '1' : '0'); } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const open = useCallback((d: DialogState) => setDialog(d), []);
  const close = useCallback(() => setDialog(null), []);
  const requireAuth = useCallback((reason: string, fn: () => void) => (me ? fn() : setDialog({ kind: 'signin', reason })), [me]);
  const api = useMemo<AppApi>(() => ({
    me, dialog, open, close, requireAuth, story, openStory: setStory, closeStory: () => setStory(null), mini, setMini, drawer, setDrawer, collapsed, setCollapsed, queue, setQueue,
  }), [me, dialog, open, close, requireAuth, story, mini, drawer, collapsed, setCollapsed, queue]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
