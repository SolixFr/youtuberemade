'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type DialogState =
  | { kind: 'upload'; short?: boolean }
  | { kind: 'post' }
  | { kind: 'story' }
  | { kind: 'share'; title: string; path: string; startAt?: number }
  | { kind: 'save'; videoId: string }
  | { kind: 'report'; what: string }
  | { kind: 'shortcuts' }
  | { kind: 'clip'; videoId: string; at: number };

export interface MiniState {
  videoId: string;
  time: number;
  playing: boolean;
}

interface AppApi {
  dialog: DialogState | null;
  open: (d: DialogState) => void;
  close: () => void;
  story: string | null;
  openStory: (channelId: string) => void;
  closeStory: () => void;
  mini: MiniState | null;
  setMini: (m: MiniState | null) => void;
  drawer: boolean;
  setDrawer: (v: boolean) => void;
  queue: string[];
  setQueue: (q: string[]) => void;
}

const Ctx = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [story, setStory] = useState<string | null>(null);
  const [mini, setMini] = useState<MiniState | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const open = useCallback((d: DialogState) => setDialog(d), []);
  const close = useCallback(() => setDialog(null), []);
  const openStory = useCallback((id: string) => setStory(id), []);
  const closeStory = useCallback(() => setStory(null), []);
  const api = useMemo(() => ({ dialog, open, close, story, openStory, closeStory, mini, setMini, drawer, setDrawer, queue, setQueue }), [dialog, open, close, story, openStory, closeStory, mini, drawer, queue]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
