'use server';

import { revalidatePath } from 'next/cache';
import { id, Invalid, newId, run, text } from '@/lib/server/action';
import { getMe, rateLimit, requireMe } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { canSeeMembersOnly, comments, getVideo, monetization, postComments, posts, STORY_MIN_SUBS, storyGroups } from '@/lib/server/queries';
import { claimUpload, deleteUpload } from '@/lib/server/storage';

const floodCheck = (userId: string) => {
  if (!rateLimit(`write:${userId}`, 30, 60_000)) throw new Invalid('You’re doing that too fast. Wait a moment and try again.');
};

/** Throws unless the viewer may read this post (members-only posts: owner/member only). */
function requireViewablePost(postId: string, viewerId: string | null | undefined) {
  const p = sql('SELECT channel_id, members_only FROM posts WHERE id = ?').get(id(postId)) as { channel_id: string; members_only: number } | undefined;
  if (!p) throw new Invalid('Post not found');
  if (p.members_only && !canSeeMembersOnly(viewerId, p.channel_id)) throw new Invalid('This post is for members only');
  return p;
}

/* ---------------- video comments ---------------- */
export async function addComment(videoId: string, body: string, parentId?: string) {
  return run(async () => {
    const me = await requireMe();
    floodCheck(me.id);
    const v = getVideo(id(videoId), me.id);
    if (!v) throw new Invalid('This video isn’t available');
    const t = text(body, 'Comment', { min: 1, max: 10_000 });
    let parent: string | null = null;
    if (parentId) {
      const p = sql('SELECT id, parent_id FROM comments WHERE id = ? AND video_id = ?').get(id(parentId), v.id) as { id: string; parent_id: string | null } | undefined;
      if (!p) throw new Invalid('That comment was deleted');
      parent = p.parent_id ?? p.id; // replies are one level deep
    }
    const cid = newId('c');
    sql('INSERT INTO comments (id, video_id, parent_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(cid, v.id, parent, me.id, t, Date.now());
    return comments(v.id, me.id).find((c) => c.id === cid)!;
  });
}

function loadComment(commentId: string) {
  const c = sql('SELECT c.id, c.author_id, c.video_id, c.parent_id, v.channel_id owner FROM comments c JOIN videos v ON v.id = c.video_id WHERE c.id = ?').get(id(commentId)) as
    { id: string; author_id: string | null; video_id: string; parent_id: string | null; owner: string } | undefined;
  if (!c) throw new Invalid('That comment was deleted');
  return c;
}

export async function editComment(commentId: string, body: string) {
  return run(async () => {
    const me = await requireMe();
    const c = loadComment(commentId);
    if (c.author_id !== me.id) throw new Invalid('You can only edit your own comments');
    const t = text(body, 'Comment', { min: 1, max: 10_000 });
    sql('UPDATE comments SET text = ?, edited = 1 WHERE id = ?').run(t, c.id);
    return t;
  });
}

export async function deleteComment(commentId: string) {
  return run(async () => {
    const me = await requireMe();
    const c = loadComment(commentId);
    if (c.author_id !== me.id && c.owner !== me.id) throw new Invalid('You can’t delete this comment');
    sql('DELETE FROM comments WHERE id = ?').run(c.id);
    return null;
  });
}

export async function voteComment(commentId: string, value: -1 | 0 | 1) {
  return run(async () => {
    const me = await requireMe();
    const c = loadComment(commentId);
    if (![-1, 0, 1].includes(value)) throw new Invalid('Invalid vote');
    return tx(() => {
      const prev = (sql('SELECT value FROM comment_votes WHERE user_id = ? AND comment_id = ?').get(me.id, c.id) as { value: number } | undefined)?.value ?? 0;
      if (value === 0) sql('DELETE FROM comment_votes WHERE user_id = ? AND comment_id = ?').run(me.id, c.id);
      else sql('INSERT INTO comment_votes (user_id, comment_id, value) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value').run(me.id, c.id, value);
      const delta = (value === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      if (delta) sql('UPDATE comments SET likes = MAX(0, likes + ?) WHERE id = ?').run(delta, c.id);
      return value;
    });
  });
}

/** Creator tools on their own videos. */
export async function moderateComment(commentId: string, change: 'pin' | 'unpin' | 'heart' | 'unheart') {
  return run(async () => {
    const me = await requireMe();
    const c = loadComment(commentId);
    if (c.owner !== me.id) throw new Invalid('Only the video’s creator can do that');
    if (change === 'pin' || change === 'unpin') {
      if (c.parent_id) throw new Invalid('Only top-level comments can be pinned');
      tx(() => {
        sql('UPDATE comments SET pinned = 0 WHERE video_id = ?').run(c.video_id);
        if (change === 'pin') sql('UPDATE comments SET pinned = 1 WHERE id = ?').run(c.id);
      });
    } else sql('UPDATE comments SET hearted = ? WHERE id = ?').run(change === 'heart' ? 1 : 0, c.id);
    return null;
  });
}

/* ---------------- posts ---------------- */
export async function createPost(input: { text: string; image?: string | null; poll?: string[]; videoId?: string; membersOnly?: boolean }) {
  return run(async () => {
    const me = await requireMe();
    floodCheck(me.id);
    const body = text(input.text ?? '', 'Post', { max: 1500 });
    const image = input.image ? claimUpload(input.image, me.id, 'image') : null;
    if (input.image && !image) throw new Invalid('The image upload expired. Choose it again.');
    let videoId: string | null = null;
    if (input.videoId) {
      const v = sql("SELECT id FROM videos WHERE id = ? AND channel_id = ? AND visibility = 'public'").get(id(input.videoId), me.id) as { id: string } | undefined;
      if (!v) throw new Invalid('You can only attach your own public videos');
      videoId = v.id;
    }
    const options = (input.poll ?? []).map((o) => text(o, 'Poll option', { min: 1, max: 65 }));
    if (input.poll && (options.length < 2 || options.length > 5)) throw new Invalid('Polls need 2–5 options');
    if (!body && !image && !videoId) throw new Invalid('Write something first');
    if (input.membersOnly) {
      const t = sql('SELECT COUNT(*) n FROM channel_tiers WHERE channel_id = ?').get(me.id) as { n: number };
      if (!t.n) throw new Invalid('Memberships aren’t enabled for this channel yet');
      if (!monetization(me.id).memberships) throw new Invalid('Memberships aren’t unlocked yet — meet the eligibility requirements first');
    }
    const pid = newId('p');
    tx(() => {
      sql('INSERT INTO posts (id, channel_id, text, image, video_id, members_only, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(pid, me.id, body, image, videoId, input.membersOnly ? 1 : 0, Date.now());
      options.forEach((o, i) => sql('INSERT INTO poll_options (post_id, idx, text) VALUES (?, ?, ?)').run(pid, i, o));
    });
    return pid;
  });
}

function ownPost(postId: string, owner: string) {
  const p = sql('SELECT channel_id, image FROM posts WHERE id = ?').get(id(postId)) as { channel_id: string; image: string | null } | undefined;
  if (!p || p.channel_id !== owner) throw new Invalid('Post not found');
  return p;
}

export async function deletePost(postId: string) {
  return run(async () => {
    const me = await requireMe();
    const p = ownPost(postId, me.id);
    sql('DELETE FROM posts WHERE id = ?').run(postId);
    await deleteUpload(p.image);
    return null;
  });
}

export async function likePost(postId: string, on: boolean) {
  return run(async () => {
    const me = await requireMe();
    requireViewablePost(postId, me.id);
    return tx(() => {
      const has = !!sql('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(me.id, postId);
      if (on && !has) { sql('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(me.id, postId); sql('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId); }
      if (!on && has) { sql('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(me.id, postId); sql('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId); }
      return (sql('SELECT likes FROM posts WHERE id = ?').get(postId) as { likes: number }).likes;
    });
  });
}

/** Vote for a poll option, or pass null to take the vote back. Returns the updated poll. */
/** Live poll state for a post — the same shape PostCard renders. */
/* ---------------- memberships ---------------- */
export async function joinChannel(channelId: string, tier: number) {
  return run(async () => {
    const me = await requireMe();
    if (me.id === channelId) throw new Invalid('You own this channel');
    const channels = sql('SELECT id FROM users WHERE id = ?').get(channelId) as { id: string } | undefined;
    if (!channels) throw new Invalid('Channel not found');
    if (!monetization(channelId).memberships) throw new Invalid('This channel hasn’t unlocked memberships yet');
    const t = sql('SELECT price_cents FROM channel_tiers WHERE channel_id = ? AND tier = ?').get(channelId, tier) as { price_cents: number } | undefined;
    if (!t) throw new Invalid('No such membership tier');
    const existing = sql('SELECT tier FROM memberships WHERE user_id = ? AND channel_id = ?').get(me.id, channelId) as { tier: number } | undefined;
    sql('INSERT OR REPLACE INTO memberships (user_id, channel_id, tier, started_at) VALUES (?, ?, ?, ?)').run(me.id, channelId, tier, Date.now());
    // Creator gets 70% of the monthly fee up front — once per tier change, never on repeat taps.
    if (!existing || existing.tier !== tier) {
      sql('UPDATE users SET earnings = earnings + ? WHERE id = ?').run(Math.floor(t.price_cents * 0.7), channelId);
    }
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function leaveChannel(channelId: string) {
  return run(async () => {
    const me = await requireMe();
    if (!sql('DELETE FROM memberships WHERE user_id = ? AND channel_id = ?').run(me.id, channelId).changes) {
      throw new Invalid('You’re not a member of this channel');
    }
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function studioMembersRoster(channelId: string) {
  return run(async () => {
    const me = await requireMe();
    if (me.id !== channelId) throw new Invalid('Not your channel');
    return (sql(`SELECT u.id, u.handle, u.name, u.avatar, m.tier, m.started_at FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY m.tier DESC, m.started_at DESC`).all(channelId) as { id: string; handle: string; name: string; avatar: string | null; tier: number; started_at: number }[]);
  });
}
export async function studioMembersStats(channelId: string) {
  return run(async () => {
    const me = await requireMe();
    if (me.id !== channelId) throw new Invalid('Not your channel');
    const row = sql(`SELECT COALESCE(SUM(t.price_cents), 0) revenue, COUNT(*) members FROM memberships m JOIN channel_tiers t ON t.channel_id = m.channel_id AND t.tier = m.tier WHERE m.channel_id = ?`).get(channelId) as { revenue: number; members: number };
    return { revenueCents: row.revenue, memberCount: row.members, creatorShareCents: Math.round(row.revenue * 0.7) };
  });
}

export async function refreshPost(postId: string) {
  return run(async () => {
    const me = await getMe();
    requireViewablePost(postId, me?.id);
    const row = sql(`SELECT p.*, (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) n_comments FROM posts p WHERE p.id = ?`).get(postId) as { likes: number; n_comments: number };
    const options = sql('SELECT text, votes FROM poll_options WHERE post_id = ? ORDER BY idx').all(postId) as { text: string; votes: number }[];
    const myVote = me ? (sql('SELECT idx FROM poll_votes WHERE user_id = ? AND post_id = ?').get(me.id, postId) as { idx: number } | undefined)?.idx ?? null : null;
    return { id: postId, likes: row.likes, comments: row.n_comments, poll: options.length ? options : null, myVote };
  });
}

export async function votePoll(postId: string, idx: number | null) {
  return run(async () => {
    const me = await requireMe();
    requireViewablePost(postId, me.id);
    const n = (sql('SELECT COUNT(*) n FROM poll_options WHERE post_id = ?').get(id(postId)) as { n: number }).n;
    if (!n || (idx !== null && (!Number.isInteger(idx) || idx < 0 || idx >= n))) throw new Invalid('Poll not found');
    tx(() => {
      const prev = sql('SELECT idx FROM poll_votes WHERE user_id = ? AND post_id = ?').get(me.id, postId) as { idx: number } | undefined;
      if (prev) {
        sql('UPDATE poll_options SET votes = MAX(0, votes - 1) WHERE post_id = ? AND idx = ?').run(postId, prev.idx);
        sql('DELETE FROM poll_votes WHERE user_id = ? AND post_id = ?').run(me.id, postId);
      }
      if (idx !== null) {
        sql('INSERT INTO poll_votes (user_id, post_id, idx) VALUES (?, ?, ?)').run(me.id, postId, idx);
        sql('UPDATE poll_options SET votes = votes + 1 WHERE post_id = ? AND idx = ?').run(postId, idx);
      }
    });
    return posts(me.id, { id: postId })[0];
  });
}

export async function commentOnPost(postId: string, body: string) {
  return run(async () => {
    const me = await requireMe();
    floodCheck(me.id);
    requireViewablePost(postId, me.id);
    sql('INSERT INTO post_comments (id, post_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)').run(newId('pc'), postId, me.id, text(body, 'Comment', { min: 1, max: 5000 }), Date.now());
    return postComments(postId, me.id);
  });
}

/* ---------------- stories ---------------- */
const COLOR = /^#[0-9a-f]{6}$/i;
const TEXT_POS = new Set(['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']);

export async function createStory(input: { image?: string | null; text: string; background: string; textColor: string; textPos?: string; videoId?: string }) {
  return run(async () => {
    const me = await requireMe();
    if (me.subscribers < STORY_MIN_SUBS) throw new Invalid(`Stories are available to channels with ${STORY_MIN_SUBS.toLocaleString()}+ subscribers`);
    floodCheck(me.id);
    const t = text(input.text ?? '', 'Text', { max: 120 });
    const image = input.image ? claimUpload(input.image, me.id, 'image') : null;
    if (!t && !image) throw new Invalid('Add some text or a photo');
    if (!COLOR.test(input.background) || !COLOR.test(input.textColor)) throw new Invalid('Invalid color');
    const textPos = input.textPos && TEXT_POS.has(input.textPos) ? input.textPos : 'middle-center';
    let videoId: string | null = null;
    if (input.videoId) {
      const v = sql("SELECT id FROM videos WHERE id = ? AND channel_id = ? AND visibility = 'public'").get(id(input.videoId), me.id) as { id: string } | undefined;
      if (!v) throw new Invalid('You can only link your own public videos');
      videoId = v.id;
    }
    sql('INSERT INTO stories (id, channel_id, image, background, text, text_color, text_pos, video_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId('st'), me.id, image, input.background, t, input.textColor, textPos, videoId, Date.now());
    return null;
  });
}

export async function deleteStory(storyId: string) {
  return run(async () => {
    const me = await requireMe();
    const s = sql('SELECT channel_id, image FROM stories WHERE id = ?').get(id(storyId)) as { channel_id: string; image: string | null } | undefined;
    if (!s || s.channel_id !== me.id) throw new Invalid('Story not found');
    sql('DELETE FROM stories WHERE id = ?').run(storyId);
    await deleteUpload(s.image);
    return null;
  });
}

/** Stories to play in the viewer, starting with the requested channel. */
export async function loadStories(startChannel: string) {
  return run(async () => {
    const me = await getMe();
    const subs = me ? (sql('SELECT channel_id FROM subscriptions WHERE user_id = ?').all(me.id) as { channel_id: string }[]).map((r) => r.channel_id) : [];
    const ids = [...new Set([id(startChannel), ...(me ? [me.id] : []), ...subs])];
    const groups = storyGroups(me?.id, ids);
    return [...groups.filter((g) => g.channel.id === startChannel), ...groups.filter((g) => g.channel.id !== startChannel)];
  });
}

export async function markStorySeen(storyId: string) {
  return run(async () => {
    const me = await getMe();
    if (!me) return null;
    const r = sql('INSERT OR IGNORE INTO story_views (user_id, story_id) VALUES (?, ?)').run(me.id, id(storyId));
    // A story's view counter ticks once per unique viewer.
    if (r.changes) sql('UPDATE stories SET views = views + 1 WHERE id = ?').run(storyId);
    return null;
  });
}

export async function likeStory(storyId: string, on: boolean) {
  return run(async () => {
    const me = await requireMe();
    sql('INSERT INTO story_views (user_id, story_id, liked) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET liked = excluded.liked').run(me.id, id(storyId), on ? 1 : 0);
    return on;
  });
}

export async function loadComments(videoId: string) {
  return run(async () => {
    const me = await getMe();
    if (!getVideo(id(videoId), me?.id)) throw new Invalid('This video isn’t available');
    return comments(videoId, me?.id);
  });
}
