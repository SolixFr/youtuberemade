'use server';

import { run, text } from '@/lib/server/action';
import { getMe, requireMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { notifications, suggestions, unreadMessages } from '@/lib/server/queries';

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
export async function badgeCounts() {
  return run(async () => {
    const me = await getMe();
    if (!me) return { notifications: 0, messages: 0 };
    return { notifications: notifications(me.id).filter((n) => !n.read).length, messages: unreadMessages(me.id) };
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
