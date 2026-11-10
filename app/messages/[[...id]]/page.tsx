import { MessagesView } from '@/components/messages';
import { SignedOut } from '@/components/signed-out';
import { getMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { channelById, conversations, isMember, messages } from '@/lib/server/queries';
import type { Conversation } from '@/lib/types';

export const metadata = { title: 'Messages' };

export default async function MessagesPage({ params }: { params: Promise<{ id?: string[] }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) return <SignedOut icon="chat" title="Your messages" text="Sign in to send and receive private messages." next="/messages" />;
  const list = conversations(me.id);
  let active: Conversation | null = null;
  const cid = id?.[0];
  if (cid && /^[\w-]{1,64}$/.test(cid) && isMember(cid, me.id)) {
    active = list.find((c) => c.id === cid) ?? null;
    if (!active) {
      // A brand-new conversation with no messages yet.
      const other = sql('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(cid, me.id) as { user_id: string } | undefined;
      const ch = other && channelById(other.user_id, me.id);
      if (ch) active = { id: cid, other: ch, last: null, unread: 0, blocked: !!sql('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').get(me.id, ch.id) };
    }
  }
  return <MessagesView initialConversations={list} active={active} initialMessages={active ? messages(active.id, me.id) : []} />;
}
