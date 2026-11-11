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

import { sanitizeSections } from '@/lib/server/queries';

export async function updateChannel(input: { name: string; handle: string; description: string; links: string; pronouns?: string; avatar?: string | null; banner?: string | null; subscribers?: number; contactEmail?: string; trailerVideoId?: string | null; featuredVideoId?: string | null; watermark?: string | null; watermarkDisplay?: 'end' | 'custom' | 'full'; watermarkStart?: number; homeSections?: string[] }) {
  return run(async () => {
    const me = await requireMe();
    const name = text(input.name, 'Name', { min: 1, max: 50 });
    const handle = `@${text(input.handle, 'Handle', { min: 3, max: 31 }).replace(/^@/, '')}`;
    if (!/^@[a-z0-9._-]{3,30}$/i.test(handle)) throw new Invalid('Handles use 3–30 letters, numbers, dots, dashes or underscores');
    const taken = sql('SELECT id FROM users WHERE handle = ?').get(handle) as { id: string } | undefined;
    if (taken && taken.id !== me.id) throw new Invalid('That handle is taken');
    const description = text(input.description ?? '', 'Description', { max: 1000 });
    const contactEmail = text(input.contactEmail ?? '', 'Contact email', { max: 100 }).trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) throw new Invalid('That isn’t a valid email address');
    const links = text(input.links ?? '', 'Links', { max: 3000 }).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10).map((line) => {
      const [title, maybeUrl] = line.split('|').map((s) => s.trim());
      const url = httpUrl(maybeUrl || title);
      if (!url) throw new Invalid(`“${line}” isn’t a valid link`);
      return { title: maybeUrl ? title.slice(0, 50) : new URL(url).hostname, url };
    });
    const current = sql('SELECT avatar, banner, watermark FROM users WHERE id = ?').get(me.id) as { avatar: string | null; banner: string | null; watermark: string | null };
    const pronouns = text(input.pronouns ?? '', 'Pronouns', { max: 40 }).replace(/[\u0000-\u001F\u007F]/g, '');
    let avatar = current.avatar;
    let banner = current.banner;
    let watermark = current.watermark;
    let homeSectionsSql: string | null = null;
    if (input.avatar !== undefined) avatar = input.avatar === null ? null : claimUpload(input.avatar, me.id, 'image') ?? current.avatar;
    if (input.banner !== undefined) banner = input.banner === null ? null : claimUpload(input.banner, me.id, 'image') ?? current.banner;
    if (input.watermark !== undefined) watermark = input.watermark === null ? null : claimUpload(input.watermark, me.id, 'image') ?? current.watermark;
    const watermarkDisplay = input.watermarkDisplay === undefined ? undefined : oneOf(input.watermarkDisplay, ['end', 'custom', 'full'], 'watermark display');
    if (input.trailerVideoId !== undefined) {
      if (input.trailerVideoId !== null) {
        const tv = sql("SELECT id FROM videos WHERE id = ? AND channel_id = ? AND visibility = 'public'").get(input.trailerVideoId, me.id) as { id: string } | undefined;
        if (!tv) throw new Invalid('The trailer must be one of your public videos');
      }
    }
    if (input.featuredVideoId !== undefined) {
      if (input.featuredVideoId !== null) {
        const fv = sql("SELECT id FROM videos WHERE id = ? AND channel_id = ? AND visibility = 'public'").get(input.featuredVideoId, me.id) as { id: string } | undefined;
        if (!fv) throw new Invalid('The featured video must be one of your public videos');
      }
    }
    const watermarkStart = input.watermarkStart === undefined ? undefined : Math.max(1, Math.min(3600, Math.floor(Number(input.watermarkStart) || 8)));
    if (input.homeSections !== undefined) {
      homeSectionsSql = JSON.stringify(sanitizeSections(input.homeSections));
    }
    let subscribers: number | undefined;
    if (input.subscribers !== undefined && demoTools()) subscribers = Math.max(0, Math.min(1e9, Math.floor(Number(input.subscribers) || 0)));
    const sets: string[] = ['name = ?', 'handle = ?', 'description = ?', 'contact_email = ?', 'links = ?', 'pronouns = ?', 'avatar = ?', 'banner = ?', 'watermark = ?'];
    const params: unknown[] = [name, handle, description, contactEmail, JSON.stringify(links), pronouns, avatar, banner, watermark];
    if (watermarkDisplay !== undefined) { sets.push('watermark_display = ?'); params.push(watermarkDisplay); }
    if (watermarkStart !== undefined) { sets.push('watermark_start = ?'); params.push(watermarkStart); }
    if (input.trailerVideoId !== undefined) { sets.push('trailer_video_id = ?'); params.push(input.trailerVideoId); }
    if (input.featuredVideoId !== undefined) { sets.push('featured_video_id = ?'); params.push(input.featuredVideoId); }
    if (homeSectionsSql !== null) { sets.push('home_sections = ?'); params.push(homeSectionsSql); }
    if (subscribers !== undefined) { sets.push('subscribers = ?'); params.push(subscribers); }
    sql(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, me.id);
    if (avatar !== current.avatar) await deleteUpload(current.avatar);
    if (banner !== current.banner) await deleteUpload(current.banner);
    if (watermark !== current.watermark) await deleteUpload(current.watermark);
    revalidatePath('/', 'layout');
    return { handle };
  });
}

export async function updateSettings(input: { autoplay?: boolean; historyPaused?: boolean; messagePolicy?: MessagePolicy; pronouns?: string }) {
  return run(async () => {
    const me = await requireMe();
    if (input.autoplay !== undefined) sql('UPDATE users SET autoplay = ? WHERE id = ?').run(input.autoplay ? 1 : 0, me.id);
    if (input.historyPaused !== undefined) sql('UPDATE users SET history_paused = ? WHERE id = ?').run(input.historyPaused ? 1 : 0, me.id);
    if (input.messagePolicy !== undefined) sql('UPDATE users SET message_policy = ? WHERE id = ?').run(oneOf(input.messagePolicy, ['everyone', 'subscriptions', 'none'], 'setting'), me.id);
    if (input.pronouns !== undefined) sql('UPDATE users SET pronouns = ? WHERE id = ?').run(text(input.pronouns, 'Pronouns', { max: 40 }).replace(/[\u0000-\u001F\u007F]/g, ''), me.id);
    return null;
  });
}
