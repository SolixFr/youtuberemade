import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/server/auth';
import { conversations, isMember, messages, unreadMessages } from '@/lib/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lightweight polling endpoint: new messages in one conversation plus the inbox state. */
export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in' }, { status: 401 });
  const conversation = req.nextUrl.searchParams.get('conversation');
  const after = Number(req.nextUrl.searchParams.get('after') ?? 0) || 0;
  const body: Record<string, unknown> = { unread: unreadMessages(me.id), conversations: conversations(me.id) };
  if (conversation) {
    if (!isMember(conversation, me.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    body.messages = messages(conversation, me.id, after);
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
