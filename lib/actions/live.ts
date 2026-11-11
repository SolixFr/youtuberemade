'use server';

import { revalidatePath } from 'next/cache';
import { id, Invalid, newId, run, text } from '@/lib/server/action';
import { requireMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';

export interface LiveMessage {
  id: number | string;
  author: string;
  text: string;
  kind: 'chat' | 'creator' | 'gift' | 'sub' | 'join';
  amountCents: number;
  at: number;
}

export interface LiveState {
  channelId: string;
  session: { id: string; videoId: string | null; startedAt: number; endedAt: number | null; title: string; views: number; likes: number; subsGained: number; joins: number; giftsCents: number; viewers: number };
  messages: LiveMessage[];
}

const toMessage = (m: { id: number | string; author_name: string; text: string; kind: string; amount_cents: number; at: number }): LiveMessage => ({
  id: m.id, author: m.author_name, text: m.text,
  kind: m.kind === 'creator' || m.kind === 'gift' || m.kind === 'sub' || m.kind === 'join' ? m.kind : 'chat',
  amountCents: m.amount_cents, at: m.at,
});

/** Start a live session: creates the (public) waiting-room video and the session itself, atomically. */
export async function startLive(input: { title?: string; description?: string }) {
  return run(async () => {
    const me = await requireMe();
    // Safety: auto-close anything open longer than 6 hours.
    const now = Date.now();
    sql('UPDATE live_sessions SET ended_at = ? WHERE ended_at IS NULL AND started_at < ?').run(now, now - 6 * 3_600_000);
    // If a live session is already open, return it (idempotent).
    const open = sql('SELECT id, video_id FROM live_sessions WHERE channel_id = ? AND ended_at IS NULL').get(me.id) as { id: string; video_id: string | null } | undefined;
    if (open) return { id: open.id, videoId: open.video_id ?? null };
    const rawTitle = text((input.title ?? '').trim(), 'Title', { max: 100 });
    // A public video row exists from the moment the stream goes live —
    // that's what makes it show up on the channel and in the feed like a real premiere.
    const videoId = newId('v');
    const sessionId = newId('lv');
    sql(`INSERT INTO videos (id, channel_id, type, title, description, duration, published_at, src, thumbnail, captions, visibility, topic, made_for_kids, recorded_live)
      VALUES (?, ?, 'video', ?, ?, 0, ?, '', ?, NULL, 'public', 'People & Blogs', 0, 1)`)
      .run(videoId, me.id, rawTitle || 'Live stream', text(input.description?.trim() ?? '', 'Description', { max: 5000 }) ?? '', now, me.avatar ?? '/favicon.svg');
    sql('INSERT INTO live_sessions (id, channel_id, started_at, title, video_id) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, me.id, now, rawTitle || 'Live stream', videoId);
    revalidatePath('/', 'layout');
    return { id: sessionId, videoId };
  });
}

/** End the live session. The video exists from the start — this marks the session over. */
export async function endLive(idInput: string) {
  return run(async () => {
    const me = await requireMe();
    const row = sql('SELECT id FROM live_sessions WHERE id = ? AND channel_id = ? AND ended_at IS NULL').get(id(idInput), me.id) as { id: string } | undefined;
    if (!row) throw new Invalid('No live session found for this stream');
    sql('UPDATE live_sessions SET ended_at = ? WHERE id = ?').run(Date.now(), row.id);
    return summary(row.id);
  });
}

function summary(sessionId: string) {
  const s = sql('SELECT views, likes, subs_gained, joins, gifts_cents FROM live_sessions WHERE id = ?').get(sessionId) as { views: number; likes: number; subs_gained: number; joins: number; gifts_cents: number };
  return { views: s.views, likes: s.likes, subscribers: s.subs_gained, joins: s.joins, giftsCents: s.gifts_cents };
}

/** After the recording is uploaded, fold the live numbers and the real src/duration into the waiting video. */
export async function attachLiveStats(idInput: string, input: { src: string; duration: number }) {
  return run(async () => {
    const me = await requireMe();
    const l = sql('SELECT video_id, views, likes FROM live_sessions WHERE id = ? AND channel_id = ?').get(id(idInput), me.id) as { video_id: string | null; views: number; likes: number } | undefined;
    if (!l || !l.video_id) throw new Invalid('No live session found for this stream');
    sql('UPDATE videos SET src = ?, duration = ?, views = ?, likes = ? WHERE id = ? AND channel_id = ?').run(input.src, Math.max(1, Math.round(input.duration)), l.views, l.likes, l.video_id, me.id);
    revalidatePath('/', 'layout');
    return null;
  });
}

/** Chat line. The creator posts as their channel; everyone else posts as themselves. */
export async function sendLiveMessage(idInput: string, body: string) {
  return run(async () => {
    const me = await requireMe();
    const row = sql('SELECT ls.id, ls.channel_id FROM live_sessions ls WHERE ls.id = ? AND ls.ended_at IS NULL').get(id(idInput)) as { id: string; channel_id: string } | undefined;
    if (!row) throw new Invalid('This stream isn’t live anymore');
    const clean = text(body, 'Message', { min: 1, max: 200 });
    const mine = row.channel_id === me.id;
    sql('INSERT INTO live_messages (session_id, author_name, text, kind, at) VALUES (?, ?, ?, ?, ?)').run(row.id, mine ? me.name : me.handle, clean, mine ? 'creator' : 'chat', Date.now());
    return null;
  });
}

type SessionRow = { id: string; channel_id: string; video_id: string | null; started_at: number; ended_at: number | null; title: string; views: number; likes: number; subs_gained: number; joins: number; gifts_cents: number; viewers: number };

/** The creator's on-air dashboard state. */
export async function liveState(idInput: string) {
  return run(async () => {
    const me = await requireMe();
    return state(sql('SELECT id, channel_id, video_id, started_at, ended_at, title, views, likes, subs_gained, joins, gifts_cents, viewers FROM live_sessions WHERE id = ? AND channel_id = ?').get(id(idInput), me.id) as SessionRow | undefined);
  });
}

/** Public watch-page state — no ownership required. */
export async function livePublicState(videoId: string) {
  return run(async () => {
    return state(sql('SELECT id, channel_id, video_id, started_at, ended_at, title, views, likes, subs_gained, joins, gifts_cents, viewers FROM live_sessions WHERE video_id = ?').get(id(videoId)) as SessionRow | undefined);
  });
}

function state(s: SessionRow | undefined): LiveState {
  if (!s) throw new Invalid('No live session found for this stream');
  const messages = sql('SELECT id, author_name, text, kind, amount_cents, at FROM live_messages WHERE session_id = ? ORDER BY id DESC LIMIT 60').all(s.id) as { id: number; author_name: string; text: string; kind: string; amount_cents: number; at: number }[];
  return {
    channelId: s.channel_id,
    session: { id: s.id, videoId: s.video_id, startedAt: s.started_at, endedAt: s.ended_at, title: s.title, views: s.views, likes: s.likes, subsGained: s.subs_gained, joins: s.joins, giftsCents: s.gifts_cents, viewers: s.viewers },
    messages: messages.reverse().map(toMessage),
  };
}
