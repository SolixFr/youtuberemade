'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { buildSeed, DB_VERSION } from './seed';
import type { Channel, DB, Video } from './types';

const KEY = 'vidora-db';
let db: DB | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    // Unreadable or blocked storage: fall back to a fresh catalogue.
  }
  return buildSeed();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      console.warn('Could not save to localStorage', err);
    }
  }, 120);
}

export function getDB(): DB {
  if (!db) db = load();
  return db;
}

/** Mutate the database in place, then notify subscribers and persist. */
export function update(fn: (d: DB) => void): void {
  fn(getDB());
  version++;
  persist();
  listeners.forEach((l) => l());
}

export function resetDB(): void {
  db = buildSeed();
  localStorage.removeItem(KEY);
  version++;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Re-renders the calling component whenever the database changes. Client-only (rendered after hydration). */
export function useDB(): DB {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return getDB();
}

const noop = () => () => {};
/** true after hydration; false during the server render. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Current time, refreshed every 30 s so relative labels ("5 minutes ago") and schedules stay current. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function setDocumentTitle(title: string): void {
  document.title = title;
}

/* ---------- selectors ---------- */
export const channelOf = (d: DB, id: string): Channel | undefined => d.channels[id];
export const videoOf = (d: DB, id: string | null | undefined): Video | undefined => (id ? d.videos.find((v) => v.id === id) : undefined);
export const myChannel = (d: DB): Channel => d.channels.me;

/** Videos a viewer can find in feeds and search: public, already published, not hidden by the viewer. */
export function feedVideos(d: DB, now = Date.now()): Video[] {
  return d.videos.filter((v) => v.visibility === 'public' && v.publishedAt <= now && !d.user.hiddenVideos.includes(v.id) && !d.user.hiddenChannels.includes(v.channelId));
}

/** Whether the current viewer may open this video (owners can always watch their own). */
export function canWatch(v: Video, now = Date.now()): boolean {
  if (v.channelId === 'me') return true;
  return v.visibility !== 'private' && v.publishedAt <= now;
}

export const STORY_TTL = 7 * 86_400_000;
export const STORY_MIN_SUBS = 10_000;

export function activeStories(d: DB, now = Date.now()) {
  const byChannel = new Map<string, DB['stories']>();
  for (const s of d.stories) {
    const ch = d.channels[s.channelId];
    if (!ch || ch.subscribers < STORY_MIN_SUBS || now - s.createdAt > STORY_TTL) continue;
    byChannel.set(s.channelId, [...(byChannel.get(s.channelId) ?? []), s]);
  }
  return [...byChannel.entries()].map(([channelId, slides]) => ({ channelId, slides: slides.sort((a, b) => a.createdAt - b.createdAt) }));
}

export function hasUnseenStory(d: DB, channelId: string): boolean | null {
  const group = activeStories(d).find((g) => g.channelId === channelId);
  if (!group) return null;
  return group.slides.some((s) => !d.user.seenStories.includes(s.id));
}

/** Notifications are derived from real data: recent uploads, posts and stories from subscribed channels. */
export function notificationsFor(d: DB, now = Date.now()) {
  const subs = d.user.subscriptions.filter((id) => d.user.bells[id] !== 'none');
  const items: { id: string; channelId: string; text: string; href: string; thumbnail?: string; at: number }[] = [];
  for (const v of feedVideos(d, now)) {
    if (subs.includes(v.channelId) && now - v.publishedAt < 30 * 86_400_000) {
      items.push({ id: `n-v-${v.id}`, channelId: v.channelId, text: `${d.channels[v.channelId].name} uploaded: ${v.title}`, href: v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}`, thumbnail: v.thumbnail, at: v.publishedAt });
    }
  }
  for (const p of d.posts) {
    if (subs.includes(p.channelId) && now - p.createdAt < 30 * 86_400_000) {
      items.push({ id: `n-p-${p.id}`, channelId: p.channelId, text: `${d.channels[p.channelId].name} posted: ${p.text.slice(0, 80)}${p.text.length > 80 ? '…' : ''}`, href: `/post/${p.id}`, at: p.createdAt });
    }
  }
  for (const g of activeStories(d, now)) {
    if (subs.includes(g.channelId)) {
      const last = g.slides[g.slides.length - 1];
      items.push({ id: `n-s-${last.id}`, channelId: g.channelId, text: `${d.channels[g.channelId].name} added to their story`, href: `?story=${g.channelId}`, at: last.createdAt });
    }
  }
  return items.filter((n) => !d.user.dismissedNotifications.includes(n.id)).sort((a, b) => b.at - a.at);
}
