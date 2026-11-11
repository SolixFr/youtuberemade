'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { hide, toggleWatchLater } from '@/lib/actions/videos';
import {formatCount, formatDuration, watchHref } from '@/lib/format';
import type { ChannelLite, Video } from '@/lib/types';
import { Ago } from './ago';
import { useApp } from './app-context';
import { Avatar, CheckCircleIcon, Icon, IconButton, Menu, useToast, type MenuItem } from './ui';

export function VerifiedBadge() {
  return <CheckCircleIcon size={14} className="verified" />;
}

export function ChannelName({ channel, className = '' }: { channel: ChannelLite; className?: string }) {
  return (
    <Link href={`/${channel.handle}`} className={`ch-name ${className}`} onClick={(e) => e.stopPropagation()} title={channel.name}>
      {channel.name}{channel.verified && <VerifiedBadge />}
    </Link>
  );
}

function ViewsLine({ v }: { v: Video }) {
  return <span className="views-line">{formatCount(v.views)} views<span className="dot-sep" /><Ago ts={v.publishedAt} /></span>;
}

/** Shared "Watch later" toggle used by cards, menus and the watch page. */
export function useWatchLater() {
  const app = useApp();
  const toast = useToast();
  return (videoId: string) => app.requireAuth('Sign in to save videos to Watch later', async () => {
    const r = await toggleWatchLater(videoId);
    if (r.ok) toast(r.data ? 'Saved to Watch later' : 'Removed from Watch later');
    else toast(r.error);
  });
}

/** Thumbnail with duration, resume bar, and a muted inline preview after hovering. */
export function Thumbnail({ v, preview = true, actions = true }: { v: Video; preview?: boolean; actions?: boolean }) {
  const app = useApp();
  const toast = useToast();
  const watchLater = useWatchLater();
  const [hover, setHover] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pct = v.progress && v.duration ? Math.min(100, (v.progress / v.duration) * 100) : 0;

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
      <img src={v.thumbnail} alt="" loading="lazy" decoding="async" draggable={false} />
      {hover && (
        <video className="thumb-preview" src={v.src} muted playsInline autoPlay loop preload="auto"
          onPlaying={() => setPlaying(true)} onLoadedMetadata={(e) => { if (v.progress) e.currentTarget.currentTime = v.progress; }} />
      )}
      {v.live ? <span className="thumb-live">LIVE</span> : v.type !== 'short' && <span className="duration">{formatDuration(v.duration)}</span>}
      {pct > 1 && <span className="resume"><span style={{ width: `${pct}%` }} /></span>}
      {actions && v.type !== 'short' && (
        <span className="thumb-actions">
          <button type="button" aria-label="Watch later" data-tooltip="Watch later" onClick={(e) => stop(e, () => watchLater(v.id))}><Icon name="schedule" size={20} /></button>
          <button type="button" aria-label="Add to queue" data-tooltip="Add to queue"
            onClick={(e) => stop(e, () => { app.setQueue([...app.queue.filter((x) => x.id !== v.id), { id: v.id, title: v.title }]); toast('Video added to queue'); })}>
            <Icon name="playlist_add" size={20} />
          </button>
        </span>
      )}
    </div>
  );
}

/** The ⋮ menu on every video item. */
export function VideoMenuButton({ v, extra = [], className = '' }: { v: Video; extra?: MenuItem[]; className?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const watchLater = useWatchLater();
  const mine = app.me?.id === v.channel.id;
  const hideIt = (kind: 'video' | 'channel') => app.requireAuth('Sign in to tune your recommendations', async () => {
    const target = kind === 'video' ? v.id : v.channel.id;
    await hide(kind, target, true);
    router.refresh();
    toast(kind === 'video' ? 'Video removed' : 'We won’t recommend this channel to you again', {
      label: 'Undo', run: async () => { await hide(kind, target, false); router.refresh(); },
    });
  });
  const items: MenuItem[] = [
    ...extra,
    ...(v.type !== 'short' ? [{ icon: 'playlist_add', label: 'Add to queue', onSelect: () => { app.setQueue([...app.queue.filter((x) => x.id !== v.id), { id: v.id, title: v.title }]); toast('Video added to queue'); } }] : []),
    { icon: 'schedule', label: 'Save to Watch later', onSelect: () => watchLater(v.id) },
    { icon: 'bookmark', label: 'Save to playlist', onSelect: () => app.requireAuth('Sign in to save videos to playlists', () => app.open({ kind: 'save', videoId: v.id })) },
    { icon: 'share', label: 'Share', onSelect: () => app.open({ kind: 'share', title: v.title, path: watchHref(v) }) },
    { divider: true, label: '' },
    ...(mine
      ? [{ icon: 'edit', label: 'Edit in Studio', onSelect: () => router.push(`/studio/video/${v.id}`) }]
      : [
        { icon: 'block', label: 'Not interested', onSelect: () => hideIt('video') },
        { icon: 'do_not_disturb_on', label: 'Don’t recommend channel', onSelect: () => hideIt('channel') },
        { icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'video', targetId: v.id }) },
      ]),
  ];
  return (
    <>
      <IconButton icon="more_vert" label="Action menu" className={`more ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAnchor(e.currentTarget); }} />
      {anchor && <Menu anchor={anchor} onClose={() => setAnchor(null)} items={items} />}
    </>
  );
}

/** Channel avatar that opens the story viewer when the channel has an active story. */
export function ChannelAvatar({ channel, size = 36 }: { channel: ChannelLite; size?: number }) {
  const app = useApp();
  if (!channel.story) return <Link href={`/${channel.handle}`} onClick={(e) => e.stopPropagation()} className="card-avatar"><Avatar channel={channel} size={size} /></Link>;
  return (
    <button type="button" className="card-avatar" aria-label={`${channel.name}’s story`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); app.openStory(channel.id); }}>
      <Avatar channel={channel} size={size} ring={channel.story} />
    </button>
  );
}

export function VideoCard({ v }: { v: Video }) {
  const router = useRouter();
  const [isNew] = useState(() => Date.now() - v.publishedAt < 2 * 86_400_000);
  return (
    <article className="card" onClick={() => router.push(watchHref(v))}>
      <Link href={watchHref(v)} onClick={(e) => e.stopPropagation()} tabIndex={-1}><Thumbnail v={v} /></Link>
      <div className="card-meta">
        <ChannelAvatar channel={v.channel} />
        <div className="card-text">
          <h3 className="v-title"><Link href={watchHref(v)} onClick={(e) => e.stopPropagation()} title={v.title}>{v.title}</Link></h3>
          <div className="v-sub"><ChannelName channel={v.channel} /><ViewsLine v={v} /></div>
          {isNew && <span className="badge-new">New</span>}
        </div>
        <VideoMenuButton v={v} />
      </div>
    </article>
  );
}

export function CompactCard({ v, active, index, extraMenu, href }: { v: Video; active?: boolean; index?: number; extraMenu?: MenuItem[]; href?: string }) {
  const router = useRouter();
  const to = href ?? watchHref(v);
  return (
    <article className={`compact ${active ? 'active' : ''}`} onClick={() => router.push(to)}>
      {index !== undefined && <span className="compact-index">{active ? <Icon name="play_arrow" size={16} /> : index + 1}</span>}
      <Link href={to} onClick={(e) => e.stopPropagation()} tabIndex={-1}><Thumbnail v={v} actions={false} /></Link>
      <div className="compact-text">
        <h3 className="v-title"><Link href={to} onClick={(e) => e.stopPropagation()}>{v.title}</Link></h3>
        <div className="v-sub"><ChannelName channel={v.channel} /><ViewsLine v={v} /></div>
      </div>
      <VideoMenuButton v={v} extra={extraMenu} />
    </article>
  );
}

export function ListCard({ v, small, extraMenu }: { v: Video; small?: boolean; extraMenu?: MenuItem[] }) {
  const router = useRouter();
  const snippet = v.description.split('\n').find((l) => l.trim()) ?? '';
  return (
    <article className={`list-card ${small ? 'small' : ''}`} onClick={() => router.push(watchHref(v))}>
      <Link href={watchHref(v)} onClick={(e) => e.stopPropagation()} tabIndex={-1}><Thumbnail v={v} /></Link>
      <div className="list-text">
        <h3 className="v-title"><Link href={watchHref(v)} onClick={(e) => e.stopPropagation()}>{v.title}</Link></h3>
        {small ? (
          <div className="v-sub"><ChannelName channel={v.channel} /><ViewsLine v={v} /></div>
        ) : (
          <>
            <div className="v-sub"><ViewsLine v={v} /></div>
            <div className="list-channel"><Avatar channel={v.channel} size={24} /><ChannelName channel={v.channel} /></div>
            <p className="snippet">{snippet}</p>
          </>
        )}
      </div>
      <VideoMenuButton v={v} extra={extraMenu} />
    </article>
  );
}

export function ShortCard({ v }: { v: Video }) {
  const router = useRouter();
  return (
    <article className="short-card" onClick={() => router.push(`/shorts/${v.id}`)}>
      <Thumbnail v={v} preview={false} actions={false} />
      <div className="short-card-meta">
        <div><h3 className="v-title">{v.title}</h3><div className="v-sub">{formatCount(v.views)} views</div></div>
        <VideoMenuButton v={v} />
      </div>
    </article>
  );
}

export function ShortsShelf({ videos }: { videos: Video[] }) {
  if (!videos.length) return null;
  return (
    <section className="shelf">
      <h2 className="shelf-title">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="3.5" fill="var(--brand)" /><path d="M10.5 9v6l4.8-3z" fill="#fff" /></svg>
        Shorts
      </h2>
      <div className="shorts-row">{videos.map((v) => <ShortCard key={v.id} v={v} />)}</div>
    </section>
  );
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return <div className="grid">{videos.map((v) => <VideoCard key={v.id} v={v} />)}</div>;
}
