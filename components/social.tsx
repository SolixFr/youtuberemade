'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { setBell, setSubscribed } from '@/lib/actions/channels';
import { addComment, deleteComment, deletePost, editComment, likePost, moderateComment, voteComment, votePoll } from '@/lib/actions/social';
import {formatCount, watchHref } from '@/lib/format';
import type { BellLevel, Comment, Post } from '@/lib/types';
import { Ago } from './ago';
import { useApp } from './app-context';
import { Thumbnail } from './cards';
import { Avatar, Button, ConfirmDialog, Icon, IconButton, Menu, useToast } from './ui';

/* ---------------- Subscribe ---------------- */
export function SubscribeButton({ channel, initial, size = 'md', onCount }: {
  channel: { id: string; name: string }; initial: { subscribed: boolean; bell: BellLevel }; size?: 'sm' | 'md'; onCount?: (n: number) => void;
}) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (app.me?.id === channel.id) {
    return (
      <div className="btn-row">
        <Link href="/studio/customization" className={`btn btn-tonal btn-${size}`}>Customize channel</Link>
        <Link href="/studio/content" className={`btn btn-tonal btn-${size}`}>Manage videos</Link>
      </div>
    );
  }
  const change = async (on: boolean) => {
    setState((s) => ({ ...s, subscribed: on }));
    const r = await setSubscribed(channel.id, on);
    if (!r.ok) { setState((s) => ({ ...s, subscribed: !on })); return toast(r.error); }
    onCount?.(r.data);
    toast(on ? 'Subscription added' : 'Subscription removed');
    router.refresh();
  };
  if (!state.subscribed) {
    return <Button variant="filled" size={size} className="subscribe-btn" onClick={() => app.requireAuth(`Want to subscribe to ${channel.name}?`, () => change(true))}>Subscribe</Button>;
  }
  const bellIcon = state.bell === 'all' ? 'notifications_active' : state.bell === 'none' ? 'notifications_off' : 'notifications';
  const pick = (bell: BellLevel, msg: string) => { setState((s) => ({ ...s, bell })); void setBell(channel.id, bell); toast(msg); };
  return (
    <>
      <button type="button" className={`btn btn-tonal btn-${size} subscribe-btn`} onClick={(e) => setAnchor(e.currentTarget)}>
        <Icon name={bellIcon} size={size === 'sm' ? 20 : 24} /><span className="btn-label">Subscribed</span><Icon name="expand_more" size={20} className="trail" />
      </button>
      {anchor && (
        <Menu anchor={anchor} align="left" onClose={() => setAnchor(null)} items={[
          { icon: 'notifications_active', label: 'All', checked: state.bell === 'all', onSelect: () => pick('all', 'You’ll get all notifications') },
          { icon: 'notifications', label: 'Personalized', checked: state.bell === 'personalized', onSelect: () => pick('personalized', 'You’ll get personalized notifications') },
          { icon: 'notifications_off', label: 'None', checked: state.bell === 'none', onSelect: () => pick('none', 'You won’t get notifications') },
          { icon: 'person_remove', label: 'Unsubscribe', onSelect: () => setConfirm(true) },
        ]} />
      )}
      {confirm && <ConfirmDialog title="" text={`Unsubscribe from ${channel.name}?`} confirm="Unsubscribe" onClose={() => setConfirm(false)} onConfirm={() => change(false)} />}
    </>
  );
}

/* ---------------- Rich text: timestamps, hashtags and links ---------------- */
export function RichText({ text, onSeek }: { text: string; onSeek?: (t: number) => void }) {
  const parts: ReactNode[] = [];
  const re = /(\b(?:\d+:)?\d{1,2}:\d{2}\b)|(#[\p{L}\d_]+)|(https?:\/\/[^\s<]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const k = m.index;
    if (m[1] && onSeek) {
      const secs = m[1].split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
      parts.push(<button type="button" key={k} className="ts-link" onClick={(e) => { e.stopPropagation(); onSeek(secs); }}>{m[1]}</button>);
    } else if (m[2]) {
      parts.push(<Link key={k} className="hashtag" href={`/results?search_query=${encodeURIComponent(m[2])}`} onClick={(e) => e.stopPropagation()}>{m[2]}</Link>);
    } else if (m[3]) {
      parts.push(<a key={k} className="hashtag" href={m[3]} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>{m[3].replace(/^https?:\/\//, '')}</a>);
    } else parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/* ---------------- Comments ---------------- */
function Composer({ placeholder, onSubmit, onCancel, autoFocus, reply }: { placeholder: string; onSubmit: (t: string) => Promise<boolean>; onCancel?: () => void; autoFocus?: boolean; reply?: boolean }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [active, setActive] = useState(!!autoFocus);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit(text.trim());
    setBusy(false);
    if (ok) { setText(''); setActive(!!reply); }
  };
  return (
    <div className={`c-composer ${reply ? 'reply' : ''}`}>
      <Avatar channel={app.me} name="?" size={reply ? 24 : 40} />
      <div className="c-field">
        <textarea className="line-input" rows={1} value={text} placeholder={placeholder} autoFocus={autoFocus} maxLength={10_000}
          onFocus={() => app.requireAuth('Sign in to comment', () => setActive(true))}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) void submit(); }}
          onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }} />
        {active && (
          <div className="c-actions">
            <Button variant="text" onClick={() => { setText(''); setActive(false); onCancel?.(); }}>Cancel</Button>
            <Button variant="blue" disabled={!text.trim() || busy} onClick={submit}>{reply ? 'Reply' : 'Comment'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, replies, owner, onSeek, update, remove, add }: {
  c: Comment; replies: Comment[]; owner: { id: string; handle: string; name: string; avatar: string | null };
  onSeek?: (t: number) => void; update: (id: string, patch: Partial<Comment>) => void; remove: (id: string) => void; add: (c: Comment) => void;
}) {
  const app = useApp();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const iOwnVideo = app.me?.id === owner.id;
  const size = c.parentId ? 24 : 40;

  const vote = (value: -1 | 1) => app.requireAuth('Sign in to rate comments', async () => {
    const next = c.myVote === value ? 0 : value;
    const likes = c.likes + (next === 1 ? 1 : 0) - (c.myVote === 1 ? 1 : 0);
    update(c.id, { myVote: next, likes });
    const r = await voteComment(c.id, next);
    if (!r.ok) { update(c.id, { myVote: c.myVote, likes: c.likes }); toast(r.error); }
  });
  const moderate = async (change: 'pin' | 'unpin' | 'heart' | 'unheart') => {
    const r = await moderateComment(c.id, change);
    if (!r.ok) return toast(r.error);
    if (change === 'pin' || change === 'unpin') update(c.id, { pinned: change === 'pin' });
    else update(c.id, { hearted: change === 'heart' });
  };

  return (
    <div className={`comment ${c.parentId ? 'reply' : ''}`}>
      {c.author.id ? <Link href={`/${c.author.handle}`}><Avatar name={c.author.name} src={c.author.avatar} size={size} /></Link> : <Avatar name={c.author.handle} size={size} />}
      <div className="c-body">
        {c.pinned && <div className="c-pinned"><Icon name="push_pin" size={16} />Pinned by {owner.handle}</div>}
        <div className={`c-who ${c.byCreator ? 'creator' : ''}`}>
          <span>{c.author.handle}</span>
          {c.byCreator && c.author.verified && <Icon name="check_circle" filled size={14} className="verified" />}
          <span className="c-when"><Ago ts={c.createdAt} />{c.edited ? ' (edited)' : ''}</span>
        </div>
        {editing ? (
          <div>
            <textarea className="line-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={10_000} />
            <div className="c-actions">
              <Button variant="text" onClick={() => { setEditing(false); setDraft(c.text); }}>Cancel</Button>
              <Button variant="blue" disabled={!draft.trim()} onClick={async () => {
                const r = await editComment(c.id, draft);
                if (!r.ok) return toast(r.error);
                update(c.id, { text: r.data, edited: true });
                setEditing(false);
              }}>Save</Button>
            </div>
          </div>
        ) : <div className="c-text"><RichText text={c.text} onSeek={onSeek} /></div>}
        <div className="c-toolbar">
          <IconButton icon="thumb_up" filled={c.myVote === 1} label="Like" onClick={() => vote(1)} />
          <span className="c-count">{c.likes ? formatCount(c.likes) : ''}</span>
          <IconButton icon="thumb_down" filled={c.myVote === -1} label="Dislike" onClick={() => vote(-1)} />
          {c.hearted && <span className="c-heart" title={`❤ by ${owner.name}`}><Avatar channel={owner} size={16} /><Icon name="favorite" filled size={14} className="heart" /></span>}
          <Button variant="text" onClick={() => app.requireAuth('Sign in to reply', () => setReplying(true))}>Reply</Button>
          <span className="grow" />
          {(app.me) && <IconButton icon="more_vert" label="Action menu" onClick={(e) => setAnchor(e.currentTarget)} />}
        </div>
        {replying && (
          <Composer reply autoFocus placeholder="Add a reply…" onCancel={() => setReplying(false)} onSubmit={async (t) => {
            const r = await addComment(c.videoId, t, c.parentId ?? c.id);
            if (!r.ok) { toast(r.error); return false; }
            add(r.data);
            setReplying(false);
            setOpen(true);
            return true;
          }} />
        )}
        {replies.length > 0 && (
          <>
            <button type="button" className="replies-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name={open ? 'expand_less' : 'expand_more'} />{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</button>
            {open && <div className="replies">{replies.map((r) => <CommentItem key={r.id} c={r} replies={[]} owner={owner} onSeek={onSeek} update={update} remove={remove} add={add} />)}</div>}
          </>
        )}
      </div>
      {anchor && (
        <Menu anchor={anchor} onClose={() => setAnchor(null)} items={[
          ...(iOwnVideo && !c.parentId ? [{ icon: 'push_pin', label: c.pinned ? 'Unpin' : 'Pin', onSelect: () => moderate(c.pinned ? 'unpin' : 'pin') }] : []),
          ...(iOwnVideo ? [{ icon: 'favorite', label: c.hearted ? 'Remove heart' : 'Heart', onSelect: () => moderate(c.hearted ? 'unheart' : 'heart') }] : []),
          ...(c.mine ? [{ icon: 'edit', label: 'Edit', onSelect: () => setEditing(true) }] : []),
          ...(c.mine || iOwnVideo ? [{ icon: 'delete', label: c.mine ? 'Delete' : 'Remove', onSelect: () => setConfirm(true) }] : [{ icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'comment' }) }]),
        ]} />
      )}
      {confirm && <ConfirmDialog title="Delete comment" text="Delete this comment permanently?" onClose={() => setConfirm(false)} onConfirm={async () => {
        const r = await deleteComment(c.id);
        if (!r.ok) return toast(r.error);
        remove(c.id);
        toast('Comment deleted');
      }} />}
    </div>
  );
}

export function Comments({ videoId, owner, initial, onSeek, compact }: {
  videoId: string; owner: { id: string; handle: string; name: string; avatar: string | null }; initial: Comment[]; onSeek?: (t: number) => void; compact?: boolean;
}) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const update = (id: string, patch: Partial<Comment>) => setList((l) => l.map((c) => {
    if (patch.pinned && c.id !== id) return { ...c, pinned: false };
    return c.id === id ? { ...c, ...patch } : c;
  }));
  const remove = (id: string) => setList((l) => l.filter((c) => c.id !== id && c.parentId !== id));
  const add = (c: Comment) => setList((l) => [...l, c]);
  const top = list.filter((c) => !c.parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'top' ? b.likes - a.likes || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
  return (
    <div>
      {!compact && (
        <div className="c-head">
          <h2>{list.length.toLocaleString()} Comments</h2>
          <Button variant="text" icon="sort" onClick={(e) => setAnchor(e.currentTarget)}>Sort by</Button>
        </div>
      )}
      <Composer placeholder="Add a comment…" onSubmit={async (t) => {
        const r = await addComment(videoId, t);
        if (!r.ok) { toast(r.error === 'auth' ? 'Sign in to comment' : r.error); return false; }
        add(r.data);
        return true;
      }} />
      {top.map((c) => <CommentItem key={c.id} c={c} replies={list.filter((r) => r.parentId === c.id)} owner={owner} onSeek={onSeek} update={update} remove={remove} add={add} />)}
      {!top.length && <p className="muted">No comments yet. Start the conversation.</p>}
      {anchor && <Menu anchor={anchor} onClose={() => setAnchor(null)} align="left" sheet={false} items={[
        { label: 'Top comments', checked: sort === 'top', onSelect: () => setSort('top') },
        { label: 'Newest first', checked: sort === 'new', onSelect: () => setSort('new') },
      ]} />}
    </div>
  );
}

/* ---------------- Posts ---------------- */
export function PostCard({ post: initial, onDeleted }: { post: Post; onDeleted?: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [p, setP] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const total = p.poll?.reduce((n, o) => n + o.votes, 0) ?? 0;
  const like = () => app.requireAuth('Sign in to like posts', async () => {
    const on = !p.liked;
    setP({ ...p, liked: on, likes: p.likes + (on ? 1 : -1) });
    const r = await likePost(p.id, on);
    if (r.ok) setP((x) => ({ ...x, likes: r.data }));
  });
  const vote = (idx: number) => app.requireAuth('Sign in to vote', async () => {
    const r = await votePoll(p.id, p.myVote === idx ? null : idx);
    if (r.ok) setP(r.data); else toast(r.error);
  });
  return (
    <article className="post">
      <Link href={`/${p.channel.handle}`}><Avatar channel={p.channel} size={40} /></Link>
      <div className="post-body">
        <div className="post-who"><Link href={`/${p.channel.handle}`}><b>{p.channel.name}</b></Link><Link href={`/post/${p.id}`} className="muted"><Ago ts={p.createdAt} /></Link></div>
        {p.text && <p className="post-text"><RichText text={p.text} /></p>}
        {p.image && <div className="post-image"><img src={p.image} alt="" loading="lazy" decoding="async" /></div>}
        {p.video && (
          <div className="post-video">
            <Link href={watchHref(p.video)}><Thumbnail v={p.video} actions={false} /></Link>
            <div><Link href={watchHref(p.video)} className="v-title">{p.video.title}</Link><div className="v-sub">{formatCount(p.video.views)} views · <Ago ts={p.video.publishedAt} /></div></div>
          </div>
        )}
        {p.poll && (
          <div className="poll">
            <div className="poll-meta">{total.toLocaleString()} vote{total === 1 ? '' : 's'}</div>
            {p.poll.map((o, i) => {
              const pct = total ? Math.round((o.votes / total) * 100) : 0;
              const voted = p.myVote !== null;
              return (
                <button type="button" key={i} className={`poll-option ${p.myVote === i ? 'chosen' : ''}`} onClick={() => vote(i)}>
                  <span className="poll-fill" style={{ width: voted ? `${pct}%` : 0 }} />
                  <span>{p.myVote === i && <Icon name="check_circle" filled size={16} className="poll-check" />}{o.text}</span>
                  {voted && <span>{pct}%</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="post-toolbar">
          <IconButton icon="thumb_up" filled={p.liked} label="Like" onClick={like} />
          <span>{formatCount(p.likes)}</span>
          <Link href={`/post/${p.id}`} className="icon-btn" aria-label="Comments" data-tooltip="Comments"><Icon name="comment" /></Link>
          <span>{p.comments || ''}</span>
          <IconButton icon="share" label="Share" onClick={() => app.open({ kind: 'share', title: `Post by ${p.channel.name}`, path: `/post/${p.id}` })} />
          {app.me?.id === p.channel.id && <IconButton icon="delete" label="Delete post" onClick={() => setConfirm(true)} />}
        </div>
      </div>
      {confirm && <ConfirmDialog title="Delete post?" text="This post will be removed from your channel." onClose={() => setConfirm(false)} onConfirm={async () => {
        const r = await deletePost(p.id);
        if (!r.ok) return toast(r.error);
        setGone(true);
        onDeleted?.();
        toast('Post deleted');
      }} />}
    </article>
  );
}
