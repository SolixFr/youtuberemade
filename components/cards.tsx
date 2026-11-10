'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { toggleWatchLater } from '@/lib/actions';
import { formatCount, formatDuration, timeAgo } from '@/lib/format';
import { useMedia } from '@/lib/media';
import { channelOf, hasUnseenStory, update, useDB, useNow } from '@/lib/store';
import type { Video } from '@/lib/types';
import { useApp } from './app-context';
import { Avatar, Icon, IconButton, MediaImg, Menu, useToast, type MenuItem } from './ui';

export const watchHref = (v: Video, extra = '') => (v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}${extra}`);

export function VerifiedBadge() {
  return <Icon name="check_circle" filled size={14} className="verified" />;
}

export function ChannelName({ channelId, className = '' }: { channelId: string; className?: string }) {
  const d = useDB();
  const c = channelOf(d, channelId);
  if (!c) return null;
  return (
    <Link href={`/${c.handle}`} className={`ch-name ${className}`} onClick={(e) => e.stopPropagation()} title={c.name}>
      {c.name}
      {c.verified && <VerifiedBadge />}
    </Link>
  );
}

function ViewsLine({ v }: { v: Video }) {
  return <span className="views-line">{formatCount(v.views)} views<span className="dot-sep" />{timeAgo(v.publishedAt)}</span>;
}

/* Thumbnail with duration badge, resume progress and a muted inline preview on hover. */
export function Thumbnail({ v, preview = true, overlayActions = true }: { v: Video; preview?: boolean; overlayActions?: boolean }) {
  const d = useDB();
  const toast = useToast();
  const app = useApp();
  const [hover, setHover] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const src = useMedia(hover && preview ? v.src : undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progress = d.user.progress[v.id];
  const pct = progress && v.duration ? Math.min(100, (progress / v.duration) * 100) : 0;
  const inWL = d.user.watchLater.includes(v.id);

  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    if (!preview || matchMedia('(hover: none)').matches) return;
    timer.current = setTimeout(() => setHover(true), 650);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setHover(false);
    setPlaying(false);
  };
  const stop = (e: MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div className={`thumb ${v.type === 'short' ? 'vertical' : ''} ${playing ? 'previewing' : ''}`} onMouseEnter={enter} onMouseLeave={leave}>
      <MediaImg src={v.thumbnail} />
      {src && (
        <video ref={ref} className="thumb-preview" src={src} muted playsInline autoPlay loop
          onPlaying={() => setPlaying(true)}
          onLoadedMetadata={(e) => { if (progress) e.currentTarget.currentTime = progress; }} />
      )}
      {v.type !== 'short' && <span className="duration">{formatDuration(v.duration)}</span>}
      {pct > 1 && <span className="resume"><span style={{ width: `${pct}%` }} /></span>}
      {overlayActions && v.type !== 'short' && (
        <span className="thumb-actions">
          <button type="button" aria-label={inWL ? 'Remove from Watch later' : 'Watch later'} data-tooltip={inWL ? 'Added' : 'Watch later'}
            onClick={(e) => stop(e, () => { const on = toggleWatchLater(v.id); toast(on ? 'Saved to Watch later' : 'Removed from Watch later'); })}>
            <Icon name={inWL ? 'check' : 'schedule'} size={20} />
          </button>
          <button type="button" aria-label="Add to queue" data-tooltip="Add to queue"
            onClick={(e) => stop(e, () => { app.setQueue([...app.queue.filter((x) => x !== v.id), v.id]); toast('Video added to queue'); })}>
            <Icon name="playlist_add" size={20} />
          </button>
        </span>
      )}
    </div>
  );
}

/* The ⋮ menu that appears on every video item. */
export function VideoMenuButton({ v, extra = [], className = '' }: { v: Video; extra?: MenuItem[]; className?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const mine = v.channelId === 'me';
  const inWL = d.user.watchLater.includes(v.id);
  const items: MenuItem[] = [
    ...extra,
    ...(v.type !== 'short' ? [{ icon: 'playlist_add', label: 'Add to queue', onSelect: () => { app.setQueue([...app.queue.filter((x) => x !== v.id), v.id]); toast('Video added to queue'); } }] : []),
    { icon: 'schedule', label: inWL ? 'Remove from Watch later' : 'Save to Watch later', onSelect: () => { const on = toggleWatchLater(v.id); toast(on ? 'Saved to Watch later' : 'Removed from Watch later'); } },
    { icon: 'bookmark', label: 'Save to playlist', onSelect: () => app.open({ kind: 'save', videoId: v.id }) },
    { icon: 'share', label: 'Share', onSelect: () => app.open({ kind: 'share', title: v.title, path: watchHref(v) }) },
    { divider: true, label: '' },
    ...(mine
      ? [{ icon: 'edit', label: 'Edit in Studio', onSelect: () => router.push(`/studio/video/${v.id}`) }]
      : [
        { icon: 'block', label: 'Not interested', onSelect: () => { update((db) => { db.user.hiddenVideos.push(v.id); }); toast('Video removed', { label: 'Undo', run: () => update((db) => { db.user.hiddenVideos = db.user.hiddenVideos.filter((x) => x !== v.id); }) }); } },
        { icon: 'do_not_disturb_on', label: "Don't recommend channel", onSelect: () => { update((db) => { db.user.hiddenChannels.push(v.channelId); }); toast("We won't recommend this channel to you again", { label: 'Undo', run: () => update((db) => { db.user.hiddenChannels = db.user.hiddenChannels.filter((x) => x !== v.channelId); }) }); } },
        { icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'video' }) },
      ]),
  ];
  return (
    <>
      <IconButton icon="more_vert" label="Action menu" className={`more ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAnchor(e.currentTarget); }} />
      {anchor && <Menu anchor={anchor} onClose={() => setAnchor(null)} items={items} />}
    </>
  );
}

function StoryAvatar({ channelId, size }: { channelId: string; size: number }) {
  const d = useDB();
  const app = useApp();
  const c = channelOf(d, channelId);
  const unseen = hasUnseenStory(d, channelId);
  if (!c) return null;
  if (unseen === null) {
    return <Link href={`/${c.handle}`} onClick={(e) => e.stopPropagation()} className="card-avatar"><Avatar channel={c} size={size} /></Link>;
  }
  return (
    <button type="button" className="card-avatar" aria-label={`${c.name} story`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); app.openStory(channelId); }}>
      <Avatar channel={c} size={size} ring={unseen ? 'unseen' : 'seen'} />
    </button>
  );
}

export function VideoCard({ v }: { v: Video }) {
  const router = useRouter();
  const now = useNow();
  const isNew = now - v.publishedAt < 2 * 86_400_000;
  return (
    <div className="card" onClick={() => router.push(watchHref(v))}>
      <Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}><Thumbnail v={v} /></Link>
      <div className="card-meta">
        <StoryAvatar channelId={v.channelId} size={36} />
        <div className="card-text">
          <h3 className="v-title"><Link href={watchHref(v)} onClick={(e) => e.stopPropagation()} title={v.title}>{v.title}</Link></h3>
          <div className="v-sub">
            <ChannelName channelId={v.channelId} />
            <ViewsLine v={v} />
          </div>
          {isNew && <span className="badge-new">New</span>}
        </div>
        <VideoMenuButton v={v} />
      </div>
    </div>
  );
}

export function CompactCard({ v, active, index, extraMenu }: { v: Video; active?: boolean; index?: number; extraMenu?: MenuItem[] }) {
  const router = useRouter();
  return (
    <div className={`compact ${active ? 'active' : ''}`} onClick={() => router.push(watchHref(v))}>
      {index !== undefined && <span className="compact-index">{active ? <Icon name="play_arrow" size={16} /> : index + 1}</span>}
      <Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}><Thumbnail v={v} overlayActions={false} /></Link>
      <div className="compact-text">
        <h3 className="v-title"><Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}>{v.title}</Link></h3>
        <div className="v-sub">
          <ChannelName channelId={v.channelId} />
          <ViewsLine v={v} />
        </div>
      </div>
      <VideoMenuButton v={v} extra={extraMenu} />
    </div>
  );
}

export function ListCard({ v, small, extraMenu }: { v: Video; small?: boolean; extraMenu?: MenuItem[] }) {
  const router = useRouter();
  const d = useDB();
  const c = channelOf(d, v.channelId);
  const snippet = v.description.split('\n').find((l) => l.trim()) ?? '';
  return (
    <div className={`list-card ${small ? 'small' : ''}`} onClick={() => router.push(watchHref(v))}>
      <Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}><Thumbnail v={v} /></Link>
      <div className="list-text">
        <h3 className="v-title"><Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}>{v.title}</Link></h3>
        {small ? (
          <div className="v-sub"><ChannelName channelId={v.channelId} /><ViewsLine v={v} /></div>
        ) : (
          <>
            <div className="v-sub"><ViewsLine v={v} /></div>
            <div className="list-channel">{c && <Avatar channel={c} size={24} />}<ChannelName channelId={v.channelId} /></div>
            <p className="snippet">{snippet}</p>
          </>
        )}
      </div>
      <VideoMenuButton v={v} extra={extraMenu} />
    </div>
  );
}

export function ShortCard({ v }: { v: Video }) {
  const router = useRouter();
  return (
    <div className="short-card" onClick={() => router.push(`/shorts/${v.id}`)}>
      <Thumbnail v={v} preview={false} overlayActions={false} />
      <div className="short-card-meta">
        <div>
          <h3 className="v-title">{v.title}</h3>
          <div className="v-sub">{formatCount(v.views)} views</div>
        </div>
        <VideoMenuButton v={v} />
      </div>
    </div>
  );
}

export function ShortsShelf({ videos, title = 'Shorts' }: { videos: Video[]; title?: string }) {
  if (!videos.length) return null;
  return (
    <section className="shelf">
      <h2 className="shelf-title"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3.5" fill="var(--brand)" /><path d="M10.5 9v6l4.8-3z" fill="#fff" /></svg>{title}</h2>
      <div className="shorts-row">{videos.map((v) => <ShortCard key={v.id} v={v} />)}</div>
    </section>
  );
}
