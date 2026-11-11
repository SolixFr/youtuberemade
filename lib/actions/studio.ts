'use server';

import { revalidatePath } from 'next/cache';
import { id, Invalid, newId, oneOf, run, text, VISIBILITIES } from '@/lib/server/action';
import { requireMe } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { claimUpload, deleteUpload } from '@/lib/server/storage';
import type { Visibility } from '@/lib/types';

const TOPICS = ['Earth', 'The Sun', 'Rockets', 'Telescopes & Mars', 'Education', 'Science & Technology', 'People & Blogs', 'Film & Animation', 'Music', 'Gaming', 'Travel & Events'] as const;

export interface NewVideo {
  video: string;
  thumbnail: string;
  captions?: string | null;
  title: string;
  description: string;
  duration: number;
  short: boolean;
  topic: string;
  madeForKids: boolean;
  visibility: Visibility;
  publishAt?: number | null;
  playlistId?: string | null;
  shareToStory?: boolean;
  recordedLive?: boolean;
}

export async function createVideo(input: NewVideo) {
  return run(async () => {
    const me = await requireMe();
    const src = claimUpload(input.video, me.id, 'video');
    if (!src) throw new Invalid('The video upload is missing or expired. Upload it again.');
    const thumbnail = claimUpload(input.thumbnail, me.id, 'image');
    if (!thumbnail) throw new Invalid('Choose a thumbnail');
    const captions = input.captions ? claimUpload(input.captions, me.id, 'captions') : null;
    const now = Date.now();
    const publishAt = input.publishAt ? Number(input.publishAt) : now;
    if (!Number.isFinite(publishAt) || publishAt > now + 365 * 86_400_000) throw new Invalid('Choose a date within the next year');
    const videoId = newId('v');
    tx(() => {
      sql(`INSERT INTO videos (id, channel_id, type, title, description, duration, published_at, src, thumbnail, captions, visibility, topic, made_for_kids, recorded_live)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        videoId, me.id, input.short ? 'short' : 'video', text(input.title, 'Title', { min: 1, max: 100 }), text(input.description ?? '', 'Description', { max: 5000 }),
        Math.max(1, Math.min(43_200, Math.round(Number(input.duration) || 1))), Math.max(now, publishAt), src, thumbnail, captions,
        input.publishAt ? 'public' : oneOf(input.visibility, VISIBILITIES, 'visibility'), oneOf(input.topic, TOPICS, 'category'), input.madeForKids ? 1 : 0, input.recordedLive ? 1 : 0);
      if (input.playlistId) {
        const p = sql('SELECT 1 FROM playlists WHERE id = ? AND owner_id = ?').get(id(input.playlistId), me.id);
        if (p) sql('INSERT INTO playlist_items (playlist_id, video_id, added_at) VALUES (?, ?, ?)').run(input.playlistId, videoId, now);
      }
      if (input.shareToStory && input.visibility === 'public' && !input.publishAt && me.subscribers >= 10_000) {
        sql("INSERT INTO stories (id, channel_id, image, background, text, text_color, video_id, created_at) VALUES (?, ?, ?, '#000000', ?, '#ffffff', ?, ?)")
          .run(newId('st'), me.id, thumbnail, `New: ${input.title.slice(0, 100)}`, videoId, now);
      }
    });
    revalidatePath('/', 'layout');
    return { id: videoId, type: input.short ? 'short' : 'video' };
  });
}

function ownVideo(videoId: string, owner: string) {
  const v = sql('SELECT id, src, thumbnail, captions FROM videos WHERE id = ? AND channel_id = ?').get(id(videoId), owner) as { id: string; src: string; thumbnail: string; captions: string | null } | undefined;
  if (!v) throw new Invalid('Video not found');
  return v;
}

export async function updateVideo(videoId: string, input: { title: string; description: string; visibility: Visibility; thumbnail?: string | null; captions?: string | null }) {
  return run(async () => {
    const me = await requireMe();
    const v = ownVideo(videoId, me.id);
    const thumbnail = input.thumbnail ? claimUpload(input.thumbnail, me.id, 'image') ?? v.thumbnail : v.thumbnail;
    const captions = input.captions ? claimUpload(input.captions, me.id, 'captions') ?? v.captions : v.captions;
    sql('UPDATE videos SET title = ?, description = ?, visibility = ?, thumbnail = ?, captions = ? WHERE id = ?').run(
      text(input.title, 'Title', { min: 1, max: 100 }), text(input.description ?? '', 'Description', { max: 5000 }), oneOf(input.visibility, VISIBILITIES, 'visibility'), thumbnail, captions, v.id);
    if (thumbnail !== v.thumbnail) await deleteUpload(v.thumbnail);
    if (captions !== v.captions) await deleteUpload(v.captions);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function deleteVideo(videoId: string) {
  return run(async () => {
    const me = await requireMe();
    const v = ownVideo(videoId, me.id);
    sql('DELETE FROM videos WHERE id = ?').run(v.id);
    await Promise.all([deleteUpload(v.src), deleteUpload(v.thumbnail), deleteUpload(v.captions)]);
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Pickers in the upload dialog and post composer. */
export async function myPickers() {
  return run(async () => {
    const me = await requireMe();
    const playlists = (sql('SELECT p.id, p.title, COUNT(i.video_id) n FROM playlists p LEFT JOIN playlist_items i ON i.playlist_id = p.id WHERE p.owner_id = ? GROUP BY p.id ORDER BY p.updated_at DESC').all(me.id) as { id: string; title: string; n: number }[])
      .map((p) => ({ id: p.id, title: p.title, count: p.n }));
    const videos = sql("SELECT id, title, thumbnail FROM videos WHERE channel_id = ? AND visibility = 'public' ORDER BY published_at DESC LIMIT 100").all(me.id) as { id: string; title: string; thumbnail: string }[];
    return { playlists, videos };
  });
}
