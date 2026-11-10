import 'server-only';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, sql } from './db';

export type UploadKind = 'video' | 'image' | 'captions';
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const LIMITS: Record<UploadKind, number> = {
  video: 1024 * 1024 * 1024, // 1 GB
  image: 10 * 1024 * 1024,
  captions: 1024 * 1024,
};

/** Identify the file from its first bytes; the browser-supplied name and type are never trusted. */
export function sniff(kind: UploadKind, head: Buffer): string | null {
  const ascii = (start: number, end: number) => head.subarray(start, end).toString('latin1');
  if (kind === 'video') {
    if (ascii(4, 8) === 'ftyp') return ascii(8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4';
    if (head.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
    return null;
  }
  if (kind === 'image') {
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head.readUInt32BE(0) === 0x89504e47) return 'image/png';
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
    return null;
  }
  const text = head.toString('utf8').replace(/^﻿/, '');
  return text.startsWith('WEBVTT') ? 'text/vtt' : null;
}

export const filePath = (id: string) => join(UPLOAD_DIR, id);
export const mediaUrl = (id: string) => `/api/media/${id}`;
export const uploadIdFromUrl = (url: string | null | undefined) => url?.match(/^\/api\/media\/([A-Za-z0-9_-]{22})$/)?.[1] ?? null;

/** Streams a request body to disk, enforcing the size limit and checking the type from the first chunk. */
export async function saveUpload(ownerId: string, kind: UploadKind, body: ReadableStream<Uint8Array>): Promise<{ id: string; mime: string; size: number }> {
  const id = randomBytes(16).toString('base64url');
  const path = filePath(id);
  const out = createWriteStream(path, { flags: 'wx' });
  const reader = body.getReader();
  let size = 0;
  let mime: string | null = null;
  let head = Buffer.alloc(0);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS[kind]) throw new UploadError(`File is larger than ${Math.round(LIMITS[kind] / 1024 / 1024)} MB`);
      if (!mime) {
        head = Buffer.concat([head, Buffer.from(value)]);
        if (head.length >= 16) {
          mime = sniff(kind, head);
          if (!mime) throw new UploadError(kind === 'video' ? 'Unsupported video format. Use MP4, MOV or WebM.' : kind === 'image' ? 'Unsupported image format. Use JPEG, PNG, WebP or GIF.' : 'Subtitles must be a WebVTT (.vtt) file.');
        }
      }
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    if (!mime) mime = head.length ? sniff(kind, Buffer.concat([head, Buffer.alloc(16)])) : null;
    if (!mime) throw new UploadError('The file is empty or not recognised.');
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  } catch (err) {
    reader.cancel().catch(() => {});
    out.destroy();
    await rm(path, { force: true });
    throw err;
  }
  sql('INSERT INTO uploads (id, owner_id, kind, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, ownerId, kind, mime, size, Date.now());
  return { id, mime, size };
}

export class UploadError extends Error {}

/** Confirms an upload URL belongs to the user and has the expected kind, then marks it attached. */
export function claimUpload(url: string | null | undefined, ownerId: string, kind: UploadKind): string | null {
  const id = uploadIdFromUrl(url);
  if (!id) return null;
  const row = sql('SELECT owner_id, kind FROM uploads WHERE id = ?').get(id) as { owner_id: string; kind: string } | undefined;
  if (!row || row.owner_id !== ownerId || row.kind !== kind) return null;
  sql('UPDATE uploads SET attached = 1 WHERE id = ?').run(id);
  return mediaUrl(id);
}

export async function deleteUpload(url: string | null | undefined): Promise<void> {
  const id = uploadIdFromUrl(url);
  if (!id) return;
  sql('DELETE FROM uploads WHERE id = ?').run(id);
  await rm(filePath(id), { force: true });
}

/** Removes uploads that were never attached to anything (abandoned upload dialogs) after a day. */
export async function sweepOrphans(): Promise<void> {
  const stale = sql('SELECT id FROM uploads WHERE attached = 0 AND created_at < ?').all(Date.now() - 86_400_000) as { id: string }[];
  for (const { id } of stale) {
    sql('DELETE FROM uploads WHERE id = ?').run(id);
    await rm(filePath(id), { force: true });
  }
}
