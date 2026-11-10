'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { clearConversation, findPeople, markRead, openConversation, sendMessage, setBlocked } from '@/lib/actions/messages';
import type { ChannelLite, Conversation, Message } from '@/lib/types';
import { Ago } from './ago';
import { useApp } from './app-context';
import { Avatar, Button, ConfirmDialog, Dialog, EmptyState, Icon, IconButton, Menu, Spinner, useToast } from './ui';

const POLL_MS = 3000;

/** "Message" button on channel pages. */
export function MessageButton({ userId, name }: { userId: string; name: string }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button icon="chat" disabled={busy} onClick={() => app.requireAuth(`Sign in to message ${name}`, async () => {
      setBusy(true);
      const r = await openConversation(userId);
      setBusy(false);
      if (!r.ok) return toast(r.error);
      router.push(`/messages/${r.data}`);
    })}>Message</Button>
  );
}

function NewMessageDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; handle: string; avatar: string | null }[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => findPeople(q).then((r) => r.ok && setPeople(r.data)), 150);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Dialog title="New message" onClose={onClose} width={420}>
      {(close) => (
        <>
          <div className="people-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people by name or @handle" aria-label="Search people" /></div>
          {people === null ? <div className="center-pad"><Spinner /></div> : people.length === 0 ? <p className="muted center-pad">No one found. Only accounts that have signed up can receive messages.</p> : (
            <ul className="people-list">
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={async () => {
                    const r = await openConversation(p.id);
                    if (!r.ok) return toast(r.error);
                    close();
                    router.push(`/messages/${r.data}`);
                  }}>
                    <Avatar name={p.name} src={p.avatar} size={40} /><span><b>{p.name}</b><small>{p.handle}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function Thread({ conversation, initial, onSent }: { conversation: Conversation; initial: Message[]; onSent: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<'clear' | 'block' | null>(null);
  const [blocked, setBlockedState] = useState(conversation.blocked);
  const list = useRef<HTMLDivElement>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);
  const stick = useRef(true);

  // Poll for new messages while the tab is visible.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const res = await fetch(`/api/messages?conversation=${conversation.id}&after=${lastId.current}`, { cache: 'no-store' });
      if (!alive || !res.ok) return;
      const body = (await res.json()) as { messages: Message[] };
      if (body.messages.length) {
        lastId.current = body.messages.at(-1)!.id;
        setMsgs((m) => [...m, ...body.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        void markRead(conversation.id);
      }
    };
    void markRead(conversation.id);
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [conversation.id]);

  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await sendMessage(conversation.id, body);
    setSending(false);
    if (!r.ok) return toast(r.error);
    setText('');
    stick.current = true;
    lastId.current = Math.max(lastId.current, r.data.id);
    setMsgs((m) => [...m, r.data]);
    onSent();
  };

  const days = msgs.map((m) => dayLabel(m.createdAt));
  return (
    <section className="thread">
      <header className="thread-head">
        <Link href="/messages" className="icon-btn mobile-only" aria-label="Back to inbox"><Icon name="arrow_back" /></Link>
        <Link href={`/${conversation.other.handle}`} className="thread-who"><Avatar channel={conversation.other} size={36} /><span><b>{conversation.other.name}</b><small>{conversation.other.handle}</small></span></Link>
        <span className="grow" />
        <IconButton icon="more_vert" label="Conversation options" onClick={(e) => setAnchor(e.currentTarget)} />
      </header>
      <div className="thread-list" ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {msgs.length === 0 && <p className="muted thread-empty">Say hello to {conversation.other.name}.</p>}
        {msgs.map((m, i) => {
          const day = days[i];
          const showDay = i === 0 || day !== days[i - 1];
          const next = msgs[i + 1];
          const tail = !next || next.mine !== m.mine || next.createdAt - m.createdAt > 5 * 60_000;
          return (
            <div key={m.id} className="msg-wrap">
              {showDay && <div className="msg-day">{day}</div>}
              <div className={`msg ${m.mine ? 'mine' : ''} ${tail ? 'tail' : ''}`}>
                <p>{m.body}</p>
                {tail && <time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>}
              </div>
            </div>
          );
        })}
      </div>
      {blocked ? (
        <div className="thread-blocked">You blocked {conversation.other.name}. <Button variant="text" className="text-blue" onClick={async () => { await setBlocked(conversation.other.id, false); setBlockedState(false); }}>Unblock</Button></div>
      ) : (
        <form className="thread-compose" onSubmit={send}>
          <textarea value={text} rows={1} maxLength={2000} placeholder={`Message ${conversation.other.name}`} aria-label="Message"
            onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(140, e.currentTarget.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
          <IconButton icon="send" filled label="Send" type="submit" disabled={!text.trim() || sending} className="send-btn" />
        </form>
      )}
      {anchor && <Menu anchor={anchor} onClose={() => setAnchor(null)} items={[
        { icon: 'account_box', label: 'View channel', href: `/${conversation.other.handle}` },
        { icon: 'delete_sweep', label: 'Clear chat history', onSelect: () => setConfirm('clear') },
        { icon: 'block', label: blocked ? 'Unblock' : 'Block', onSelect: () => (blocked ? setBlocked(conversation.other.id, false).then(() => setBlockedState(false)) : setConfirm('block')) },
      ]} />}
      {confirm === 'clear' && <ConfirmDialog title="Clear chat history?" text={`Messages are removed for you only. ${conversation.other.name} keeps their copy.`} confirm="Clear"
        onClose={() => setConfirm(null)} onConfirm={async () => { await clearConversation(conversation.id); setMsgs([]); router.refresh(); }} />}
      {confirm === 'block' && <ConfirmDialog title={`Block ${conversation.other.name}?`} text="Neither of you will be able to send messages in this chat." confirm="Block"
        onClose={() => setConfirm(null)} onConfirm={async () => { await setBlocked(conversation.other.id, true); setBlockedState(true); }} />}
    </section>
  );
}

export function MessagesView({ initialConversations, active, initialMessages }: { initialConversations: Conversation[]; active: Conversation | null; initialMessages: Message[] }) {
  const [convs, setConvs] = useState(initialConversations);
  const [composing, setComposing] = useState(false);
  const refresh = useCallback(async () => {
    const res = await fetch('/api/messages', { cache: 'no-store' });
    if (res.ok) setConvs(((await res.json()) as { conversations: Conversation[] }).conversations);
  }, []);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS * 2);
    return () => clearInterval(t);
  }, [refresh]);
  const list = active && !convs.some((c) => c.id === active.id) ? [active, ...convs] : convs;

  return (
    <div className={`messages ${active ? 'has-active' : ''}`}>
      <aside className="inbox">
        <header className="inbox-head"><h1>Messages</h1><IconButton icon="edit_square" label="New message" onClick={() => setComposing(true)} /></header>
        {list.length === 0 ? (
          <div className="inbox-empty"><Icon name="forum" size={56} /><p>No conversations yet.</p><Button variant="blue" icon="edit_square" onClick={() => setComposing(true)}>New message</Button></div>
        ) : (
          <ul className="inbox-list">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className={`inbox-item ${c.id === active?.id ? 'on' : ''} ${c.unread && c.id !== active?.id ? 'unread' : ''}`}>
                  <Avatar channel={c.other as ChannelLite} size={48} />
                  <span className="inbox-text">
                    <span className="inbox-name">{c.other.name}{c.last && <small><Ago ts={c.last.at} /></small>}</span>
                    <span className="inbox-last">{c.blocked ? 'Blocked' : c.last ? `${c.last.mine ? 'You: ' : ''}${c.last.body}` : 'No messages yet'}</span>
                  </span>
                  {c.unread > 0 && c.id !== active?.id && <span className="unread-dot" aria-label={`${c.unread} unread`}>{c.unread > 9 ? '9+' : c.unread}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {active ? <Thread key={active.id} conversation={active} initial={initialMessages} onSent={refresh} /> : (
        <div className="thread-placeholder"><EmptyState icon="chat" title="Your messages" text="Send a private message to another creator. Pick a conversation or start a new one." action={<Button variant="blue" onClick={() => setComposing(true)}>New message</Button>} /></div>
      )}
      {composing && <NewMessageDialog onClose={() => setComposing(false)} />}
    </div>
  );
}
