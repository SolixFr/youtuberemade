'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { setBell, setSubscribed } from '@/lib/actions';
import { formatCount, timeAgo, uid } from '@/lib/format';
import { channelOf, myChannel, update, useDB, videoOf } from '@/lib/store';
import type { Comment, Post } from '@/lib/types';
import { useApp } from './app-context';
import { Thumbnail, watchHref } from './cards';
import { Avatar, Button, ConfirmDialog, Icon, IconButton, MediaImg, Menu, useToast } from './ui';

/* ---------------- Subscribe ---------------- */
export function SubscribeButton({ channelId, size = 'md' }: { channelId: string; size?: 'sm' | 'md' }) {
  const d = useDB();
  const toast = useToast();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const c = channelOf(d, channelId);
  if (!c) return null;
  if (c.isMine) {
    return (
      <div className="row-wrap" style={{ margin: 0 }}>
        <Link href="/studio/customization" className={`btn btn-tonal btn-${size}`}>Customize channel</Link>
        <Link href="/studio/content" className={`btn btn-tonal btn-${size}`}>Manage videos</Link>
      </div>
    );
  }
  const subbed = d.user.subscriptions.includes(channelId);
  if (!subbed) {
    return <Button variant="filled" size={size} className="subscribe-btn" onClick={() => { setSubscribed(channelId, true); toast('Subscription added'); }}>Subscribe</Button>;
  }
  const bell = d.user.bells[channelId] ?? 'personalized';
  const bellIcon = bell === 'all' ? 'notifications_active' : bell === 'none' ? 'notifications_off' : 'notifications';
  return (
    <>
      <button type="button" className={`btn btn-tonal btn-${size} subscribe-btn`} onClick={(e) => setAnchor(e.currentTarget)}>
        <Icon name={bellIcon} size={size === 'sm' ? 20 : 24} /><span className="btn-label">Subscribed</span><Icon name="expand_more" size={20} style={{ marginRight: -6 }} />
      </button>
      {anchor && (
        <Menu anchor={anchor} align="left" onClose={() => setAnchor(null)} items={[
          { icon: 'notifications_active', label: 'All', checked: bell === 'all', onSelect: () => { setBell(channelId, 'all'); toast("You'll get all notifications"); } },
          { icon: 'notifications', label: 'Personalized', checked: bell === 'personalized', onSelect: () => { setBell(channelId, 'personalized'); toast("You'll get personalized notifications"); } },
          { icon: 'notifications_off', label: 'None', checked: bell === 'none', onSelect: () => { setBell(channelId, 'none'); toast("You won't get notifications"); } },
          { icon: 'person_remove', label: 'Unsubscribe', onSelect: () => setConfirm(true) },
        ]} />
      )}
      {confirm && <ConfirmDialog title="" text={`Unsubscribe from ${c.name}?`} confirm="Unsubscribe" onClose={() => setConfirm(false)}
        onConfirm={() => { setSubscribed(channelId, false); toast('Subscription removed'); }} />}
    </>
  );
}

/* ---------------- Rich text: timestamps and hashtags ---------------- */
export function RichText({ text, onSeek }: { text: string; onSeek?: (t: number) => void }) {
  const parts: ReactNode[] = [];
  const re = /(\b(?:\d+:)?\d{1,2}:\d{2}\b)|(#[\p{L}\d_]+)|(https?:\/\/[^\s]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] && onSeek) {
      const segs = m[1].split(':').map(Number);
      const secs = segs.reduce((a, b) => a * 60 + b, 0);
      parts.push(<button type="button" key={i++} className="ts-link" onClick={(e) => { e.stopPropagation(); onSeek(secs); }}>{m[1]}</button>);
    } else if (m[2]) {
      parts.push(<Link key={i++} className="hashtag" href={`/results?search_query=${encodeURIComponent(m[2])}`} onClick={(e) => e.stopPropagation()}>{m[2]}</Link>);
    } else if (m[3]) {
      parts.push(<a key={i++} className="hashtag" href={m[3]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{m[3].replace(/^https?:\/\//, '')}</a>);
    } else parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/* ---------------- Comments ---------------- */
function CommentComposer({ placeholder, onSubmit, onCancel, autoFocus, small }: { placeholder: string; onSubmit: (t: string) => void; onCancel?: () => void; autoFocus?: boolean; small?: boolean }) {
  const d = useDB();
  const [text, setText] = useState('');
  const [active, setActive] = useState(!!autoFocus);
  return (
    <div className={`c-composer ${small ? 'reply' : ''}`}>
      <Avatar channel={myChannel(d)} size={small ? 24 : 40} />
      <div className="c-field">
        <textarea className="line-input" rows={1} value={text} placeholder={placeholder} autoFocus={autoFocus}
          onFocus={() => setActive(true)}
          onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }} />
        {active && (
          <div className="c-actions">
            <Button variant="text" onClick={() => { setText(''); setActive(false); onCancel?.(); }}>Cancel</Button>
            <Button variant="blue" disabled={!text.trim()} onClick={() => { onSubmit(text.trim()); setText(''); setActive(!!small); }}>{small ? 'Reply' : 'Comment'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ c, replies, videoOwner, onSeek }: { c: Comment; replies: Comment[]; videoOwner: string; onSeek?: (t: number) => void }) {
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.text);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  const owner = channelOf(d, videoOwner);
  const iOwnVideo = videoOwner === 'me';
  const liked = d.user.likedComments.includes(c.id);
  const disliked = d.user.dislikedComments.includes(c.id);
  const me = myChannel(d);
  const authorAvatar = c.mine ? <Avatar channel={me} size={c.parentId ? 24 : 40} /> : c.byCreator && owner ? <Avatar channel={owner} size={c.parentId ? 24 : 40} /> : <Avatar name={c.author} size={c.parentId ? 24 : 40} />;
  const likes = c.likes + (liked ? 1 : 0);
  const rate = (kind: 'like' | 'dislike') => update((db) => {
    db.user.likedComments = db.user.likedComments.filter((x) => x !== c.id);
    db.user.dislikedComments = db.user.dislikedComments.filter((x) => x !== c.id);
    if (kind === 'like' && !liked) db.user.likedComments.push(c.id);
    if (kind === 'dislike' && !disliked) db.user.dislikedComments.push(c.id);
  });
  return (
    <div className={`comment ${c.parentId ? 'reply' : ''}`}>
      {authorAvatar}
      <div className="c-body">
        {c.pinned && owner && <div className="c-pinned"><Icon name="push_pin" size={16} />Pinned by {owner.handle}</div>}
        <div className={`c-who ${c.byCreator ? 'creator' : ''}`}>
          <span>{c.mine ? me.handle : c.author}</span>
          {c.byCreator && owner?.verified && <Icon name="check_circle" filled size={14} className="verified" />}
          <span className="c-when">{timeAgo(c.createdAt)}{c.edited ? ' (edited)' : ''}</span>
        </div>
        {editing ? (
          <div>
            <textarea className="line-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="c-actions"><Button variant="text" onClick={() => { setEditing(false); setDraft(c.text); }}>Cancel</Button>
              <Button variant="blue" disabled={!draft.trim()} onClick={() => { update((db) => { const x = db.comments.find((y) => y.id === c.id); if (x) { x.text = draft.trim(); x.edited = true; } }); setEditing(false); }}>Save</Button></div>
          </div>
        ) : <div className="c-text"><RichText text={c.text} onSeek={onSeek} /></div>}
        <div className="c-toolbar">
          <IconButton icon="thumb_up" filled={liked} label="Like" onClick={() => rate('like')} />
          <span>{likes ? formatCount(likes) : ''}</span>
          <IconButton icon="thumb_down" filled={disliked} label="Dislike" onClick={() => rate('dislike')} />
          {c.hearted && owner && <span className="c-heart" title={`❤ by ${owner.name}`}><Avatar channel={owner} size={16} /><Icon name="favorite" filled size={14} className="heart" /></span>}
          <Button variant="text" onClick={() => setReplying(true)}>Reply</Button>
          <span className="grow" />
          <IconButton icon="more_vert" label="Action menu" onClick={(e) => setAnchor(e.currentTarget)} />
        </div>
        {replying && (
          <CommentComposer small autoFocus placeholder="Add a reply..." onCancel={() => setReplying(false)}
            onSubmit={(t) => { update((db) => { db.comments.push({ id: uid('c'), videoId: c.videoId, parentId: c.parentId ?? c.id, author: me.handle, mine: true, byCreator: iOwnVideo, text: t, createdAt: Date.now(), likes: 0 }); }); setReplying(false); setOpen(true); }} />
        )}
        {replies.length > 0 && (
          <>
            <button type="button" className="replies-toggle" onClick={() => setOpen(!open)}><Icon name={open ? 'expand_less' : 'expand_more'} />{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</button>
            {open && replies.map((r) => <CommentItem key={r.id} c={r} replies={[]} videoOwner={videoOwner} onSeek={onSeek} />)}
          </>
        )}
      </div>
      {anchor && (
        <Menu anchor={anchor} onClose={() => setAnchor(null)} sheet items={[
          ...(iOwnVideo && !c.parentId ? [
            { icon: 'push_pin', label: c.pinned ? 'Unpin' : 'Pin', onSelect: () => update((db) => { db.comments.forEach((x) => { if (x.videoId === c.videoId) x.pinned = x.id === c.id ? !c.pinned : false; }); }) },
          ] : []),
          ...(iOwnVideo ? [{ icon: 'favorite', label: c.hearted ? 'Remove heart' : 'Heart', onSelect: () => update((db) => { const x = db.comments.find((y) => y.id === c.id); if (x) x.hearted = !x.hearted; }) }] : []),
          ...(c.mine || iOwnVideo ? [] : [{ icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'comment' }) }]),
          ...(c.mine ? [{ icon: 'edit', label: 'Edit', onSelect: () => setEditing(true) }] : []),
          ...(c.mine || iOwnVideo ? [{ icon: 'delete', label: iOwnVideo && !c.mine ? 'Remove' : 'Delete', onSelect: () => setConfirm(true) }] : []),
        ]} />
      )}
      {confirm && <ConfirmDialog title="Delete comment" text="Delete this comment permanently?" onClose={() => setConfirm(false)}
        onConfirm={() => { update((db) => { db.comments = db.comments.filter((x) => x.id !== c.id && x.parentId !== c.id); }); toast('Comment deleted'); }} />}
    </div>
  );
}

export function Comments({ videoId, onSeek, compact }: { videoId: string; onSeek?: (t: number) => void; compact?: boolean }) {
  const d = useDB();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const v = videoOf(d, videoId);
  if (!v) return null;
  const all = d.comments.filter((c) => c.videoId === videoId);
  const top = all.filter((c) => !c.parentId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === 'top' ? b.likes - a.likes || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
  const me = myChannel(d);
  return (
    <div>
      {!compact && (
        <div className="c-head">
          <h2>{all.length.toLocaleString()} Comments</h2>
          <Button variant="text" icon="sort" onClick={(e) => setAnchor(e.currentTarget)}>Sort by</Button>
        </div>
      )}
      <CommentComposer placeholder="Add a comment..." onSubmit={(t) => update((db) => {
        db.comments.push({ id: uid('c'), videoId, author: me.handle, mine: true, byCreator: v.channelId === 'me', text: t, createdAt: Date.now(), likes: 0 });
      })} />
      {top.map((c) => <CommentItem key={c.id} c={c} replies={all.filter((r) => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt)} videoOwner={v.channelId} onSeek={onSeek} />)}
      {!top.length && <p className="muted">No comments yet. Start the conversation.</p>}
      {anchor && <Menu anchor={anchor} onClose={() => setAnchor(null)} align="left" sheet={false} items={[
        { label: 'Top comments', checked: sort === 'top', onSelect: () => setSort('top') },
        { label: 'Newest first', checked: sort === 'new', onSelect: () => setSort('new') },
      ]} />}
    </div>
  );
}

/* ---------------- Posts ---------------- */
export function PostCard({ p }: { p: Post }) {
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const c = channelOf(d, p.channelId);
  if (!c) return null;
  const liked = d.user.likedPosts.includes(p.id);
  const vote = d.user.votes[p.id];
  const total = p.poll ? p.poll.reduce((n, o) => n + o.votes, 0) + (vote !== undefined ? 1 : 0) : 0;
  const v = videoOf(d, p.videoId);
  const commentCount = d.postComments.filter((x) => x.postId === p.id).length;
  return (
    <article className="post">
      <Link href={`/${c.handle}`}><Avatar channel={c} size={40} /></Link>
      <div className="post-body">
        <div className="post-who"><Link href={`/${c.handle}`}><b>{c.name}</b></Link><Link href={`/post/${p.id}`} className="muted">{timeAgo(p.createdAt)}</Link></div>
        {p.text && <p className="post-text"><RichText text={p.text} /></p>}
        {p.image && <div className="post-image"><MediaImg src={p.image} /></div>}
        {v && (
          <div className="post-video">
            <Link href={watchHref(v)}><Thumbnail v={v} overlayActions={false} /></Link>
            <div><Link href={watchHref(v)} className="v-title">{v.title}</Link><div className="v-sub">{formatCount(v.views)} views · {timeAgo(v.publishedAt)}</div></div>
          </div>
        )}
        {p.poll && (
          <div>
            <div className="poll-meta">{total.toLocaleString()} vote{total === 1 ? '' : 's'}</div>
            {p.poll.map((o, i) => {
              const n = o.votes + (vote === i ? 1 : 0);
              const pct = total ? Math.round((n / total) * 100) : 0;
              return (
                <button type="button" key={o.text} className={`poll-option ${vote === i ? 'chosen' : ''}`}
                  onClick={() => update((db) => { if (db.user.votes[p.id] === i) delete db.user.votes[p.id]; else db.user.votes[p.id] = i; })}>
                  {vote !== undefined && <span className="poll-fill" style={{ width: `${pct}%` }} />}
                  <span>{vote === i && <Icon name="check_circle" filled size={16} style={{ marginRight: 6, verticalAlign: -3 }} />}{o.text}</span>
                  {vote !== undefined && <span>{pct}%</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="post-toolbar">
          <IconButton icon="thumb_up" filled={liked} label="Like" onClick={() => update((db) => { db.user.likedPosts = liked ? db.user.likedPosts.filter((x) => x !== p.id) : [...db.user.likedPosts, p.id]; })} />
          <span>{formatCount(p.likes + (liked ? 1 : 0))}</span>
          <Link href={`/post/${p.id}`} className="icon-btn" style={{ width: 36, height: 36, marginLeft: 8 }} aria-label="Comments" data-tooltip="Comments"><Icon name="comment" /></Link>
          <span>{commentCount || ''}</span>
          <IconButton icon="share" label="Share" onClick={() => app.open({ kind: 'share', title: `Post by ${c.name}`, path: `/post/${p.id}` })} />
          {p.channelId === 'me' && <IconButton icon="delete" label="Delete post" onClick={() => setConfirm(true)} />}
        </div>
      </div>
      {confirm && <ConfirmDialog title="Delete post?" text="This post will be removed from your channel." onClose={() => setConfirm(false)}
        onConfirm={() => { update((db) => { db.posts = db.posts.filter((x) => x.id !== p.id); }); toast('Post deleted'); }} />}
    </article>
  );
}
