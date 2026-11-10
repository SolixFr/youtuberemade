'use server';

import { id, Invalid, newId, run, text } from '@/lib/server/action';
import { requireMe, rateLimit } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { conversations, isMember, messages } from '@/lib/server/queries';

function otherMember(conversationId: string, me: string): string {
  const r = sql('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(conversationId, me) as { user_id: string } | undefined;
  if (!r) throw new Invalid('Conversation not found');
  return r.user_id;
}

/** Checks blocks and the recipient's "who can message me" setting. */
function assertCanMessage(from: string, to: string) {
  const target = sql('SELECT password_hash, message_policy FROM users WHERE id = ?').get(to) as { password_hash: string | null; message_policy: string } | undefined;
  if (!target?.password_hash) throw new Invalid('This channel doesn’t accept messages');
  if (sql('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(from, to, to, from)) {
    throw new Invalid('You can’t message this account');
  }
  if (target.message_policy === 'none') throw new Invalid('This person isn’t accepting messages');
  if (target.message_policy === 'subscriptions' && !sql('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(to, from)) {
    throw new Invalid('This person only accepts messages from channels they subscribe to');
  }
}

/** Returns the conversation id with this user, creating it if needed. */
export async function openConversation(userId: string) {
  return run(async () => {
    const me = await requireMe();
    const other = id(userId);
    if (other === me.id) throw new Invalid('You can’t message yourself');
    assertCanMessage(me.id, other);
    const pair = [me.id, other].sort().join(':');
    return tx(() => {
      const existing = sql('SELECT id FROM conversations WHERE pair_key = ?').get(pair) as { id: string } | undefined;
      if (existing) return existing.id;
      const cid = newId('dm');
      sql('INSERT INTO conversations (id, pair_key, updated_at) VALUES (?, ?, ?)').run(cid, pair, Date.now());
      sql('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)').run(cid, me.id, cid, other);
      return cid;
    });
  });
}

export async function sendMessage(conversationId: string, body: string) {
  return run(async () => {
    const me = await requireMe();
    const cid = id(conversationId);
    if (!isMember(cid, me.id)) throw new Invalid('Conversation not found');
    assertCanMessage(me.id, otherMember(cid, me.id));
    if (!rateLimit(`dm:${me.id}`, 20, 10_000)) throw new Invalid('You’re sending messages too fast');
    const t = text(body, 'Message', { min: 1, max: 2000 });
    const now = Date.now();
    return tx(() => {
      const r = sql('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)').run(cid, me.id, t, now);
      sql('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, cid);
      sql('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?').run(r.lastInsertRowid, cid, me.id);
      return { id: Number(r.lastInsertRowid), mine: true, body: t, createdAt: now };
    });
  });
}

export async function markRead(conversationId: string) {
  return run(async () => {
    const me = await requireMe();
    sql(`UPDATE conversation_members SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
      WHERE conversation_id = ? AND user_id = ?`).run(id(conversationId), conversationId, me.id);
    return null;
  });
}

/** Hides the history for you only; the other person keeps theirs. */
export async function clearConversation(conversationId: string) {
  return run(async () => {
    const me = await requireMe();
    sql(`UPDATE conversation_members SET cleared_before_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?), last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
      WHERE conversation_id = ? AND user_id = ?`).run(id(conversationId), conversationId, conversationId, me.id);
    return null;
  });
}

export async function setBlocked(userId: string, on: boolean) {
  return run(async () => {
    const me = await requireMe();
    if (userId === me.id) throw new Invalid('You can’t block yourself');
    if (on) sql('INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?, ?)').run(me.id, id(userId));
    else sql('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(me.id, id(userId));
    return on;
  });
}

export async function listConversations() {
  return run(async () => conversations((await requireMe()).id));
}

export async function loadMessages(conversationId: string, after = 0) {
  return run(async () => {
    const me = await requireMe();
    if (!isMember(id(conversationId), me.id)) throw new Invalid('Conversation not found');
    return messages(conversationId, me.id, after);
  });
}

export async function findPeople(q: string) {
  return run(async () => {
    const me = await requireMe();
    const like = `%${String(q).toLowerCase().replace(/^@/, '').replace(/[%_\\]/g, '\\$&').slice(0, 50)}%`;
    return sql(`SELECT id, name, handle, avatar FROM users WHERE password_hash IS NOT NULL AND id != ? AND (lower(name) LIKE ? ESCAPE '\\' OR lower(handle) LIKE ? ESCAPE '\\') LIMIT 8`)
      .all(me.id, like, like) as { id: string; name: string; handle: string; avatar: string | null }[];
  });
}
