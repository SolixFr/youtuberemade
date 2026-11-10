'use client';

import { update } from './store';
import type { BellLevel, DB } from './types';
import { uid } from './format';

const toggleIn = (arr: string[], id: string, on?: boolean): boolean => {
  const i = arr.indexOf(id);
  const want = on ?? i < 0;
  if (want && i < 0) arr.unshift(id);
  if (!want && i >= 0) arr.splice(i, 1);
  return want;
};

export function setSubscribed(channelId: string, on: boolean) {
  update((d) => {
    const was = d.user.subscriptions.includes(channelId);
    if (on === was) return;
    toggleIn(d.user.subscriptions, channelId, on);
    d.channels[channelId].subscribers += on ? 1 : -1;
    if (on) d.user.bells[channelId] = 'personalized';
    else delete d.user.bells[channelId];
  });
}

export function setBell(channelId: string, level: BellLevel) {
  update((d) => {
    d.user.bells[channelId] = level;
  });
}

/** Like/dislike are mutually exclusive, same as on the watch page and Shorts. */
export function rateVideo(videoId: string, kind: 'like' | 'dislike'): 'like' | 'dislike' | null {
  let result: 'like' | 'dislike' | null = null;
  update((d) => {
    const v = d.videos.find((x) => x.id === videoId);
    if (!v) return;
    const liked = d.user.liked.includes(videoId);
    const disliked = d.user.disliked.includes(videoId);
    if (liked) v.likes--;
    toggleIn(d.user.liked, videoId, false);
    toggleIn(d.user.disliked, videoId, false);
    if (kind === 'like' && !liked) {
      toggleIn(d.user.liked, videoId, true);
      v.likes++;
      result = 'like';
    }
    if (kind === 'dislike' && !disliked) {
      toggleIn(d.user.disliked, videoId, true);
      result = 'dislike';
    }
  });
  return result;
}

export function toggleWatchLater(videoId: string): boolean {
  let on = false;
  update((d) => {
    on = toggleIn(d.user.watchLater, videoId);
  });
  return on;
}

export function setInPlaylist(playlistId: string, videoId: string, on: boolean) {
  update((d) => {
    const p = d.playlists.find((x) => x.id === playlistId);
    if (!p) return;
    toggleIn(p.videoIds, videoId, on);
    p.updatedAt = Date.now();
  });
}

export function createPlaylist(title: string, visibility: DB['playlists'][number]['visibility'], videoId?: string): string {
  const id = uid('PL');
  update((d) => {
    d.playlists.unshift({ id, title, description: '', visibility, videoIds: videoId ? [videoId] : [], updatedAt: Date.now() });
  });
  return id;
}

export function recordWatch(videoId: string) {
  update((d) => {
    const v = d.videos.find((x) => x.id === videoId);
    if (v) v.views++;
    if (!d.user.historyPaused) {
      d.user.history = [{ videoId, at: Date.now() }, ...d.user.history.filter((h) => h.videoId !== videoId)].slice(0, 500);
    }
  });
}

/** Watch time is logged per video so Studio analytics charts real local activity, not made-up numbers. */
export function logWatchTime(videoId: string, seconds: number) {
  if (seconds < 1) return;
  update((d) => {
    d.user.viewLog.push({ videoId, at: Date.now(), seconds: Math.round(seconds) });
    if (d.user.viewLog.length > 5000) d.user.viewLog.splice(0, d.user.viewLog.length - 5000);
  });
}

export function saveProgress(videoId: string, seconds: number) {
  update((d) => {
    d.user.progress[videoId] = seconds;
  });
}

export function addSearch(q: string) {
  update((d) => {
    d.user.searchHistory = [q, ...d.user.searchHistory.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 20);
  });
}
