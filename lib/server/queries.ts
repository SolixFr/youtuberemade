import 'server-only';
import { cache } from 'react';
import { sql } from './db';

import type {
  BellLevel, Channel, ChannelLite, Comment, Conversation, Message, Notification, PlaylistSummary, Post, PostComment,
  StoryGroup, StoryState, Video, ViewerVideoState, Visibility,
} from '@/lib/types';

export const STORY_TTL = 7 * 86_400_000;
const DAY = 86_400_000;
export const STORY_MIN_SUBS = 10_000;
const NOBODY = '';

/* ---------------- rows ---------------- */
interface UserRow { id: string; handle: string; name: string; avatar: string | null; verified: number; subscribers: number; description: string; banner: string | null; links: string; pronouns: string; created_at: number; password_hash: string | null }
interface VideoRow {
  id: string; channel_id: string; type: 'video' | 'short'; title: string; description: string; duration: number; views: number; likes: number;
  published_at: number; src: string; thumbnail: string; captions: string | null; visibility: Visibility; topic: string;
  credit_label: string | null; credit_url: string | null; recorded_live: number;
  c_handle: string; c_name: string; c_avatar: string | null; c_verified: number; c_subs: number; progress: number | null;
}

/** Story ring state for every channel with active stories, for one viewer. */
const storyStates = cache((viewer: string): Map<string, StoryState> => {
  const rows = sql(`SELECT s.channel_id, MIN(sv.story_id IS NOT NULL) AS all_seen FROM stories s
    JOIN users u ON u.id = s.channel_id
    LEFT JOIN story_views sv ON sv.story_id = s.id AND sv.user_id = ?
    WHERE s.created_at > ? AND u.subscribers >= ? GROUP BY s.channel_id`).all(viewer, Date.now() - STORY_TTL, STORY_MIN_SUBS) as { channel_id: string; all_seen: number }[];
  return new Map(rows.map((r) => [r.channel_id, r.all_seen ? 'seen' : 'unseen']));
});

export function membershipState(viewer: string | null | undefined, channelId: string) {
  if (!viewer) return null;
  const r = sql(`SELECT m.tier, t.name, t.price_cents, m.started_at FROM memberships m JOIN channel_tiers t ON t.channel_id = m.channel_id AND t.tier = m.tier WHERE m.user_id = ? AND m.channel_id = ?`).get(viewer, channelId) as { tier: number; name: string; price_cents: number; started_at: number } | undefined;
  return r ?? null;
}

/** True if the viewer may read members-only content published to this channel (owner or member). */
export function canSeeMembersOnly(viewerId: string | null | undefined, channelId: string): boolean {
  if (viewerId && viewerId === channelId) return true;
  return viewerId != null && !!membershipOf(viewerId, channelId);
}

export function channelTiers(channelId: string) {
  return (sql('SELECT tier, price_cents, name, perks FROM channel_tiers WHERE channel_id = ? ORDER BY tier').all(channelId) as { tier: number; price_cents: number; name: string; perks: string }[])
    .map((t) => ({ ...t, perks: JSON.parse(t.perks) as string[] }));
}

/** How many active members this channel has. */
export function memberCount(channelId: string): number {
  return (sql('SELECT COUNT(*) n FROM memberships WHERE channel_id = ?').get(channelId) as { n: number }).n;
}

/** Member badge the viewer holds on a channel; null for non-members. */
const membershipOf = cache((viewer: string | null | undefined, channelId: string) => viewer == null ? null : (sql(`SELECT m.tier, t.name FROM memberships m JOIN channel_tiers t ON t.channel_id = m.channel_id AND t.tier = m.tier WHERE m.user_id = ? AND m.channel_id = ?`).get(viewer, channelId) as { tier: number; name: string } | undefined) ?? null);

function lite(viewer: string, r: { id: string; handle: string; name: string; avatar: string | null; verified: number; subscribers: number }): ChannelLite {
  // Channels reach 50,000 subscribers earn the checkmark automatically.
  return { id: r.id, handle: r.handle, name: r.name, avatar: r.avatar, verified: !!r.verified || r.subscribers >= 50_000, subscribers: r.subscribers, story: storyStates(viewer).get(r.id) ?? null, membership: membershipOf(viewer, r.id) };
}

function toVideo(viewer: string, r: VideoRow): Video {
  const live = !!sql('SELECT 1 FROM live_sessions WHERE ended_at IS NULL AND video_id = ?').get(r.id);
  return {
    id: r.id, type: r.type, title: r.title, description: r.description, duration: r.duration, views: r.views, likes: r.likes,
    publishedAt: r.published_at, src: r.src, thumbnail: r.thumbnail, captions: r.captions, visibility: r.visibility, topic: r.topic,
    credit: r.credit_label && r.credit_url ? { label: r.credit_label, url: r.credit_url } : null, recordedLive: !!r.recorded_live,
    progress: r.progress ?? 0, live,
    channel: lite(viewer, { id: r.channel_id, handle: r.c_handle, name: r.c_name, avatar: r.c_avatar, verified: r.c_verified, subscribers: r.c_subs }),
  };
}

const VIDEO_SELECT = `SELECT v.*, u.handle c_handle, u.name c_name, u.avatar c_avatar, u.verified c_verified, u.subscribers c_subs, h.progress
  FROM videos v JOIN users u ON u.id = v.channel_id
  LEFT JOIN history h ON h.user_id = @viewer AND h.video_id = v.id`;
/** Public, already published, not hidden by the viewer. */
const FEED_WHERE = `v.visibility = 'public' AND v.published_at <= @now
  AND NOT EXISTS (SELECT 1 FROM hidden x WHERE x.user_id = @viewer AND ((x.kind = 'video' AND x.target_id = v.id) OR (x.kind = 'channel' AND x.target_id = v.channel_id)))`;

const vid = (viewer?: string | null) => viewer ?? NOBODY;

/* ---------------- videos ---------------- */
export function getVideo(id: string, viewer?: string | null): Video | null {
  const r = sql(`${VIDEO_SELECT} WHERE v.id = @id`).get({ id, viewer: vid(viewer) }) as VideoRow | undefined;
  if (!r) return null;
  const own = r.channel_id === viewer;
  if (!own && (r.visibility === 'private' || r.published_at > Date.now())) return null;
  return toVideo(vid(viewer), r);
}

export function viewerState(video: Video, viewer?: string | null): ViewerVideoState {
  if (!viewer) return { rating: 0, inWatchLater: false, subscribed: false, bell: 'personalized' };
  const rating = (sql('SELECT value FROM video_ratings WHERE user_id = ? AND video_id = ?').get(viewer, video.id) as { value: -1 | 1 } | undefined)?.value ?? 0;
  const wl = !!sql('SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?').get(viewer, video.id);
  const sub = sql('SELECT bell FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(viewer, video.channel.id) as { bell: BellLevel } | undefined;
  return { rating, inWatchLater: wl, subscribed: !!sub, bell: sub?.bell ?? 'personalized' };
}

export function feed(viewer: string | null | undefined, opts: { type?: 'video' | 'short'; topic?: string; order?: 'trending' | 'recent'; limit?: number; channels?: string[]; watched?: boolean; fresh?: boolean } = {}): Video[] {
  const where = [FEED_WHERE];
  const params: Record<string, unknown> = { viewer: vid(viewer), now: Date.now(), limit: opts.limit ?? 60 };
  if (opts.type) { where.push('v.type = @type'); params.type = opts.type; }
  if (opts.topic) { where.push('v.topic = @topic'); params.topic = opts.topic; }
  if (opts.channels) { where.push(`v.channel_id IN (SELECT value FROM json_each(@channels))`); params.channels = JSON.stringify(opts.channels); }
  if (opts.watched) where.push('h.video_id IS NOT NULL');
  if (opts.fresh) where.push('h.video_id IS NULL AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = @viewer AND s.channel_id = v.channel_id)');
  // Recency-weighted popularity: newer videos with traction float up.
  const order = opts.order === 'recent' ? 'v.published_at DESC' : 'v.views / pow((@now - v.published_at) / 3600000.0 + 2, 0.6) DESC';
  const rows = sql(`${VIDEO_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT @limit`).all(params) as VideoRow[];
  return rows.map((r) => toVideo(vid(viewer), r));
}

export function topics(): string[] {
  return (sql(`SELECT topic, COUNT(*) n FROM videos WHERE visibility = 'public' AND type = 'video' AND published_at <= ? GROUP BY topic ORDER BY n DESC, topic`).all(Date.now()) as { topic: string }[]).map((r) => r.topic);
}

export function related(video: Video, viewer?: string | null, limit = 20): Video[] {
  const rows = sql(`${VIDEO_SELECT} WHERE ${FEED_WHERE} AND v.id != @id AND v.type = 'video'
    ORDER BY (v.channel_id = @channel) * 2 + (v.topic = @topic) DESC, v.views DESC LIMIT @limit`)
    .all({ viewer: vid(viewer), now: Date.now(), id: video.id, channel: video.channel.id, topic: video.topic, limit }) as VideoRow[];
  return rows.map((r) => toVideo(vid(viewer), r));
}

export function videosByIds(ids: string[], viewer?: string | null): Video[] {
  if (!ids.length) return [];
  const rows = sql(`${VIDEO_SELECT} WHERE v.id IN (SELECT value FROM json_each(@ids)) AND (v.visibility != 'private' OR v.channel_id = @viewer)`)
    .all({ ids: JSON.stringify(ids), viewer: vid(viewer) }) as VideoRow[];
  const byId = new Map(rows.map((r) => [r.id, toVideo(vid(viewer), r)]));
  return ids.map((i) => byId.get(i)).filter((v): v is Video => !!v);
}

export function channelVideos(channelId: string, viewer?: string | null, type?: 'video' | 'short'): Video[] {
  const own = channelId === viewer;
  const rows = sql(`${VIDEO_SELECT} WHERE v.channel_id = @channel ${type ? 'AND v.type = @type' : ''}
    ${own ? '' : "AND v.visibility = 'public' AND v.published_at <= @now"} ORDER BY v.published_at DESC`)
    .all({ viewer: vid(viewer), channel: channelId, type, now: Date.now() }) as VideoRow[];
  return rows.map((r) => toVideo(vid(viewer), r));
}

export function searchVideos(q: string, viewer: string | null | undefined, f: { type?: string; date?: number; duration?: string; sort?: string }): Video[] {
  const terms = q.toLowerCase().replace(/^#/, '').split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return [];
  const params: Record<string, unknown> = { viewer: vid(viewer), now: Date.now() };
  const match = terms.map((t, i) => {
    params[`t${i}`] = `%${t.replace(/[%_\\]/g, '\\$&')}%`;
    return `(lower(v.title) LIKE @t${i} ESCAPE '\\' OR lower(v.description) LIKE @t${i} ESCAPE '\\' OR lower(u.name) LIKE @t${i} ESCAPE '\\' OR lower(v.topic) LIKE @t${i} ESCAPE '\\')`;
  });
  const titleScore = terms.map((_, i) => `(lower(v.title) LIKE @t${i} ESCAPE '\\')`).join(' + ');
  const where = [FEED_WHERE, ...match];
  if (f.type === 'video' || f.type === 'short') { where.push('v.type = @type'); params.type = f.type; }
  if (f.date) { where.push('v.published_at > @since'); params.since = Date.now() - f.date; }
  if (f.duration === 'short') where.push('v.duration < 60');
  if (f.duration === 'medium') where.push('v.duration BETWEEN 60 AND 120');
  if (f.duration === 'long') where.push('v.duration > 120');
  const order = f.sort === 'date' ? 'v.published_at DESC' : f.sort === 'views' ? 'v.views DESC' : `${titleScore} DESC, v.views DESC`;
  return (sql(`${VIDEO_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 50`).all(params) as VideoRow[]).map((r) => toVideo(vid(viewer), r));
}

export function suggestions(q: string, viewer?: string | null): string[] {
  const like = `%${q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
  const hist = viewer ? (sql(`SELECT query FROM search_history WHERE user_id = ? AND query LIKE ? ESCAPE '\\' ORDER BY at DESC LIMIT ?`).all(viewer, like, q ? 3 : 10) as { query: string }[]).map((r) => r.query) : [];
  if (!q) return hist;
  const titles = (sql(`SELECT lower(title) t FROM videos WHERE visibility = 'public' AND published_at <= ? AND lower(title) LIKE ? ESCAPE '\\' ORDER BY views DESC LIMIT 10`).all(Date.now(), like) as { t: string }[]).map((r) => r.t);
  return [...new Set([...hist, ...titles])].slice(0, 10);
}

/* ---------------- channels ---------------- */
function toChannel(viewer: string, r: UserRow): Channel {
  return { ...lite(viewer, r), description: r.description, banner: r.banner, links: JSON.parse(r.links), pronouns: r.pronouns, joinedAt: r.created_at, hasAccount: !!r.password_hash };
}

export function channelByHandle(handle: string, viewer?: string | null): Channel | null {
  const r = sql('SELECT * FROM users WHERE handle = ?').get(handle) as UserRow | undefined;
  return r ? toChannel(vid(viewer), r) : null;
}

export function channelById(id: string, viewer?: string | null): Channel | null {
  const r = sql('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return r ? toChannel(vid(viewer), r) : null;
}

export function searchChannels(q: string, viewer?: string | null): Channel[] {
  const like = `%${q.toLowerCase().replace(/^@/, '').replace(/[%_\\]/g, '\\$&')}%`;
  return (sql(`SELECT * FROM users WHERE lower(name) LIKE ? ESCAPE '\\' OR lower(handle) LIKE ? ESCAPE '\\' ORDER BY subscribers DESC LIMIT 10`).all(like, like) as UserRow[]).map((r) => toChannel(vid(viewer), r));
}

export function subscriptions(viewer: string): (Channel & { bell: BellLevel; latest: number | null })[] {
  const rows = sql(`SELECT u.*, s.bell, (SELECT MAX(published_at) FROM videos WHERE channel_id = u.id AND visibility = 'public') latest
    FROM subscriptions s JOIN users u ON u.id = s.channel_id WHERE s.user_id = ? ORDER BY s.created_at`).all(viewer) as (UserRow & { bell: BellLevel; latest: number | null })[];
  return rows.map((r) => ({ ...toChannel(viewer, r), bell: r.bell, latest: r.latest }));
}

export function subscriptionState(viewer: string | null | undefined, channelId: string): { subscribed: boolean; bell: BellLevel } {
  if (!viewer) return { subscribed: false, bell: 'personalized' };
  const r = sql('SELECT bell FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(viewer, channelId) as { bell: BellLevel } | undefined;
  return { subscribed: !!r, bell: r?.bell ?? 'personalized' };
}

/* ---------------- comments ---------------- */
interface CommentRow { id: string; video_id: string; parent_id: string | null; author_id: string | null; author_name: string | null; text: string; likes: number; pinned: number; hearted: number; edited: number; created_at: number; a_handle: string | null; a_name: string | null; a_avatar: string | null; a_verified: number | null; owner: string; my_vote: number | null; member_tier: number | null; member_name: string | null }
export function comments(videoId: string, viewer?: string | null): Comment[] {
  const rows = sql(`SELECT c.*, a.handle a_handle, a.name a_name, a.avatar a_avatar, a.verified a_verified, v.channel_id owner, cv.value my_vote,
      m.tier member_tier, t.name member_name
    FROM comments c JOIN videos v ON v.id = c.video_id
    LEFT JOIN users a ON a.id = c.author_id
    LEFT JOIN comment_votes cv ON cv.comment_id = c.id AND cv.user_id = @viewer
    LEFT JOIN memberships m ON m.user_id = c.author_id AND m.channel_id = v.channel_id
    LEFT JOIN channel_tiers t ON t.channel_id = m.channel_id AND t.tier = m.tier
    WHERE c.video_id = @video ORDER BY c.created_at`).all({ video: videoId, viewer: vid(viewer) }) as CommentRow[];
  return rows.map((r) => ({
    id: r.id, videoId: r.video_id, parentId: r.parent_id,
    author: { id: r.author_id, name: r.a_name ?? r.author_name ?? 'Unknown', handle: r.a_handle ?? r.author_name ?? '@unknown', avatar: r.a_avatar, verified: !!r.a_verified, membership: r.member_tier ? { tier: r.member_tier, name: r.member_name ?? 'Supporter' } : null },
    byCreator: r.author_id === r.owner, mine: !!viewer && r.author_id === viewer,
    text: r.text, likes: r.likes, myVote: (r.my_vote ?? 0) as -1 | 0 | 1, pinned: !!r.pinned, hearted: !!r.hearted, edited: !!r.edited, createdAt: r.created_at,
  }));
}

export function commentCount(videoId: string): number {
  return (sql('SELECT COUNT(*) n FROM comments WHERE video_id = ?').get(videoId) as { n: number }).n;
}

/* ---------------- posts ---------------- */
interface PostRow { id: string; channel_id: string; text: string; image: string | null; video_id: string | null; members_only: number; likes: number; created_at: number; handle: string; name: string; avatar: string | null; verified: number; subscribers: number; liked: number; my_vote: number | null; n_comments: number }
export function posts(viewer: string | null | undefined, filter: { channel?: string; channels?: string[]; id?: string; q?: string; limit?: number }): Post[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { viewer: vid(viewer), limit: filter.limit ?? 50 };
  if (filter.channel) { where.push('p.channel_id = @channel'); params.channel = filter.channel; }
  if (filter.channels) { where.push('p.channel_id IN (SELECT value FROM json_each(@channels))'); params.channels = JSON.stringify(filter.channels); }
  if (filter.id) { where.push('p.id = @id'); params.id = filter.id; }
  if (filter.q) { where.push("lower(p.text) LIKE @q ESCAPE '\\'"); params.q = `%${filter.q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`; }
  const rows = sql(`SELECT p.*, u.handle, u.name, u.avatar, u.verified, u.subscribers,
      EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = @viewer) liked,
      (SELECT idx FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = @viewer) my_vote,
      (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) n_comments
    FROM posts p JOIN users u ON u.id = p.channel_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC LIMIT @limit`).all(params) as PostRow[];
  return rows.map((r) => {
    // Members-only posts are redacted for anyone who isn't the owner or a member.
    if (r.members_only && !canSeeMembersOnly(viewer, r.channel_id)) {
      return {
        id: r.id, channel: lite(vid(viewer), { id: r.channel_id, handle: r.handle, name: r.name, avatar: r.avatar, verified: r.verified, subscribers: r.subscribers }),
        text: '', image: null, video: null, poll: null, myVote: null, likes: r.likes, liked: false, comments: r.n_comments,
        createdAt: r.created_at, membersOnly: true, locked: true,
      };
    }
    const poll = sql('SELECT text, votes FROM poll_options WHERE post_id = ? ORDER BY idx').all(r.id) as { text: string; votes: number }[];
    return {
      id: r.id, channel: lite(vid(viewer), { id: r.channel_id, handle: r.handle, name: r.name, avatar: r.avatar, verified: r.verified, subscribers: r.subscribers }),
      text: r.text, image: r.image, video: r.video_id ? getVideo(r.video_id, viewer) : null, poll: poll.length ? poll : null,
      myVote: r.my_vote, likes: r.likes, liked: !!r.liked, comments: r.n_comments, createdAt: r.created_at, membersOnly: !!r.members_only,
    };
  });
}

export function postComments(postId: string, viewer?: string | null): PostComment[] {
  return (sql(`SELECT pc.id, pc.text, pc.created_at, pc.author_id, p.channel_id, p.members_only, u.name, u.handle, u.avatar, m.tier member_tier, t.name member_name
    FROM post_comments pc JOIN posts p ON p.id = pc.post_id JOIN users u ON u.id = pc.author_id
    LEFT JOIN memberships m ON m.user_id = pc.author_id AND m.channel_id = p.channel_id
    LEFT JOIN channel_tiers t ON t.channel_id = m.channel_id AND t.tier = m.tier
    WHERE pc.post_id = ? ORDER BY pc.created_at DESC`).all(postId) as { id: string; text: string; created_at: number; author_id: string; channel_id: string; members_only: number; name: string; handle: string; avatar: string | null; member_tier: number | null; member_name: string | null }[])
    .filter((r) => !r.members_only || canSeeMembersOnly(viewer, r.channel_id))
    .map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at, mine: r.author_id === viewer, author: { name: r.name, handle: r.handle, avatar: r.avatar, membership: r.member_tier ? { tier: r.member_tier, name: r.member_name ?? 'Supporter' } : null } }));
}

/* ---------------- stories ---------------- */
export function storyGroups(viewer: string | null | undefined, channelIds?: string[]): StoryGroup[] {
  const params: Record<string, unknown> = { viewer: vid(viewer), since: Date.now() - STORY_TTL, min: STORY_MIN_SUBS };
  let filter = '';
  if (channelIds) { filter = 'AND s.channel_id IN (SELECT value FROM json_each(@ids))'; params.ids = JSON.stringify(channelIds); }
  const rows = sql(`SELECT s.*, u.handle, u.name, u.avatar, u.verified, u.subscribers, sv.story_id seen, sv.liked,
      v.title v_title, v.type v_type, v.visibility v_vis, v.published_at v_pub
    FROM stories s JOIN users u ON u.id = s.channel_id
    LEFT JOIN story_views sv ON sv.story_id = s.id AND sv.user_id = @viewer
    LEFT JOIN videos v ON v.id = s.video_id
    WHERE s.created_at > @since AND u.subscribers >= @min ${filter} ORDER BY s.created_at`).all(params) as {
      id: string; channel_id: string; image: string | null; background: string; text: string; text_color: string; text_pos: string | null; views: number; likes: number; video_id: string | null; created_at: number;
      handle: string; name: string; avatar: string | null; verified: number; subscribers: number; seen: string | null; liked: number | null;
      v_title: string | null; v_type: 'video' | 'short' | null; v_vis: string | null; v_pub: number | null;
    }[];
  const groups = new Map<string, StoryGroup>();
  for (const r of rows) {
    const g = groups.get(r.channel_id) ?? { channel: lite(vid(viewer), { id: r.channel_id, handle: r.handle, name: r.name, avatar: r.avatar, verified: r.verified, subscribers: r.subscribers }), slides: [] };
    const linkOk = r.video_id && r.v_vis === 'public' && (r.v_pub ?? 0) <= Date.now();
    g.slides.push({ id: r.id, image: r.image, background: r.background, text: r.text, textColor: r.text_color, textPos: r.text_pos ?? 'middle-center', views: r.views, likes: r.likes, createdAt: r.created_at, seen: !!r.seen, liked: !!r.liked,
      video: linkOk ? { id: r.video_id!, title: r.v_title!, type: r.v_type! } : null });
    groups.set(r.channel_id, g);
  }
  return [...groups.values()];
}

/** Stories for the shelf: your own plus channels you subscribe to (or everyone when signed out). */
export function storyShelf(viewer: string | null | undefined): StoryGroup[] {
  const ids = viewer ? [viewer, ...(sql('SELECT channel_id FROM subscriptions WHERE user_id = ?').all(viewer) as { channel_id: string }[]).map((r) => r.channel_id)] : undefined;
  return storyGroups(viewer, ids).sort((a, b) => Number(b.channel.id === viewer) - Number(a.channel.id === viewer) || Number(b.channel.story === 'unseen') - Number(a.channel.story === 'unseen'));
}

/* ---------------- library ---------------- */
export function history(viewer: string): { video: Video; at: number }[] {
  const rows = sql(`${VIDEO_SELECT} WHERE h.user_id = @viewer AND (v.visibility != 'private' OR v.channel_id = @viewer) ORDER BY h.watched_at DESC LIMIT 300`).all({ viewer }) as (VideoRow & { watched_at: number })[];
  const at = new Map((sql('SELECT video_id, watched_at FROM history WHERE user_id = ?').all(viewer) as { video_id: string; watched_at: number }[]).map((r) => [r.video_id, r.watched_at]));
  return rows.map((r) => ({ video: toVideo(viewer, r), at: at.get(r.id) ?? 0 }));
}

export function watchLaterIds(viewer: string): string[] {
  return (sql('SELECT video_id FROM watch_later WHERE user_id = ? ORDER BY added_at DESC').all(viewer) as { video_id: string }[]).map((r) => r.video_id);
}
export function likedIds(viewer: string): string[] {
  return (sql('SELECT video_id FROM video_ratings WHERE user_id = ? AND value = 1 ORDER BY rowid DESC').all(viewer) as { video_id: string }[]).map((r) => r.video_id);
}

export function playlists(owner: string, publicOnly = false): PlaylistSummary[] {
  return (sql(`SELECT p.id, p.title, p.visibility, p.updated_at, COUNT(i.video_id) n,
      (SELECT v.thumbnail FROM playlist_items i2 JOIN videos v ON v.id = i2.video_id WHERE i2.playlist_id = p.id ORDER BY i2.added_at DESC LIMIT 1) thumb
    FROM playlists p LEFT JOIN playlist_items i ON i.playlist_id = p.id WHERE p.owner_id = ? ${publicOnly ? "AND p.visibility = 'public'" : ''}
    GROUP BY p.id ORDER BY p.updated_at DESC`).all(owner) as { id: string; title: string; visibility: Visibility; updated_at: number; n: number; thumb: string | null }[])
    .map((r) => ({ id: r.id, title: r.title, visibility: r.visibility, count: r.n, thumbnail: r.thumb, updatedAt: r.updated_at }));
}

export function playlist(id: string, viewer: string | null | undefined) {
  if (id === 'WL' || id === 'LL') {
    if (!viewer) return null;
    const ids = id === 'WL' ? watchLaterIds(viewer) : likedIds(viewer);
    return { id, title: id === 'WL' ? 'Watch later' : 'Liked videos', description: '', visibility: 'private' as Visibility, ownerId: viewer, updatedAt: null as number | null, videos: videosByIds(ids, viewer) };
  }
  const p = sql('SELECT * FROM playlists WHERE id = ?').get(id) as { id: string; owner_id: string; title: string; description: string; visibility: Visibility; updated_at: number } | undefined;
  if (!p || (p.visibility === 'private' && p.owner_id !== viewer)) return null;
  const ids = (sql('SELECT video_id FROM playlist_items WHERE playlist_id = ? ORDER BY added_at').all(id) as { video_id: string }[]).map((r) => r.video_id);
  return { id: p.id, title: p.title, description: p.description, visibility: p.visibility, ownerId: p.owner_id, updatedAt: p.updated_at, videos: videosByIds(ids, viewer) };
}

export function playlistMembership(viewer: string, videoId: string) {
  const lists = sql(`SELECT p.id, p.title, p.visibility, EXISTS (SELECT 1 FROM playlist_items i WHERE i.playlist_id = p.id AND i.video_id = ?) has
    FROM playlists p WHERE p.owner_id = ? ORDER BY p.updated_at DESC`).all(videoId, viewer) as { id: string; title: string; visibility: Visibility; has: number }[];
  const wl = !!sql('SELECT 1 FROM watch_later WHERE user_id = ? AND video_id = ?').get(viewer, videoId);
  return { watchLater: wl, lists: lists.map((l) => ({ ...l, has: !!l.has })) };
}

/* ---------------- notifications ----------------
   Subscribers hear about your uploads/posts/stories; you hear about new
   subscribers and comments on your videos. All state (read/dismissed) is
   derived against the stable per-item key. */
export function notifications(viewer: string): Notification[] {
  const since = Date.now() - 30 * 86_400_000;
  const state = new Map((sql('SELECT key, dismissed FROM notification_state WHERE user_id = ?').all(viewer) as { key: string; dismissed: number }[]).map((r) => [r.key, r.dismissed]));
  const subs = `SELECT channel_id FROM subscriptions WHERE user_id = @viewer AND bell != 'none'`;
  const out: Notification[] = [];
  const vids = sql(`${VIDEO_SELECT} WHERE ${FEED_WHERE} AND v.channel_id IN (${subs}) AND v.published_at > @since ORDER BY v.published_at DESC LIMIT 30`).all({ viewer, now: Date.now(), since }) as VideoRow[];
  for (const r of vids) {
    const v = toVideo(viewer, r);
    out.push({ key: `v:${v.id}`, kind: 'upload', channel: v.channel, text: `${v.channel.name} uploaded: ${v.title}`, href: v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}`, thumbnail: v.thumbnail, at: v.publishedAt, read: false });
  }
  for (const p of posts(viewer, { limit: 20 }).filter((p) => p.createdAt > since)) {
    const subscribed = sql(`SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ? AND bell != 'none'`).get(viewer, p.channel.id);
    if (subscribed) out.push({ key: `p:${p.id}`, kind: 'post', channel: p.channel, text: `${p.channel.name} posted: ${p.text.slice(0, 90)}${p.text.length > 90 ? '…' : ''}`, href: `/post/${p.id}`, thumbnail: p.image, at: p.createdAt, read: false });
  }
  const subIds = (sql(`SELECT channel_id FROM subscriptions WHERE user_id = ? AND bell != 'none'`).all(viewer) as { channel_id: string }[]).map((r) => r.channel_id);
  for (const g of storyGroups(viewer, subIds)) {
    const last = g.slides[g.slides.length - 1];
    out.push({ key: `s:${last.id}`, kind: 'story', channel: g.channel, text: `${g.channel.name} added to their story`, href: `story:${g.channel.id}`, thumbnail: last.image, at: last.createdAt, read: false });
  }
  // Activity on your own channel: new subscribers.
  const newSubs = sql(`SELECT u.id, u.handle, u.name, u.avatar, u.verified, u.subscribers, s.created_at at
    FROM subscriptions s JOIN users u ON u.id = s.user_id
    WHERE s.channel_id = @viewer AND s.created_at > @since ORDER BY s.created_at DESC LIMIT 20`).all({ viewer, since }) as { id: string; handle: string; name: string; avatar: string | null; verified: number; subscribers: number; at: number }[];
  for (const u of newSubs) {
    out.push({ key: `sub:${u.id}`, kind: 'sub', channel: lite(viewer, u), text: `${u.name} subscribed to your channel.`, href: `/${u.handle}`, thumbnail: null, at: u.at, read: false });
  }
  // …and comments (including simulated viewers) on your videos.
  const myComments = sql(`SELECT c.id, c.author_id, c.author_name, c.text, c.created_at at, c.video_id, v.title v_title, v.thumbnail v_thumb,
      cu.handle a_handle, cu.name a_name, cu.avatar a_avatar
    FROM comments c JOIN videos v ON v.id = c.video_id LEFT JOIN users cu ON cu.id = c.author_id
    WHERE v.channel_id = @viewer AND (c.author_id IS NULL OR c.author_id != @viewer) AND c.created_at > @since
    ORDER BY c.created_at DESC LIMIT 20`).all({ viewer, since }) as { id: string; author_id: string | null; author_name: string | null; text: string; at: number; video_id: string; v_title: string; v_thumb: string; a_handle: string | null; a_name: string | null; a_avatar: string | null }[];
  for (const c of myComments) {
    const name = c.a_name ?? c.author_name ?? 'Someone';
    const handle = c.a_handle ?? c.author_name ?? '';
    const ch = lite(viewer, { id: c.author_id ?? c.id, handle, name, avatar: c.a_avatar, verified: 0, subscribers: 0 });
    out.push({ key: `c:${c.id}`, kind: 'comment', channel: ch, text: `${name} commented on “${c.v_title}”: ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}`, href: `/watch?v=${c.video_id}`, thumbnail: c.v_thumb, at: c.at, read: false });
  }
  return out.filter((n) => state.get(n.key) !== 1).map((n) => ({ ...n, read: state.has(n.key) })).sort((a, b) => b.at - a.at);
}

/* ---------------- live ---------------- */
/** The channel's currently-running live session (with its waiting video), if any. */
export function activeLive(channelId: string) {
  return sql('SELECT id, video_id, title, started_at, viewers, views FROM live_sessions WHERE channel_id = ? AND ended_at IS NULL').get(channelId) as { id: string; video_id: string | null; title: string; started_at: number; viewers: number; views: number } | undefined;
}

/** The open live session for a specific video, if any (waiting room route — watch page replaces the player). */
export function liveSessionForVideo(videoId: string) {
  return sql('SELECT id, channel_id, ended_at, title, views, viewers FROM live_sessions WHERE video_id = ? AND ended_at IS NULL').get(videoId) as { id: string; channel_id: string; ended_at: number | null; title: string; views: number; viewers: number } | undefined;
}

/* ---------------- channel customization ---------------- */
const SECTION_KINDS = ['recent_uploads', 'popular_uploads', 'shorts', 'playlists', 'posts', 'members'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number] | `playlist:${string}`;
const DEFAULT_SECTIONS: SectionKind[] = ['recent_uploads', 'shorts', 'playlists', 'posts'];
const MAX_SECTIONS = 12;
const playlistToken = /^playlist:[\w-]{6,64}$/;

export interface ChannelConfig {
  contactEmail: string;
  trailerVideoId: string | null;
  featuredVideoId: string | null;
  watermark: string | null;
  watermarkDisplay: 'end' | 'custom' | 'full';
  watermarkStart: number;
  homeSections: SectionKind[];
}

export function sanitizeSections(input: unknown): SectionKind[] {
  if (!Array.isArray(input)) return DEFAULT_SECTIONS;
  const allowed = new Set<string>(SECTION_KINDS);
  const seen = new Set<string>();
  const out: SectionKind[] = [];
  for (const k of input) {
    if (typeof k !== 'string' || seen.has(k)) continue;
    if (allowed.has(k) || playlistToken.test(k)) { seen.add(k); out.push(k as SectionKind); }
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

/** The Layout/Branding/Basic info settings, for the Customization page and the homepage renderer. */
export function channelConfig(channelId: string): ChannelConfig {
  const r = sql('SELECT contact_email, trailer_video_id, featured_video_id, watermark, watermark_display, watermark_start, home_sections FROM users WHERE id = ?').get(channelId) as { contact_email: string; trailer_video_id: string | null; featured_video_id: string | null; watermark: string | null; watermark_display: string; watermark_start: number; home_sections: string | null };
  let homeSections: SectionKind[] = DEFAULT_SECTIONS;
  if (r.home_sections !== null) {
    try { homeSections = sanitizeSections(JSON.parse(r.home_sections)); } catch { /* keep defaults */ }
  }
  const wd = r.watermark_display === 'full' ? 'full' : r.watermark_display === 'custom' ? 'custom' : 'end';
  return { contactEmail: r.contact_email, trailerVideoId: r.trailer_video_id, featuredVideoId: r.featured_video_id, watermark: r.watermark, watermarkDisplay: wd, watermarkStart: Math.max(1, Math.min(3600, Math.floor(r.watermark_start) || 8)), homeSections };
}

/** A few member avatars for the Member recognition shelf (shown only with 8+ members). */
export function activeMembers(channelId: string, limit = 24) {
  return sql(`SELECT u.id, u.handle, u.name, u.avatar FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY RANDOM() LIMIT ?`).all(channelId, limit) as { id: string; handle: string; name: string; avatar: string | null }[];
}

/** The video watermark shown on a channel's videos, if set. */
export function watermarkOf(channelId: string): { src: string; display: 'end' | 'custom' | 'full'; start: number; channelName: string; handle: string } | null {
  const r = sql('SELECT watermark, watermark_display, watermark_start, name, handle FROM users WHERE id = ?').get(channelId) as { watermark: string | null; watermark_display: string; watermark_start: number; name: string; handle: string };
  if (!r.watermark) return null;
  const wd = r.watermark_display === 'full' ? 'full' : r.watermark_display === 'custom' ? 'custom' : 'end';
  return { src: r.watermark, display: wd, start: Math.max(1, Math.min(3600, Math.floor(r.watermark_start) || 8)), channelName: r.name, handle: r.handle };
}

/* ---------------- studio ---------------- */
export interface Monetization {
  subscribers: number;
  watchHours: number;
  shortsViews: number;
  uploads: number;
  memberships: boolean;
  partner: boolean;
  verified: boolean;
  shop: boolean;
  earnings: number;
}

/** Creator-program thresholds tuned for a reasonable pace:
    memberships at 500 subs + 3 recent uploads + 100 watch hours;
    partner at 1,000 subs + (250 watch hours or 250K shorts views);
    verified + shop at 50,000 subs. */
export function monetization(channelId: string): Monetization {
  const r = sql('SELECT subscribers, watch_seconds, earnings FROM users WHERE id = ?').get(channelId) as { subscribers: number; watch_seconds: number; earnings: number };
  const shortsViews = (sql(`SELECT COALESCE(SUM(views), 0) n FROM videos WHERE channel_id = ? AND type = 'short'`).get(channelId) as { n: number }).n;
  const uploads = (sql(`SELECT COUNT(*) n FROM videos WHERE channel_id = ? AND visibility = 'public' AND published_at > ?`).get(channelId, Date.now() - 90 * DAY) as { n: number }).n;
  const watchHours = r.watch_seconds / 3600;
  return {
    subscribers: r.subscribers,
    watchHours,
    shortsViews,
    uploads,
    memberships: r.subscribers >= 500 && uploads >= 3 && watchHours >= 100,
    partner: r.subscribers >= 1000 && (watchHours >= 250 || shortsViews >= 250_000),
    verified: !!r.subscribers && r.subscribers >= 50_000,
    shop: r.subscribers >= 50_000,
    earnings: r.earnings,
  };
}

export function analytics(channelId: string, days = 28) {
  const since = Date.now() - days * 86_400_000;
  const events = sql(`SELECT e.video_id, e.at, e.seconds FROM view_events e JOIN videos v ON v.id = e.video_id WHERE v.channel_id = ? AND e.at > ?`).all(channelId, since) as { video_id: string; at: number; seconds: number }[];
  return events;
}

export function studioComments(channelId: string, viewer: string) {
  const vids = channelVideos(channelId, viewer);
  return vids.flatMap((v) => comments(v.id, viewer).filter((c) => !c.parentId).map((c) => ({ comment: c, video: v, replies: 0 })))
    .sort((a, b) => b.comment.createdAt - a.comment.createdAt);
}

/* ---------------- shell ---------------- */
/** Sidebar subscriptions with a "new in the last week" dot, plus header badge counts. */
export function shellData(viewer: string) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  if (Math.random() < 0.01) sql('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return {
    subscriptions: subscriptions(viewer).map((c) => ({ ...c, hasNew: (c.latest ?? 0) > weekAgo })),
    badges: { notifications: notifications(viewer).filter((n) => !n.read).length, messages: unreadMessages(viewer) },
  };
}

/* ---------------- messages ---------------- */
export function conversations(viewer: string): Conversation[] {
  const rows = sql(`SELECT c.id, c.updated_at, me.last_read_id, me.cleared_before_id, o.user_id other_id,
      u.handle, u.name, u.avatar, u.verified, u.subscribers,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id AND m.id > me.cleared_before_id ORDER BY m.id DESC LIMIT 1) last_body,
      (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id AND m.id > me.cleared_before_id ORDER BY m.id DESC LIMIT 1) last_sender,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id AND m.id > me.cleared_before_id ORDER BY m.id DESC LIMIT 1) last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.id > me.last_read_id AND m.sender_id != @viewer) unread,
      EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = @viewer AND b.blocked_id = o.user_id) blocked
    FROM conversation_members me JOIN conversations c ON c.id = me.conversation_id
    JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id != @viewer
    JOIN users u ON u.id = o.user_id
    WHERE me.user_id = @viewer ORDER BY c.updated_at DESC`).all({ viewer }) as {
      id: string; other_id: string; handle: string; name: string; avatar: string | null; verified: number; subscribers: number;
      last_body: string | null; last_sender: string | null; last_at: number | null; unread: number; blocked: number;
    }[];
  return rows.filter((r) => r.last_body !== null || r.unread > 0).map((r) => ({
    id: r.id, other: lite(viewer, { id: r.other_id, handle: r.handle, name: r.name, avatar: r.avatar, verified: r.verified, subscribers: r.subscribers }),
    last: r.last_body !== null ? { body: r.last_body, mine: r.last_sender === viewer, at: r.last_at! } : null, unread: r.unread, blocked: !!r.blocked,
  }));
}

export function unreadMessages(viewer: string): number {
  return (sql(`SELECT COUNT(*) n FROM conversation_members me JOIN messages m ON m.conversation_id = me.conversation_id
    WHERE me.user_id = ? AND m.id > me.last_read_id AND m.sender_id != ?`).get(viewer, viewer) as { n: number }).n;
}

export function isMember(conversationId: string, viewer: string): boolean {
  return !!sql('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, viewer);
}

export function messages(conversationId: string, viewer: string, after = 0): Message[] {
  const floor = (sql('SELECT cleared_before_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, viewer) as { cleared_before_id: number } | undefined)?.cleared_before_id ?? Infinity;
  return (sql(`SELECT id, sender_id, body, created_at FROM (SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id DESC LIMIT 200) ORDER BY id`)
    .all(conversationId, Math.max(after, floor)) as { id: number; sender_id: string; body: string; created_at: number }[])
    .map((m) => ({ id: m.id, mine: m.sender_id === viewer, body: m.body, createdAt: m.created_at }));
}
