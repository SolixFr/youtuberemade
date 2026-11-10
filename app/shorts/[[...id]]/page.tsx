'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { VideoMenuButton } from '@/components/cards';
import { Comments, SubscribeButton } from '@/components/social';
import { Avatar, EmptyState, Icon, IconButton, MediaImg } from '@/components/ui';
import { rateVideo, recordWatch, logWatchTime } from '@/lib/actions';
import { formatCount } from '@/lib/format';
import { useMedia } from '@/lib/media';
import { channelOf, feedVideos, useDB, videoOf } from '@/lib/store';
import type { Video } from '@/lib/types';

const shortPrefs = { muted: false };

function ShortSlot({ v, active, onComments }: { v: Video; active: boolean; onComments: () => void }) {
  const d = useDB();
  const app = useApp();
  const src = useMedia(active ? v.src : undefined);
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(shortPrefs.muted);
  const [progress, setProgress] = useState(0);
  const c = channelOf(d, v.channelId);
  const liked = d.user.liked.includes(v.id);
  const disliked = d.user.disliked.includes(v.id);
  const commentCount = d.comments.filter((x) => x.videoId === v.id).length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.currentTime = 0;
      el.muted = shortPrefs.muted;
      el.play().catch(() => { el.muted = true; setMuted(true); el.play().catch(() => {}); });
      recordWatch(v.id);
    } else el.pause();
    const start = performance.now();
    return () => {
      if (active) logWatchTime(v.id, (performance.now() - start) / 1000);
    };
  }, [active, src, v.id]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };

  return (
    <div className="short-slot" data-id={v.id}>
      <div className="short-stage">
        <MediaImg src={v.thumbnail} />
        {src && <video ref={ref} src={src} loop playsInline preload="auto" onPlay={() => setPaused(false)} onPause={() => setPaused(active)} onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} />}
        <div className="short-tap" onClick={toggle} />
        {paused && <div className="short-paused"><Icon name="play_arrow" filled size={40} /></div>}
        <div className="short-top">
          <IconButton icon={paused ? 'play_arrow' : 'pause'} filled label={paused ? 'Play' : 'Pause'} onClick={toggle} />
          <IconButton icon={muted ? 'volume_off' : 'volume_up'} filled label={muted ? 'Unmute' : 'Mute'} onClick={() => { const m = !muted; shortPrefs.muted = m; setMuted(m); if (ref.current) ref.current.muted = m; }} />
        </div>
        <div className="short-info">
          {c && (
            <div className="short-channel">
              <Link href={`/${c.handle}`}><Avatar channel={c} size={36} /></Link>
              <Link href={`/${c.handle}`}>{c.handle}</Link>
              <SubscribeButton channelId={c.id} size="sm" />
            </div>
          )}
          <div className="short-title">{v.title}</div>
        </div>
        <div className="short-progress"><span style={{ width: `${progress * 100}%` }} /></div>
      </div>
      <div className="short-actions">
        <div className="short-action"><IconButton icon="thumb_up" filled={liked} className={liked ? 'on' : ''} label="Like" onClick={() => rateVideo(v.id, 'like')} /><span>{formatCount(v.likes)}</span></div>
        <div className="short-action"><IconButton icon="thumb_down" filled={disliked} className={disliked ? 'on' : ''} label="Dislike" onClick={() => rateVideo(v.id, 'dislike')} /><span>Dislike</span></div>
        <div className="short-action"><IconButton icon="comment" filled label="Comments" onClick={onComments} /><span>{commentCount}</span></div>
        <div className="short-action"><IconButton icon="share" filled label="Share" onClick={() => app.open({ kind: 'share', title: v.title, path: `/shorts/${v.id}` })} /><span>Share</span></div>
        <div className="short-action"><VideoMenuButton v={v} className="short-more" /></div>
        {c && <Link href={`/${c.handle}`} className="short-channel-tile" aria-label={c.name}><MediaImg src={c.avatar} /></Link>}
      </div>
    </div>
  );
}

export default function ShortsPage() {
  const params = useParams<{ id?: string[] }>();
  const startId = params.id?.[0];
  const d = useDB();
  const scroller = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const shorts = feedVideos(d).filter((v) => v.type === 'short').sort((a, b) => b.publishedAt - a.publishedAt);
    const start = videoOf(d, startId);
    if (start && start.type === 'short') return [start, ...shorts.filter((v) => v.id !== start.id)];
    return shorts;
    // Order is fixed for the visit so the feed doesn't reshuffle while you scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId]);
  const [active, setActive] = useState(list[0]?.id);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          const id = (e.target as HTMLElement).dataset.id!;
          setActive(id);
          window.history.replaceState(null, '', `/shorts/${id}`);
        }
      }
    }, { root, threshold: [0.6] });
    root.querySelectorAll('.short-slot').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [list]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      const el = scroller.current;
      if (!el) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); el.scrollBy({ top: el.clientHeight, behavior: 'smooth' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' }); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  if (!list.length) return <EmptyState icon="video_library" title="No Shorts yet" text="Upload a vertical video to see it here." />;
  const commentsVideo = videoOf(d, commentsFor);

  return (
    <>
      <div className="shorts-page" ref={scroller} tabIndex={-1}>
        {list.map((v) => <ShortSlot key={v.id} v={v} active={v.id === active} onComments={() => setCommentsFor(commentsFor === v.id ? null : v.id)} />)}
      </div>
      {commentsVideo && (
        <aside className="shorts-comments">
          <div className="shorts-comments-head"><h2>Comments <span className="muted">{d.comments.filter((x) => x.videoId === commentsVideo.id).length}</span></h2><IconButton icon="close" label="Close" onClick={() => setCommentsFor(null)} /></div>
          <div className="shorts-comments-body"><Comments videoId={commentsVideo.id} compact /></div>
        </aside>
      )}
      <div className="shorts-nav">
        <IconButton icon="arrow_upward" label="Previous video" onClick={() => scroller.current?.scrollBy({ top: -scroller.current.clientHeight, behavior: 'smooth' })} />
        <IconButton icon="arrow_downward" label="Next video" onClick={() => scroller.current?.scrollBy({ top: scroller.current.clientHeight, behavior: 'smooth' })} />
      </div>
    </>
  );
}
