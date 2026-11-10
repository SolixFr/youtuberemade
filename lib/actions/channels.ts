'use server';

import { revalidatePath } from 'next/cache';
import { httpUrl, Invalid, oneOf, run, text } from '@/lib/server/action';
import { demoTools, requireMe } from '@/lib/server/auth';
import { sql, tx } from '@/lib/server/db';
import { claimUpload, deleteUpload } from '@/lib/server/storage';
import type { BellLevel, MessagePolicy } from '@/lib/types';

export async function setSubscribed(channelId: string, on: boolean) {
  return run(async () => {
    const me = await requireMe();
    if (channelId === me.id) throw new Invalid("You can't subscribe to yourself");
    if (!sql('SELECT 1 FROM users WHERE id = ?').get(channelId)) throw new Invalid('Channel not found');
    return tx(() => {
      const exists = !!sql('SELECT 1 FROM subscriptions WHERE user_id = ? AND channel_id = ?').get(me.id, channelId);
      if (on && !exists) {
        sql("INSERT INTO subscriptions (user_id, channel_id, bell, created_at) VALUES (?, ?, 'personalized', ?)").run(me.id, channelId, Date.now());
        sql('UPDATE users SET subscribers = subscribers + 1 WHERE id = ?').run(channelId);
      } else if (!on && exists) {
        sql('DELETE FROM subscriptions WHERE user_id = ? AND channel_id = ?').run(me.id, channelId);
        sql('UPDATE users SET subscribers = MAX(0, subscribers - 1) WHERE id = ?').run(channelId);
      }
      return (sql('SELECT subscribers FROM users WHERE id = ?').get(channelId) as { subscribers: number }).subscribers;
    });
  });
}

export async function setBell(channelId: string, bell: BellLevel) {
  return run(async () => {
    const me = await requireMe();
    sql('UPDATE subscriptions SET bell = ? WHERE user_id = ? AND channel_id = ?').run(oneOf(bell, ['all', 'personalized', 'none'], 'bell'), me.id, channelId);
    return null;
  });
}

export async function updateChannel(input: { name: string; handle: string; description: string; links: string; avatar?: string | null; banner?: string | null; subscribers?: number }) {
  return run(async () => {
    const me = await requireMe();
    const name = text(input.name, 'Name', { min: 1, max: 50 });
    const handle = `@${text(input.handle, 'Handle', { min: 3, max: 31 }).replace(/^@/, '')}`;
    if (!/^@[a-z0-9._-]{3,30}$/i.test(handle)) throw new Invalid('Handles use 3–30 letters, numbers, dots, dashes or underscores');
    const taken = sql('SELECT id FROM users WHERE handle = ?').get(handle) as { id: string } | undefined;
    if (taken && taken.id !== me.id) throw new Invalid('That handle is taken');
    const description = text(input.description ?? '', 'Description', { max: 1000 });
    const links = text(input.links ?? '', 'Links', { max: 2000 }).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5).map((line) => {
      const [title, maybeUrl] = line.split('|').map((s) => s.trim());
      const url = httpUrl(maybeUrl || title);
      if (!url) throw new Invalid(`“${line}” isn’t a valid link`);
      return { title: maybeUrl ? title.slice(0, 50) : new URL(url).hostname, url };
    });
    const current = sql('SELECT avatar, banner FROM users WHERE id = ?').get(me.id) as { avatar: string | null; banner: string | null };
    let avatar = current.avatar;
    let banner = current.banner;
    if (input.avatar !== undefined) avatar = input.avatar === null ? null : claimUpload(input.avatar, me.id, 'image') ?? current.avatar;
    if (input.banner !== undefined) banner = input.banner === null ? null : claimUpload(input.banner, me.id, 'image') ?? current.banner;
    let subscribers: number | undefined;
    if (input.subscribers !== undefined && demoTools()) subscribers = Math.max(0, Math.min(1e9, Math.floor(Number(input.subscribers) || 0)));
    sql(`UPDATE users SET name = ?, handle = ?, description = ?, links = ?, avatar = ?, banner = ?${subscribers !== undefined ? ', subscribers = ?' : ''} WHERE id = ?`)
      .run(...[name, handle, description, JSON.stringify(links), avatar, banner, ...(subscribers !== undefined ? [subscribers] : []), me.id]);
    if (avatar !== current.avatar) await deleteUpload(current.avatar);
    if (banner !== current.banner) await deleteUpload(current.banner);
    revalidatePath('/', 'layout');
    return { handle };
  });
}

export async function updateSettings(input: { autoplay?: boolean; historyPaused?: boolean; messagePolicy?: MessagePolicy }) {
  return run(async () => {
    const me = await requireMe();
    if (input.autoplay !== undefined) sql('UPDATE users SET autoplay = ? WHERE id = ?').run(input.autoplay ? 1 : 0, me.id);
    if (input.historyPaused !== undefined) sql('UPDATE users SET history_paused = ? WHERE id = ?').run(input.historyPaused ? 1 : 0, me.id);
    if (input.messagePolicy !== undefined) sql('UPDATE users SET message_policy = ? WHERE id = ?').run(oneOf(input.messagePolicy, ['everyone', 'subscriptions', 'none'], 'setting'), me.id);
    return null;
  });
}
