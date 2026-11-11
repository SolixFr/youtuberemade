'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { livePublicState, sendLiveMessage } from '@/lib/actions/live';
import {Ago} from '@/components/ago';
import { drawStreamCard } from '@/components/stream-card';
import { SubscribeButton } from '@/components/social';
import { Avatar, Icon, IconButton, useToast } from '@/components/ui';
import { formatCount } from '@/lib/format';
import type { Video } from '@/lib/types';

interface TheaterMessage {
  id: number | string;
  author: string;
  text: string;
  kind: 'chat' | 'creator' | 'gift' | 'sub' | 'join';
  amountCents: number;
  at: number;
}

/** The live waiting room theater: canvas “starting soon” card + chat. */
export function LiveTheater({ video, me }: { video: Video; me: { id: string; name: string; handle: string } | null }) {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const chatIds = useRef(new Set<number | string>());
  const [chat, setChat] = useState<TheaterMessage[]>([]);
  const [pending, setPending] = useState<TheaterMessage[]>([]);
  const [viewers, setViewers] = useState(0);
  const [title, setTitle] = useState(video.title);
  const [msg, setMsg] = useState('');
  const [subs, setSubs] = useState(video.channel.subscribers);
  const sessionId = useRef('');

  // Draw the live card on a canvas loop (no camera — works for every viewer).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = (t: number) => { drawStreamCard(ctx, video.channel.name, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [video.channel.name]);

  // Poll session state: viewers, title, chat (uploads stream in — oldest at the bottom).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const r = await livePublicState(video.id);
      if (!alive || !r.ok) return;
      sessionId.current = r.data.session.id;
      setViewers(r.data.session.viewers);
      setTitle(r.data.session.title || video.title);
      const fresh = r.data.messages.filter((m) => !chatIds.current.has(m.id));
      if (fresh.length) {
        for (const m of fresh) chatIds.current.add(m.id);
        setChat((cur) => [...cur, ...fresh].slice(-200));
        setPending((p) => p.filter((echo) => !fresh.some((m) => m.kind === 'creator' && m.text === echo.text)));
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => { alive = false; clearInterval(t); };
  }, [video.id, video.title]);
  useEffect(() => {
    const el = chatBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, pending]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = msg.trim();
    if (!body) return;
    setMsg('');
    setPending((p) => [...p, { id: `p${Date.now()}`, author: me!.handle, text: body, kind: 'chat', amountCents: 0, at: Date.now() }]);
    const r = await sendLiveMessage(sessionId.current, body);
    if (!r.ok) toast(r.error);
  };

  return (
    <div className="live-theater">
      <div className="theater-main">
        <div className="theater-canvas-frame">
          <canvas ref={canvas} width={1280} height={720} className="theater-canvas" aria-label={`${video.channel.name} is live on Vidora`} role="img" />
          <span className="theater-chip"><Icon name="sensors" size={16} />LIVE</span>
          <span className="theater-viewers"><Icon name="visibility" size={16} />{formatCount(viewers)} watching</span>
        </div>
        <h1 className="theater-title">{title}</h1>
        <div className="theater-meta"><span><Ago ts={video.publishedAt} /></span><span>·</span><span>{video.channel.name} is live now</span></div>
        <div className="theater-channel">
          <Link href={`/${video.channel.handle}`} className="theater-avatar"><Avatar channel={video.channel} size={48} /></Link>
          <div className="w-owner-text">
            <Link href={`/${video.channel.handle}`} className="w-owner-name">{video.channel.name}</Link>
            <div className="w-owner-subs">{formatCount(subs)} subscribers</div>
          </div>
          {me?.id !== video.channel.id && <SubscribeButton channel={video.channel} initial={{ subscribed: false, bell: 'personalized' }} onCount={setSubs} />}
        </div>
      </div>
      <aside className="theater-chat" aria-label="Live chat">
        <div className="onair-stats theater-stats" aria-label="Live statistics">
          <div className="onair-stat"><b>{formatCount(viewers)}</b><span>Watching</span></div>
          <div className="onair-stat"><b>{formatCount(video.likes)}</b><span>Likes</span></div>
          <div className="onair-stat gift"><b>{chat.filter((m) => m.kind === 'gift').length}</b><span>Gifts</span></div>
        </div>
        <div ref={chatBox} className="onair-chat theater-chat-feed" aria-live="polite">
          {chat.length + pending.length === 0 && <p className="muted" role="status">Be the first to say something.</p>}
          {[...chat, ...pending].sort((a, b) => a.at - b.at).map((m) => (
            <div key={m.id} className={`onair-msg msg-${m.kind}`}>
              {m.kind === 'gift' ? <Icon name="card_giftcard" size={16} /> : m.kind === 'join' ? <Icon name="loyalty" filled size={16} /> : m.kind === 'sub' ? <Icon name="person_add" size={16} /> : null}
              <b>{m.author}</b><span>{m.text}</span>
            </div>
          ))}
        </div>
        {me ? (
          <form onSubmit={send} className="onair-send">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Chat as ${me.name}…`} maxLength={200} aria-label="Chat message" />
            <IconButton icon="send" label="Send" type="submit" disabled={!msg.trim()} />
          </form>
        ) : (
          <div className="onair-send theater-signin">
            <Link href={`/signin?next=${encodeURIComponent(`/watch?v=${video.id}`)}`} className="btn btn-filled btn-md">Sign in to chat</Link>
          </div>
        )}
      </aside>
    </div>
  );
}
