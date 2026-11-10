'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Me } from '@/lib/types';

export type DialogState =
  | { kind: 'upload'; short?: boolean }
  | { kind: 'post' }
  | { kind: 'story' }
  | { kind: 'share'; title: string; path: string; startAt?: number }
  | { kind: 'save'; videoId: string }
  | { kind: 'report'; what: string }
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
  queue: QueueItem[];
  setQueue: (q: QueueItem[]) => void;
}

const Ctx = createContext<AppApi | null>(null);

export function AppProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [mini, setMini] = useState<MiniState | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const open = useCallback((d: DialogState) => setDialog(d), []);
  const close = useCallback(() => setDialog(null), []);
  const requireAuth = useCallback((reason: string, fn: () => void) => (me ? fn() : setDialog({ kind: 'signin', reason })), [me]);
  const api = useMemo<AppApi>(() => ({
    me, dialog, open, close, requireAuth, story, openStory: setStory, closeStory: () => setStory(null), mini, setMini, drawer, setDrawer, queue, setQueue,
  }), [me, dialog, open, close, requireAuth, story, mini, drawer, queue]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
