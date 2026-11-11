'use server';

import { run, text, Invalid } from '@/lib/server/action';
import { createSession, getMe, listAccountIds, pushAccountId, requireMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { notifications, suggestions, unreadMessages } from '@/lib/server/queries';

/* ---------------- monetization ---------------- */
/** Persist the “notify me when I’m eligible for the Partner Program” choice. */
export async function setEarnNotified(on: boolean) {
  return run(async () => {
    const me = await requireMe();
    sql('UPDATE users SET earn_notified = ? WHERE id = ?').run(on ? 1 : 0, me.id);
    return !!on;
  });
}

/* ---------------- switch accounts ---------------- */
/** The accounts remembered on this device (most recent first), excluding the signed-in one. */
export async function switchList() {
  return run(async () => {
    const me = await requireMe();
    // Self-heal the remembered list: accounts signed in before this shipped otherwise never appear.
    await pushAccountId(me.id);
    const ids = (await listAccountIds()).filter((x) => x !== me.id);
    if (!ids.length) return [];
    const rows = sql(`SELECT id, handle, name, avatar, subscribers FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: string; handle: string; name: string; avatar: string | null; subscribers: number }[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  });
}

/** Switch the active account to one of the accounts remembered on this device. */
export async function switchAccount(id: string) {
  return run(async () => {
    const me = await requireMe();
    if (id === me.id) return null;
    const ids = await listAccountIds();
    if (!ids.includes(id)) throw new Invalid('That account isn’t remembered on this device');
    if (!sql('SELECT 1 FROM users WHERE id = ?').get(id)) throw new Invalid('That account no longer exists');
    await createSession(id);
    await pushAccountId(id);
    return null;
  });
}

export async function loadNotifications() {
  return run(async () => notifications((await requireMe()).id));
}

export async function markNotificationsRead(keys: string[]) {
  return run(async () => {
    const me = await requireMe();
    const ins = sql('INSERT OR IGNORE INTO notification_state (user_id, key) VALUES (?, ?)');
    for (const k of keys.slice(0, 200)) if (typeof k === 'string' && k.length < 80) ins.run(me.id, k);
    return null;
  });
}

export async function dismissNotification(key: string) {
  return run(async () => {
    const me = await requireMe();
    sql('INSERT INTO notification_state (user_id, key, dismissed) VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET dismissed = 1').run(me.id, text(key, 'key', { min: 1, max: 80 }));
    return null;
  });
}

/** Badge counts for the header, polled while the tab is visible. */
export async function mySubscribers() {
  return run(async () => (await requireMe()).subscribers);
}

export async function recentSubscribers(limit = 8) {
  return run(async () => {
    const me = await requireMe();
    return sql(`SELECT u.id, u.handle, u.name, u.avatar, s.created_at subscribed_at
      FROM subscriptions s JOIN users u ON u.id = s.user_id
      WHERE s.channel_id = ? ORDER BY s.created_at DESC LIMIT ?`)
      .all(me.id, limit) as { id: string; handle: string; name: string; avatar: string | null; subscribed_at: number }[];
  });
}

export async function badgeCounts() {
  return run(async () => {
    const me = await getMe();
    if (!me) return { notifications: 0, messages: 0, subscribers: 0 };
    return { notifications: notifications(me.id).filter((n) => !n.read).length, messages: unreadMessages(me.id), subscribers: me.subscribers };
  });
}

export async function searchSuggestions(q: string) {
  return run(async () => {
    const me = await getMe();
    return suggestions(String(q).slice(0, 100).trim(), me?.id);
  });
}

export async function saveSearch(q: string) {
  return run(async () => {
    const me = await getMe();
    if (me) sql('INSERT INTO search_history (user_id, query, at) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET at = excluded.at').run(me.id, text(q, 'Search', { min: 1, max: 100 }), Date.now());
    return null;
  });
}

export async function removeSearch(q: string) {
  return run(async () => {
    const me = await requireMe();
    sql('DELETE FROM search_history WHERE user_id = ? AND query = ?').run(me.id, String(q));
    return null;
  });
}
