'use server';

import { id, Invalid, newId, run, text } from '@/lib/server/action';
import { getMe, rateLimit, requireMe } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { comments, getVideo, postComments, posts, STORY_MIN_SUBS, storyGroups } from '@/lib/server/queries';
import { claimUpload, deleteUpload } from '@/lib/server/storage';

const floodCheck = (userId: string) => {
  if (!rateLimit(`write:${userId}`, 30, 60_000)) throw new Invalid('You’re doing that too fast. Wait a moment and try again.');
};

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
export async function createPost(input: { text: string; image?: string | null; poll?: string[]; videoId?: string }) {
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
    const pid = newId('p');
    tx(() => {
      sql('INSERT INTO posts (id, channel_id, text, image, video_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(pid, me.id, body, image, videoId, Date.now());
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
    if (!sql('SELECT 1 FROM posts WHERE id = ?').get(id(postId))) throw new Invalid('Post not found');
    return tx(() => {
      const has = !!sql('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(me.id, postId);
      if (on && !has) { sql('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(me.id, postId); sql('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId); }
      if (!on && has) { sql('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(me.id, postId); sql('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId); }
      return (sql('SELECT likes FROM posts WHERE id = ?').get(postId) as { likes: number }).likes;
    });
  });
}

/** Vote for a poll option, or pass null to take the vote back. Returns the updated poll. */
export async function votePoll(postId: string, idx: number | null) {
  return run(async () => {
    const me = await requireMe();
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
    if (!sql('SELECT 1 FROM posts WHERE id = ?').get(id(postId))) throw new Invalid('Post not found');
    sql('INSERT INTO post_comments (id, post_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)').run(newId('pc'), postId, me.id, text(body, 'Comment', { min: 1, max: 5000 }), Date.now());
    return postComments(postId, me.id);
  });
}

/* ---------------- stories ---------------- */
const COLOR = /^#[0-9a-f]{6}$/i;

export async function createStory(input: { image?: string | null; text: string; background: string; textColor: string; videoId?: string }) {
  return run(async () => {
    const me = await requireMe();
    if (me.subscribers < STORY_MIN_SUBS) throw new Invalid(`Stories are available to channels with ${STORY_MIN_SUBS.toLocaleString()}+ subscribers`);
    floodCheck(me.id);
    const t = text(input.text ?? '', 'Text', { max: 120 });
    const image = input.image ? claimUpload(input.image, me.id, 'image') : null;
    if (!t && !image) throw new Invalid('Add some text or a photo');
    if (!COLOR.test(input.background) || !COLOR.test(input.textColor)) throw new Invalid('Invalid color');
    let videoId: string | null = null;
    if (input.videoId) {
      const v = sql("SELECT id FROM videos WHERE id = ? AND channel_id = ? AND visibility = 'public'").get(id(input.videoId), me.id) as { id: string } | undefined;
      if (!v) throw new Invalid('You can only link your own public videos');
      videoId = v.id;
    }
    sql('INSERT INTO stories (id, channel_id, image, background, text, text_color, video_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId('st'), me.id, image, input.background, t, input.textColor, videoId, Date.now());
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
    if (me) sql('INSERT OR IGNORE INTO story_views (user_id, story_id) VALUES (?, ?)').run(me.id, id(storyId));
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
