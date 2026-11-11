'use server';

import { cookies } from 'next/headers';
import { Invalid, newId, run, text } from '@/lib/server/action';
import { clientIp, createSession, destroySession, getMe, hashPassword, pushAccountId, rateLimit, verifyPassword } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { TIERS } from '@/lib/server/seed';
import type { Theme } from '@/lib/types';

const HANDLE = /^[a-z0-9._-]{3,30}$/i;

export async function signUp(input: { name: string; handle: string; email: string; password: string }) {
  return run(async () => {
    if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000)) throw new Invalid('Too many accounts created from this network. Try again later.');
    const name = text(input.name, 'Name', { min: 1, max: 50 });
    const handle = text(input.handle, 'Handle', { min: 3, max: 31 }).replace(/^@/, '');
    if (!HANDLE.test(handle)) throw new Invalid('Handles use 3–30 letters, numbers, dots, dashes or underscores');
    const email = text(input.email, 'Email', { min: 3, max: 254 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Invalid('Enter a valid email address');
    if (typeof input.password !== 'string' || input.password.length < 10) throw new Invalid('Use at least 10 characters for your password');
    if (input.password.length > 200) throw new Invalid('Password is too long');
    if (sql('SELECT 1 FROM users WHERE handle = ?').get(`@${handle}`)) throw new Invalid('That handle is taken');
    if (sql('SELECT 1 FROM users WHERE email = ?').get(email)) throw new Invalid('An account with that email already exists');
    const id = newId('u');
    sql('INSERT INTO users (id, handle, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, `@${handle}`, name, email, await hashPassword(input.password), Date.now());
    const insertTier = sql('INSERT OR IGNORE INTO channel_tiers (channel_id, tier, price_cents, name, perks) VALUES (?, ?, ?, ?, ?)');
    for (const t of TIERS) insertTier.run(id, t.tier, t.price_cents, t.name, JSON.stringify(t.perks));
    await createSession(id);
    await pushAccountId(id);
    return { handle: `@${handle}` };
  });
}

export async function signIn(input: { email: string; password: string }) {
  return run(async () => {
    const email = String(input.email ?? '').trim().toLowerCase();
    const ip = await clientIp();
    if (!rateLimit(`signin:${ip}`, 20, 15 * 60_000) || !rateLimit(`signin:${email}`, 8, 15 * 60_000)) {
      throw new Invalid('Too many sign-in attempts. Wait a few minutes and try again.');
    }
    const row = sql('SELECT id, password_hash FROM users WHERE email = ?').get(email) as { id: string; password_hash: string | null } | undefined;
    const ok = await verifyPassword(String(input.password ?? ''), row?.password_hash ?? null);
    if (!row || !ok) throw new Invalid('Wrong email or password');
    await createSession(row.id);
    await pushAccountId(row.id);
    return null;
  });
}

export async function signOut() {
  await destroySession();
}

/** Theme is kept in a cookie so the server renders the right colors on first paint, and on the account when signed in. */
export async function setTheme(theme: Theme) {
  return run(async () => {
    if (!['dark', 'light', 'system'].includes(theme)) throw new Invalid('Invalid theme');
    (await cookies()).set('vidora_theme', theme, { path: '/', sameSite: 'lax', maxAge: 365 * 86_400 });
    const me = await getMe();
    if (me) sql('UPDATE users SET theme = ? WHERE id = ?').run(theme, me.id);
    return null;
  });
}
