import 'server-only';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type { Me, MessagePolicy, Theme } from '@/lib/types';
import { sql } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_COOKIE = 'vidora_session';
const ACCOUNTS_COOKIE = 'vidora_accounts';
const SESSION_DAYS = 30;
const accountsOpts = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' && process.env.VIDORA_INSECURE_COOKIES !== '1', path: '/', maxAge: SESSION_DAYS * 86_400 });

/** Ids of the accounts signed in on this device, most-recent first (max 5). */
export async function listAccountIds(): Promise<string[]> {
  const raw = (await cookies()).get(ACCOUNTS_COOKIE)?.value;
  try {
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** Remember a newly signed-in account on this device. */
export async function pushAccountId(userId: string): Promise<void> {
  const cur = await listAccountIds();
  const next = [userId, ...cur.filter((x) => x !== userId)].slice(0, 5);
  (await cookies()).set(ACCOUNTS_COOKIE, JSON.stringify(next), accountsOpts());
}

/** Forget an account on this device (e.g. after signing out). */
export async function removeAccountId(userId: string): Promise<void> {
  const next = (await listAccountIds()).filter((x) => x !== userId);
  (await cookies()).set(ACCOUNTS_COOKIE, JSON.stringify(next), accountsOpts());
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Always run scrypt so response time doesn't reveal whether the account exists.
  const [, saltB64, keyB64] = (stored ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$').split('$');
  const expected = Buffer.from(keyB64 ?? '', 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), 64, SCRYPT);
  return !!stored && expected.length === key.length && timingSafeEqual(expected, key);
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  sql('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(hashToken(token), userId, now, now + SESSION_DAYS * 86_400_000);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.VIDORA_INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) sql('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

interface UserRow {
  id: string; handle: string; name: string; avatar: string | null; subscribers: number; role: 'user' | 'admin'; pronouns: string;
  theme: Theme; autoplay: number; history_paused: number; message_policy: MessagePolicy;
}

/** The signed-in user for this request, or null. Cached per request. */
export const getMe = cache(async (): Promise<Me | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = sql(`SELECT u.id, u.handle, u.name, u.avatar, u.subscribers, u.role, u.pronouns, u.theme, u.autoplay, u.history_paused, u.message_policy
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`).get(hashToken(token), Date.now()) as UserRow | undefined;
  if (!row) return null;
  return {
    id: row.id, handle: row.handle, name: row.name, avatar: row.avatar, subscribers: row.subscribers, role: row.role, pronouns: row.pronouns,
    settings: { theme: row.theme, autoplay: !!row.autoplay, historyPaused: !!row.history_paused, messagePolicy: row.message_policy },
  };
});

export class AuthError extends Error {
  constructor(message = 'Sign in to continue') {
    super(message);
  }
}

export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) throw new AuthError();
  return me;
}

export async function requireAdmin(): Promise<Me> {
  const me = await requireMe();
  if (me.role !== 'admin') throw new AuthError('Admins only');
  return me;
}

/* ---------- rate limiting (in-memory, per process) ---------- */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

/** Demo-only tools (editing your own subscriber count) are off in production unless explicitly enabled. */
export const demoTools = () => process.env.NODE_ENV !== 'production' || process.env.VIDORA_DEMO_TOOLS === '1';
