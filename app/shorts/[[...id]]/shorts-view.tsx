'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { VideoMenuButton } from '@/components/cards';
import { Comments, SubscribeButton } from '@/components/social';
import { Avatar, Icon, IconButton, Spinner, useToast } from '@/components/ui';
import { loadComments } from '@/lib/actions/social';
import { rateVideo, recordView, saveProgress } from '@/lib/actions/videos';
import { formatCount } from '@/lib/format';
import type { Comment, Video, ViewerVideoState } from '@/lib/types';

const prefs = { muted: false };

function ShortSlot({ v, state, active, onComments }: { v: Video; state: ViewerVideoState; active: boolean; onComments: () => void }) {
  const app = useApp();
  const toast = useToast();
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(prefs.muted);
  const [progress, setProgress] = useState(0);
  const [rating, setRating] = useState(state.rating);
  const [likes, setLikes] = useState(v.likes);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    el.currentTime = 0;
    el.muted = prefs.muted;
    el.play().catch(() => { el.muted = true; setMuted(true); void el.play().catch(() => {}); });
    void recordView(v.id, 'shorts');
    const started = performance.now();
    return () => {
      el.pause();
      void saveProgress(v.id, 0, (performance.now() - started) / 1000);
    };
  }, [active, v.id]);

  const toggle = () => {
    const el = ref.current;
    if (el) { if (el.paused) void el.play().catch(() => {}); else el.pause(); }
  };
  const rate = (value: 1 | -1) => app.requireAuth('Sign in to rate Shorts', async () => {
    const target = rating === value ? 0 : value;
    setRating(target);
    setLikes(likes + (target === 1 ? 1 : 0) - (rating === 1 ? 1 : 0));
    const r = await rateVideo(v.id, target);
    if (r.ok) setLikes(r.data.likes); else toast(r.error);
  });

  return (
    <div className="short-slot" data-id={v.id}>
      <div className="short-stage">
        <img src={v.thumbnail} alt="" />
        {/* Only the visible Short gets a source, so scrolling past others costs nothing. */}
        <video ref={ref} src={active ? v.src : undefined} loop playsInline preload="auto"
          onPlay={() => setPaused(false)} onPause={() => setPaused(active)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))} />
        <button type="button" className="short-tap" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'} />
        {paused && <div className="short-paused"><Icon name="play_arrow" filled size={40} /></div>}
        <div className="short-top">
          <IconButton icon={paused ? 'play_arrow' : 'pause'} filled label={paused ? 'Play' : 'Pause'} onClick={toggle} />
          <IconButton icon={muted ? 'volume_off' : 'volume_up'} filled label={muted ? 'Unmute' : 'Mute'} onClick={() => { const m = !muted; prefs.muted = m; setMuted(m); if (ref.current) ref.current.muted = m; }} />
        </div>
        <div className="short-info">
          <div className="short-channel">
            <Link href={`/${v.channel.handle}`}><Avatar channel={v.channel} size={36} /></Link>
            <Link href={`/${v.channel.handle}`}>{v.channel.handle}</Link>
            <SubscribeButton channel={v.channel} initial={{ subscribed: state.subscribed, bell: state.bell }} size="sm" />
          </div>
          <div className="short-title">{v.title}</div>
        </div>
        <div className="short-progress"><span style={{ transform: `scaleX(${progress})` }} /></div>
      </div>
      <div className="short-actions">
        <div className="short-action"><IconButton icon="thumb_up" filled={rating === 1} className={rating === 1 ? 'on' : ''} label="Like" onClick={() => rate(1)} /><span>{formatCount(likes)}</span></div>
        <div className="short-action"><IconButton icon="thumb_down" filled={rating === -1} className={rating === -1 ? 'on' : ''} label="Dislike" onClick={() => rate(-1)} /><span>Dislike</span></div>
        <div className="short-action"><IconButton icon="comment" filled label="Comments" onClick={onComments} /><span>Comments</span></div>
        <div className="short-action"><IconButton icon="share" filled label="Share" onClick={() => app.open({ kind: 'share', title: v.title, path: `/shorts/${v.id}` })} /><span>Share</span></div>
        <div className="short-action"><VideoMenuButton v={v} className="short-more" /></div>
      </div>
    </div>
  );
}

function CommentsPanel({ video, onClose }: { video: Video; onClose: () => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  useEffect(() => { loadComments(video.id).then((r) => setList(r.ok ? r.data : [])); }, [video.id]);
  return (
    <aside className="shorts-comments">
      <div className="shorts-comments-head"><h2>Comments {list && <span className="muted">{list.length}</span>}</h2><IconButton icon="close" label="Close" onClick={onClose} /></div>
      <div className="shorts-comments-body">
        {list ? <Comments videoId={video.id} owner={video.channel} initial={list} compact /> : <div className="center-pad"><Spinner /></div>}
      </div>
    </aside>
  );
}

export function ShortsView({ shorts }: { shorts: { video: Video; state: ViewerVideoState }[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(shorts[0].video.id);
  const [commentsFor, setCommentsFor] = useState<Video | null>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = (e.target as HTMLElement).dataset.id!;
        setActive(id);
        window.history.replaceState(window.history.state, '', `/shorts/${id}`);
      }
    }, { root, threshold: 0.6 });
    root.querySelectorAll('.short-slot').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName)) return;
      const el = scroller.current;
      if (!el) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); el.scrollBy({ top: el.clientHeight, behavior: 'smooth' }); }
      if (e.key === 'ArrowUp') { e.preventDefault(); el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' }); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const step = (dir: number) => scroller.current?.scrollBy({ top: dir * scroller.current.clientHeight, behavior: 'smooth' });
  return (
    <>
      <div className="shorts-page" ref={scroller}>
        {shorts.map(({ video, state }) => (
          <ShortSlot key={video.id} v={video} state={state} active={video.id === active} onComments={() => setCommentsFor(commentsFor?.id === video.id ? null : video)} />
        ))}
      </div>
      {commentsFor && <CommentsPanel key={commentsFor.id} video={commentsFor} onClose={() => setCommentsFor(null)} />}
      <div className="shorts-nav">
        <IconButton icon="arrow_upward" label="Previous video" onClick={() => step(-1)} />
        <IconButton icon="arrow_downward" label="Next video" onClick={() => step(1)} />
      </div>
    </>
  );
}
