import { NextResponse, type NextRequest } from 'next/server';
import { getMe, rateLimit } from '@/lib/server/auth';
import { saveUpload, sweepOrphans, UploadError, type UploadKind } from '@/lib/server/storage';
import { mediaUrl } from '@/lib/server/storage';

export const runtime = 'nodejs';

const KINDS: UploadKind[] = ['video', 'image', 'captions'];

/** Rejects cross-site requests: the Origin must match the host serving the app. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 });
  const kind = req.nextUrl.searchParams.get('kind') as UploadKind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown upload type' }, { status: 400 });
  if (!rateLimit(`upload:${me.id}`, 60, 60 * 60_000)) return NextResponse.json({ error: 'Upload limit reached. Try again later.' }, { status: 429 });
  if (!req.body) return NextResponse.json({ error: 'Empty upload' }, { status: 400 });
  try {
    const saved = await saveUpload(me.id, kind, req.body);
    void sweepOrphans().catch(() => {});
    return NextResponse.json({ url: mediaUrl(saved.id), size: saved.size, mime: saved.mime });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
