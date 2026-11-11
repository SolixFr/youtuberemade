import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';
import { getMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { filePath, mediaUrl } from '@/lib/server/storage';

export const runtime = 'nodejs';

const notFound = () => new Response('Not found', { status: 404 });

/** File stream that survives client disconnects: every controller write is guarded,
    so an aborted/seeking player can never throw "controller is already closed". */
function streamFile(node: Readable, signal: AbortSignal): ReadableStream {
  let closed = false;
  const stop = () => { closed = true; node.destroy(); };
  node.on('close', () => { closed = true; });
  node.on('error', stop);
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  return new ReadableStream({
    start(controller) {
      node.on('data', (chunk: Buffer) => {
        if (closed) return;
        try { controller.enqueue(new Uint8Array(chunk)); } catch { stop(); return; }
        if (controller.desiredSize !== null && controller.desiredSize <= 0) node.pause();
      });
      node.once('end', () => { closed = true; try { controller.close(); } catch { /* already closed */ } });
    },
    pull() { if (!closed) node.resume(); },
    cancel() { stop(); },
  });
}

/** Serves uploaded files with Range support (needed for video seeking) and visibility checks. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return notFound();
  const upload = sql('SELECT owner_id, mime, attached FROM uploads WHERE id = ?').get(id) as { owner_id: string; mime: string; attached: number } | undefined;
  if (!upload) return notFound();

  // Files of private or not-yet-published videos (and unattached uploads) are only visible to their owner.
  const url = mediaUrl(id);
  const restricted = !upload.attached || !!sql(`SELECT 1 FROM videos WHERE (src = ? OR thumbnail = ? OR captions = ?) AND (visibility = 'private' OR published_at > ?)`).get(url, url, url, Date.now());
  if (restricted) {
    const me = await getMe();
    if (me?.id !== upload.owner_id) return notFound();
  }

  const path = filePath(id);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return notFound();
  }
  const headers = new Headers({
    'Content-Type': upload.mime,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Cache-Control': restricted ? 'private, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable',
  });

  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range) {
    const [, from, to] = range;
    // "bytes=500-" (from 500), "bytes=500-999", or "bytes=-500" (last 500 bytes).
    const start = from === '' ? Math.max(0, size - Number(to)) : Number(from);
    const end = from === '' || to === '' ? size - 1 : Math.min(size - 1, Number(to));
    if ((from === '' && to === '') || start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(streamFile(createReadStream(path, { start, end }), req.signal), { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(streamFile(createReadStream(path), req.signal), { status: 200, headers });
}
