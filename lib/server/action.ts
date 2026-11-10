import 'server-only';
import { randomBytes } from 'node:crypto';
import type { ActionResult, Visibility } from '@/lib/types';
import { AuthError } from './auth';

/** A user-facing validation problem. Its message is shown to the user. */
export class Invalid extends Error {}

/** Runs a server action body and converts known errors into a typed result; unknown errors are logged, not leaked. */
export async function run<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: 'auth' };
    if (err instanceof Invalid) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

export function text(value: unknown, name: string, { min = 0, max }: { min?: number; max: number }): string {
  if (typeof value !== 'string') throw new Invalid(`${name} is required`);
  // Strip control characters except newlines and tabs.
  const v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (v.length < min) throw new Invalid(min <= 1 ? `${name} is required` : `${name} must be at least ${min} characters`);
  if (v.length > max) throw new Invalid(`${name} must be at most ${max} characters`);
  return v;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value as T)) throw new Invalid(`Invalid ${name}`);
  return value as T;
}

export const VISIBILITIES: readonly Visibility[] = ['public', 'unlisted', 'private'];

export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,64}$/.test(value)) throw new Invalid('Not found');
  return value;
}

export const newId = (prefix: string) => `${prefix}${randomBytes(9).toString('base64url')}`;

export function httpUrl(value: string): string | null {
  try {
    const u = new URL(value.startsWith('http') ? value : `https://${value}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
