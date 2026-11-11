'use server';

import { revalidatePath } from 'next/cache';
import { id, Invalid, newId, oneOf, run, text } from '@/lib/server/action';
import { demoTools, getMe, requireAdmin } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { deleteUpload } from '@/lib/server/storage';

/* ---------------- admin panel ----------------
   Everything here is guarded by requireAdmin(); the panel UI lives at /admin. */

export async function setOwnSubscribers(count: number) {
  return run(async () => {
    const me = await requireAdmin();
    if (!demoTools()) throw new Invalid('Demo tools are off in this deployment');
    const n = Math.max(0, Math.min(1_000_000_000, Math.floor(Number(count) || 0)));
    sql('UPDATE users SET subscribers = ? WHERE id = ?').run(n, me.id);
    revalidatePath('/', 'layout');
    return n;
  });
}

export async function adminStats() {
  return run(async () => {
    await requireAdmin();
    const one = (q: string, ...p: unknown[]) => (sql(q).get(...p) as { n: number }).n;
    return {
      users: one('SELECT COUNT(*) n FROM users'),
      videos: one("SELECT COUNT(*) n FROM videos WHERE type = 'video'"),
      shorts: one("SELECT COUNT(*) n FROM videos WHERE type = 'short'"),
      comments: one('SELECT COUNT(*) n FROM comments'),
      stories: one('SELECT COUNT(*) n FROM stories WHERE created_at > ?', Date.now() - 7 * 86_400_000),
      openReports: one('SELECT COUNT(*) n FROM reports WHERE resolved = 0'),
    };
  });
}

export async function adminUsers() {
  return run(async () => {
    await requireAdmin();
    return sql(`SELECT u.id, u.handle, u.name, u.avatar, u.role, u.subscribers, u.created_at, u.password_hash IS NOT NULL has_password,
        (SELECT COUNT(*) FROM videos v WHERE v.channel_id = u.id) videos
      FROM users u ORDER BY u.created_at`).all() as { id: string; handle: string; name: string; avatar: string | null; role: 'user' | 'admin'; subscribers: number; created_at: number; has_password: number; videos: number }[];
  });
}

export async function setUserRole(userId: string, role: 'admin' | 'user') {
  return run(async () => {
    const me = await requireAdmin();
    if (userId === me.id) throw new Invalid('You can’t change your own role');
    const r = sql('UPDATE users SET role = ? WHERE id = ?').run(oneOf(role, ['admin', 'user'], 'role'), id(userId));
    if (!r.changes) throw new Invalid('User not found');
    revalidatePath('/admin', 'layout');
    return null;
  });
}

export async function adminVideos() {
  return run(async () => {
    await requireAdmin();
    return sql(`SELECT v.id, v.title, v.type, v.visibility, v.views, v.thumbnail, v.published_at, u.handle ch_handle, u.name ch_name
      FROM videos v JOIN users u ON u.id = v.channel_id ORDER BY v.published_at DESC LIMIT 200`).all() as
      { id: string; title: string; type: 'video' | 'short'; visibility: 'public' | 'unlisted' | 'private'; views: number; thumbnail: string; published_at: number; ch_handle: string; ch_name: string }[];
  });
}

export async function deleteVideoAdmin(videoId: string) {
  return run(async () => {
    await requireAdmin();
    const v = sql('SELECT src, thumbnail, captions FROM videos WHERE id = ?').get(id(videoId)) as { src: string; thumbnail: string; captions: string | null } | undefined;
    if (!v) throw new Invalid('Video not found');
    sql('DELETE FROM videos WHERE id = ?').run(videoId);
    await Promise.all([deleteUpload(v.src), deleteUpload(v.thumbnail), deleteUpload(v.captions)]);
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function submitReport(kind: 'video' | 'comment' | 'channel' | 'post', targetId: string, reason: string) {
  return run(async () => {
    const me = await getMe();
    const r = text(reason, 'Reason', { max: 200 });
    if (!r) throw new Invalid('Pick a reason');
    sql('INSERT INTO reports (id, reporter_id, kind, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('rp'), me?.id ?? null, oneOf(kind, ['video', 'comment', 'channel', 'post'], 'Report type'), id(targetId), r, Date.now());
    return null;
  });
}

export async function adminReports() {
  return run(async () => {
    await requireAdmin();
    return sql(`SELECT r.id, r.kind, r.target_id, r.reason, r.resolved, r.created_at, u.handle reporter,
        (SELECT c.video_id FROM comments c WHERE c.id = r.target_id AND r.kind = 'comment') video_id,
        (SELECT t.handle FROM users t WHERE t.id = r.target_id AND r.kind = 'channel') ch_handle
      FROM reports r LEFT JOIN users u ON u.id = r.reporter_id ORDER BY r.resolved, r.created_at DESC LIMIT 200`).all() as
      { id: string; kind: 'video' | 'comment' | 'channel' | 'post'; target_id: string; reason: string; resolved: number; created_at: number; reporter: string | null; video_id: string | null; ch_handle: string | null }[];
  });
}

export async function resolveReport(reportId: string, resolved: boolean) {
  return run(async () => {
    await requireAdmin();
    sql('UPDATE reports SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id(reportId));
    revalidatePath('/admin', 'layout');
    return null;
  });
}
