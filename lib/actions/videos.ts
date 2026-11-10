'use server';

import { id, Invalid, newId, oneOf, run, text, VISIBILITIES } from '@/lib/server/action';
import { getMe, rateLimit, requireMe } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { getVideo, playlistMembership } from '@/lib/server/queries';
import type { Visibility } from '@/lib/types';

function visible(videoId: string, viewer: string | null) {
  const v = getVideo(id(videoId), viewer);
  if (!v) throw new Invalid('This video isn’t available');
  return v;
}

/** Like (1), dislike (-1) or clear (0). Returns the new like count and rating. */
export async function rateVideo(videoId: string, value: -1 | 0 | 1) {
  return run(async () => {
    const me = await requireMe();
    visible(videoId, me.id);
    return tx(() => {
      const prev = (sql('SELECT value FROM video_ratings WHERE user_id = ? AND video_id = ?').get(me.id, videoId) as { value: number } | undefined)?.value ?? 0;
      if (prev === value) return { rating: prev, likes: (sql('SELECT likes FROM videos WHERE id = ?').get(videoId) as { likes: number }).likes };
      if (value === 0) sql('DELETE FROM video_ratings WHERE user_id = ? AND video_id = ?').run(me.id, videoId);
      else sql('INSERT INTO video_ratings (user_id, video_id, value) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value').run(me.id, videoId, value);
      const delta = (value === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      if (delta) sql('UPDATE videos SET likes = MAX(0, likes + ?) WHERE id = ?').run(delta, videoId);
      return { rating: value, likes: (sql('SELECT likes FROM videos WHERE id = ?').get(videoId) as { likes: number }).likes };
    });
  });
}

export async function toggleWatchLater(videoId: string, on?: boolean) {
  return run(async () => {
    const me = await requireMe();
    visible(videoId, me.id);
    const has = !!sql('SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?').get(me.id, videoId);
    const want = on ?? !has;
    if (want && !has) sql('INSERT INTO watch_later (user_id, video_id, added_at) VALUES (?, ?, ?)').run(me.id, videoId, Date.now());
    if (!want && has) sql('DELETE FROM watch_later WHERE user_id = ? AND video_id = ?').run(me.id, videoId);
    return want;
  });
}

/** Counts a view (at most once per viewer per video every 30 minutes) and adds it to history. */
export async function recordView(videoId: string, clientKey: string) {
  return run(async () => {
    const me = await getMe();
    const v = visible(videoId, me?.id ?? null);
    const key = `${me?.id ?? String(clientKey).slice(0, 40)}:${v.id}`;
    if (rateLimit(`view:${key}`, 1, 30 * 60_000)) sql('UPDATE videos SET views = views + 1 WHERE id = ?').run(v.id);
    if (me && !me.settings.historyPaused) {
      sql('INSERT INTO history (user_id, video_id, watched_at) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET watched_at = excluded.watched_at').run(me.id, v.id, Date.now());
    }
    return null;
  });
}

/** Saves the resume point and logs watch time for the creator's analytics. */
export async function saveProgress(videoId: string, position: number, watchedSeconds: number) {
  return run(async () => {
    const me = await getMe();
    const v = visible(videoId, me?.id ?? null);
    const pos = Math.max(0, Math.min(v.duration, Number(position) || 0));
    const secs = Math.max(0, Math.min(3600, Math.round(Number(watchedSeconds) || 0)));
    if (secs >= 1) sql('INSERT INTO view_events (video_id, at, seconds) VALUES (?, ?, ?)').run(v.id, Date.now(), secs);
    if (me && !me.settings.historyPaused) {
      sql('INSERT INTO history (user_id, video_id, watched_at, progress) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET progress = excluded.progress')
        .run(me.id, v.id, Date.now(), pos > v.duration - 5 ? 0 : pos);
    }
    return null;
  });
}

export async function removeFromHistory(videoId: string) {
  return run(async () => {
    const me = await requireMe();
    sql('DELETE FROM history WHERE user_id = ? AND video_id = ?').run(me.id, id(videoId));
    return null;
  });
}

export async function clearHistory() {
  return run(async () => {
    const me = await requireMe();
    sql('DELETE FROM history WHERE user_id = ?').run(me.id);
    return null;
  });
}

export async function hide(kind: 'video' | 'channel', target: string, on = true) {
  return run(async () => {
    const me = await requireMe();
    oneOf(kind, ['video', 'channel'], 'kind');
    if (on) sql('INSERT OR IGNORE INTO hidden (user_id, kind, target_id) VALUES (?, ?, ?)').run(me.id, kind, id(target));
    else sql('DELETE FROM hidden WHERE user_id = ? AND kind = ? AND target_id = ?').run(me.id, kind, id(target));
    return null;
  });
}

/* ---------------- playlists ---------------- */
function ownPlaylist(playlistId: string, owner: string) {
  const p = sql('SELECT owner_id FROM playlists WHERE id = ?').get(id(playlistId)) as { owner_id: string } | undefined;
  if (!p || p.owner_id !== owner) throw new Invalid('Playlist not found');
}

export async function getPlaylistMembership(videoId: string) {
  return run(async () => {
    const me = await requireMe();
    return playlistMembership(me.id, id(videoId));
  });
}

export async function setInPlaylist(playlistId: string, videoId: string, on: boolean) {
  return run(async () => {
    const me = await requireMe();
    if (playlistId === 'WL') return (await toggleWatchLater(videoId, on)).ok;
    ownPlaylist(playlistId, me.id);
    visible(videoId, me.id);
    if (on) sql('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, added_at) VALUES (?, ?, ?)').run(playlistId, videoId, Date.now());
    else sql('DELETE FROM playlist_items WHERE playlist_id = ? AND video_id = ?').run(playlistId, videoId);
    sql('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId);
    return on;
  });
}

export async function createPlaylist(title: string, visibility: Visibility, videoId?: string) {
  return run(async () => {
    const me = await requireMe();
    const count = (sql('SELECT COUNT(*) n FROM playlists WHERE owner_id = ?').get(me.id) as { n: number }).n;
    if (count >= 200) throw new Invalid('You have reached the playlist limit');
    const pid = newId('PL');
    sql('INSERT INTO playlists (id, owner_id, title, visibility, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(pid, me.id, text(title, 'Title', { min: 1, max: 150 }), oneOf(visibility, VISIBILITIES, 'visibility'), Date.now());
    if (videoId) {
      visible(videoId, me.id);
      sql('INSERT INTO playlist_items (playlist_id, video_id, added_at) VALUES (?, ?, ?)').run(pid, videoId, Date.now());
    }
    return pid;
  });
}

export async function updatePlaylist(playlistId: string, input: { title: string; description: string; visibility: Visibility }) {
  return run(async () => {
    const me = await requireMe();
    ownPlaylist(playlistId, me.id);
    sql('UPDATE playlists SET title = ?, description = ?, visibility = ?, updated_at = ? WHERE id = ?').run(
      text(input.title, 'Title', { min: 1, max: 150 }), text(input.description ?? '', 'Description', { max: 5000 }), oneOf(input.visibility, VISIBILITIES, 'visibility'), Date.now(), playlistId);
    return null;
  });
}

export async function deletePlaylist(playlistId: string) {
  return run(async () => {
    const me = await requireMe();
    ownPlaylist(playlistId, me.id);
    sql('DELETE FROM playlists WHERE id = ?').run(playlistId);
    return null;
  });
}

/** Removes from Watch later, Liked videos or one of the user's playlists. */
export async function removeFromList(listId: string, videoId: string) {
  return run(async () => {
    const me = await requireMe();
    if (listId === 'WL') sql('DELETE FROM watch_later WHERE user_id = ? AND video_id = ?').run(me.id, videoId);
    else if (listId === 'LL') return (await rateVideo(videoId, 0)).ok;
    else {
      ownPlaylist(listId, me.id);
      sql('DELETE FROM playlist_items WHERE playlist_id = ? AND video_id = ?').run(listId, videoId);
    }
    return true;
  });
}
