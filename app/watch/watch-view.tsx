'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Ago } from '@/components/ago';
import { useApp } from '@/components/app-context';
import { ChannelAvatar, CompactCard, Thumbnail, VerifiedBadge, useWatchLater } from '@/components/cards';
import { Player, type PlayerHandle } from '@/components/player';
import { Comments, RichText, SubscribeButton } from '@/components/social';
import { BottomSheet } from '@/components/bottom-sheet';
import { CommentsSheet } from './comments-sheet';
import { Avatar, Button, Chips, Icon, IconButton, Menu, useIsMobile, useToast } from '@/components/ui';
import { setSubscribed, updateSettings } from '@/lib/actions/channels';
import { rateVideo, recordView } from '@/lib/actions/videos';
import { formatCount, formatDate, formatDuration, parseChapters } from '@/lib/format';
import type { Comment, Video, ViewerVideoState } from '@/lib/types';

function viewKey(): string {
  try {
    let k = sessionStorage.getItem('vidora-view');
    if (!k) { k = crypto.randomUUID(); sessionStorage.setItem('vidora-view', k); }
    return k;
  } catch {
    return 'anon';
  }
}

function UpNext({ next, onPlay, onCancel }: { next: Video; onPlay: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(8);
  useEffect(() => {
    if (left <= 0) { onPlay(); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onPlay]);
  return (
    <div className="p-end">
      <span className="p-end-label">Up next in {left}</span>
      <div className="p-end-card">
        <Thumbnail v={next} preview={false} actions={false} />
        <div><b>{next.title}</b><span>{next.channel.name} · {formatCount(next.views)} views</span></div>
      </div>
      <div className="btn-row">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="filled" className="on-media-light" onClick={onPlay}>Play now</Button>
      </div>
    </div>
  );
}

export function WatchView({ video: v, state, comments, related, playlist, startAt, clip, autoplayNext: initialAutoplay, watermark }: {
  video: Video; state: ViewerVideoState; comments: Comment[]; related: Video[];
  playlist: { id: string; title: string; videos: Video[] } | null; startAt?: number; clip?: { start: number; end: number }; autoplayNext: boolean;
  watermark?: { src: string; display: 'end' | 'custom' | 'full'; start: number; channelName: string; handle: string } | null;
}) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const mobile = useIsMobile();
  const watchLater = useWatchLater();
  const player = useRef<PlayerHandle>(null);
  const time = useRef(0);
  const [theater, setTheater] = useState(() => { try { return localStorage.getItem('vidora-theater') === '1'; } catch { return false; } });
  const [descOpen, setDescOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [rating, setRating] = useState(state.rating);
  const [likes, setLikes] = useState(v.likes);
  const [subs, setSubs] = useState(v.channel.subscribers);
  const [autoplay, setAutoplay] = useState(initialAutoplay);
  const [likeBurst, setLikeBurst] = useState(0);
  const [dislikeBurst, setDislikeBurst] = useState(0);
  const [nearEnd, setNearEnd] = useState(false);
  const [wmSubbed, setWmSubbed] = useState(state.subscribed);
  const wmVisible = !!watermark && !wmSubbed && app.me?.id !== v.channel.id && (watermark.display === 'full' || nearEnd || ended);
  const onTimeTick = (t: number) => { time.current = t; if (watermark && watermark.display !== 'full') setNearEnd(t >= (watermark.display === 'custom' ? watermark.start : v.duration - 8)); };
  const subscribeFromWm = async () => {
    if (!app.me) { router.push(`/signin?next=${encodeURIComponent(`/watch?v=${v.id}`)}`); return; }
    const r = await setSubscribed(v.channel.id, true);
    if (!r.ok) return toast(r.error);
    setSubs(r.data);
    setWmSubbed(true);
    toast(`You’re subscribed to ${watermark!.channelName}`);
  };

  useEffect(() => {
    void recordView(v.id, viewKey());
    window.scrollTo(0, 0);
  }, [v.id]);

  const list = filter === 'channel' ? related.filter((x) => x.channel.id === v.channel.id)
    : filter === 'topic' ? related.filter((x) => x.topic === v.topic)
      : filter === 'recent' ? [...related].sort((a, b) => b.publishedAt - a.publishedAt) : related;

  const next = (() => {
    if (app.queue.length) return related.find((x) => x.id === app.queue[0].id) ?? null;
    if (playlist) {
      const i = playlist.videos.findIndex((x) => x.id === v.id);
      if (i >= 0 && i + 1 < playlist.videos.length) return playlist.videos[i + 1];
    }
    return related[0] ?? null;
  })();
  const nextHref = (() => {
    if (app.queue.length) return `/watch?v=${app.queue[0].id}`;
    if (!next) return null;
    return `/watch?v=${next.id}${playlist?.videos.some((x) => x.id === next.id) ? `&list=${playlist.id}` : ''}`;
  })();
  const goNext = () => {
    if (!nextHref) return;
    if (app.queue.length) app.setQueue(app.queue.slice(1));
    router.push(nextHref);
  };

  const rate = (value: 1 | -1) => app.requireAuth(value === 1 ? 'Like this video?' : 'Don’t like this video?', async () => {
    if (value === 1) setLikeBurst((n) => n + 1); else setDislikeBurst((n) => n + 1);
    const target = rating === value ? 0 : value;
    const prev = { rating, likes };
    setRating(target);
    setLikes(likes + (target === 1 ? 1 : 0) - (rating === 1 ? 1 : 0));
    const r = await rateVideo(v.id, target);
    if (!r.ok) { setRating(prev.rating); setLikes(prev.likes); return toast(r.error); }
    setLikes(r.data.likes);
    if (value === 1) toast(target === 1 ? 'Added to Liked videos' : 'Removed from Liked videos');
  });

  const chapters = parseChapters(v.description, v.duration);
  const seek = (t: number) => { player.current?.seek(t); player.current?.play(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const download = () => {
    const a = document.createElement('a');
    a.href = v.src;
    a.download = `${v.title.replace(/[\\/:*?"<>|]+/g, '')}.mp4`;
    a.click();
  };
  const topComment = comments.filter((c) => !c.parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.likes - a.likes)[0];
  const owner = { id: v.channel.id, handle: v.channel.handle, name: v.channel.name, avatar: v.channel.avatar };

  // Seeking from the description sheet also closes the sheet; on desktop it just seeks.
  const seeker = (t: number) => { seek(t); if (mobile && descOpen) setDescOpen(false); };
  const description = (
    <div className={`description ${descOpen ? 'open' : ''}`} onClick={() => !descOpen && setDescOpen(true)}>
      <div className="desc-stats">
        <span>{descOpen ? `${v.views.toLocaleString()} views` : `${formatCount(v.views)} views`}</span>
        <span>{descOpen ? formatDate(v.publishedAt) : <Ago ts={v.publishedAt} />}</span>
        {v.visibility !== 'public' && <span className="muted"><Icon name={v.visibility === 'private' ? 'lock' : 'link'} size={16} className="inline-icon" /> {v.visibility}</span>}
      </div>
      <div className="desc-body"><RichText text={(descOpen ? v.description : v.description.split('\n\n')[0]) || 'No description has been added to this video.'} onSeek={seeker} /></div>
      {descOpen && chapters.length > 0 && (
        <div className="desc-section"><h3>Chapters</h3>
          <div className="chapter-list">{chapters.map((ch) => <button type="button" key={ch.t} className="chapter-btn" onClick={() => seeker(ch.t)}><b>{ch.title}</b><span className="link">{formatDuration(ch.t)}</span></button>)}</div>
        </div>
      )}
      {descOpen && v.credit && <div className="desc-section"><h3>Source</h3><a className="link" href={v.credit.url} target="_blank" rel="noopener noreferrer">{v.credit.label}</a></div>}
      {descOpen && (
        <div className="desc-channel">
          <Link href={`/${v.channel.handle}`}><Avatar channel={v.channel} size={48} /></Link>
          <div><Link href={`/${v.channel.handle}`} className="w-owner-name">{v.channel.name}</Link><div className="muted small">{formatCount(subs)} subscribers</div></div>
          <span className="grow" />
          <Link className="btn btn-outline btn-md" href={`/${v.channel.handle}/videos`}><Icon name="smart_display" />Videos</Link>
        </div>
      )}
      <button type="button" className="desc-more" onClick={(e) => { e.stopPropagation(); setDescOpen(!descOpen); }}>{descOpen ? 'Show less' : '…more'}</button>
    </div>
  );

  return (
    <div className={`watch ${theater && !mobile ? 'theater' : ''}`}>
      <div className="watch-primary">
        <div className="watch-player">
          <Player ref={player} video={v} hotkeys startAt={startAt} clip={clip} theater={theater}
            autoplayNext={autoplay}
            onAutoplayNext={(on) => { setAutoplay(on); if (app.me) void updateSettings({ autoplay: on }); }}
            onTheater={() => { const t = !theater; setTheater(t); try { localStorage.setItem('vidora-theater', t ? '1' : '0'); } catch { /* storage blocked */ } }}
            onMini={(t, playing) => { app.setMini({ videoId: v.id, title: v.title, channelName: v.channel.name, src: v.src, captions: v.captions, duration: v.duration, time: t, playing }); router.push('/'); }}
            onNext={nextHref ? goNext : undefined}
            onTime={(t) => onTimeTick(t)}
            onEnded={() => { if (!autoplay || clip) return; if (next) setEnded(true); else if (nextHref) goNext(); }} />
          {wmVisible && (
            <button type="button" className="wm-btn" aria-label={`Subscribe to ${watermark!.channelName}`} data-tooltip={`Subscribe to ${watermark!.channelName}`} onClick={subscribeFromWm}>
              <img src={watermark!.src} alt="" />
            </button>
          )}
          {ended && next && <UpNext next={next} onPlay={goNext} onCancel={() => setEnded(false)} />}
        </div>
        <div className="watch-info">
          <h1 className="w-title">{v.title}</h1>
          <div className="w-meta-mobile">{formatCount(v.views)} views · <Ago ts={v.publishedAt} /> <button type="button" onClick={() => setDescOpen(true)}>…more</button></div>
          <div className="w-actions">
            <div className="w-owner">
              <ChannelAvatar channel={v.channel} size={40} />
              <div className="w-owner-text">
                <Link href={`/${v.channel.handle}`} className="w-owner-name ch-name">{v.channel.name}{v.channel.verified && <VerifiedBadge />}</Link>
                <div className="w-owner-subs">{formatCount(subs)} subscribers</div>
              </div>
              <SubscribeButton channel={v.channel} initial={{ subscribed: state.subscribed, bell: state.bell }} onCount={setSubs} />
            </div>
            <div className="w-buttons">
              <div className="seg">
                <button type="button" aria-label="Like this video" aria-pressed={rating === 1} data-tooltip="I like this" onClick={() => rate(1)}><Icon key={likeBurst} name="thumb_up" filled={rating === 1} className={likeBurst ? 'seg-burst' : ''} />{formatCount(likes)}</button>
                <button type="button" aria-label="Dislike this video" aria-pressed={rating === -1} data-tooltip="I dislike this" onClick={() => rate(-1)}><Icon key={dislikeBurst} name="thumb_down" filled={rating === -1} className={dislikeBurst ? 'seg-burst' : ''} /></button>
              </div>
              <Button icon="share" data-tooltip="Share" aria-label="Share" onClick={() => app.open({ kind: 'share', title: v.title, path: `/watch?v=${v.id}`, startAt: time.current })} />
              <Button icon="download" data-tooltip="Download" aria-label="Download" onClick={download} />
              <Button icon="content_cut" data-tooltip="Clip" aria-label="Clip" onClick={() => app.open({ kind: 'clip', videoId: v.id, at: time.current, duration: v.duration, title: v.title })} />
              <Button icon="playlist_add" data-tooltip="Save" aria-label="Save" onClick={() => app.requireAuth('Sign in to save this video', () => app.open({ kind: 'save', videoId: v.id }))} />
              <Button icon="more_horiz" aria-label="More actions" onClick={(e) => setMoreAnchor(e.currentTarget)} />
            </div>
          </div>
          {!mobile && description}
          {mobile && descOpen && (
            <BottomSheet onClose={() => setDescOpen(false)} label="About this video" className="description-sheet">
              {description}
            </BottomSheet>
          )}
          {mobile && !commentsOpen && (
            <button type="button" className="c-teaser" onClick={() => setCommentsOpen(true)}>
              <b>Comments</b> <span className="muted">{comments.length}</span>
              <span className="c-teaser-row">{topComment ? <><Avatar name={topComment.author.handle} src={topComment.author.avatar} size={24} /><span>{topComment.text}</span></> : <span className="muted">Add a comment…</span>}</span>
            </button>
          )}
          {mobile && commentsOpen && (
            <CommentsSheet videoId={v.id} owner={owner} comments={comments} onSeek={seek} onClose={() => setCommentsOpen(false)} />
          )}
          {!mobile && (
            <section className="comments">
              <Comments videoId={v.id} owner={owner} initial={comments} onSeek={seek} />
            </section>
          )}
        </div>
      </div>
      <aside className="watch-secondary">
        {playlist && (
          <div className="side-box">
            <div className="box-head"><div className="grow"><b>{playlist.title}</b><span className="muted small">{Math.max(1, playlist.videos.findIndex((x) => x.id === v.id) + 1)} / {playlist.videos.length}</span></div></div>
            <div className="box-list">{playlist.videos.map((x, i) => <CompactCard key={x.id} v={x} index={i} active={x.id === v.id} href={`/watch?v=${x.id}&list=${playlist.id}`} />)}</div>
          </div>
        )}
        {app.queue.length > 0 && (
          <div className="side-box">
            <div className="box-head"><div className="grow"><b>Queue</b><span className="muted small">{app.queue.length} video{app.queue.length === 1 ? '' : 's'}</span></div><IconButton icon="close" label="Clear queue" onClick={() => app.setQueue([])} /></div>
            <ol className="queue-list">{app.queue.map((q) => (
              <li key={q.id}>
                <Link href={`/watch?v=${q.id}`} onClick={() => app.setQueue(app.queue.filter((x) => x.id !== q.id))}>{q.title}</Link>
                <IconButton icon="close" label="Remove from queue" size={32} onClick={() => app.setQueue(app.queue.filter((x) => x.id !== q.id))} />
              </li>
            ))}</ol>
          </div>
        )}
        <div className="secondary-chips">
          <Chips value={filter} onChange={setFilter} items={[
            { id: 'all', label: 'All' }, { id: 'channel', label: `From ${v.channel.name}` }, { id: 'topic', label: v.topic }, { id: 'recent', label: 'Recently uploaded' },
          ]} />
        </div>
        {list.map((x) => <CompactCard key={x.id} v={x} />)}
        {!list.length && <p className="muted pad-m">No videos match this filter.</p>}
      </aside>
      {moreAnchor && <Menu anchor={moreAnchor} onClose={() => setMoreAnchor(null)} items={[
        { icon: 'schedule', label: 'Save to Watch later', onSelect: () => watchLater(v.id) },
        { icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'video', targetId: v.id }) },
        ...(app.me?.id === v.channel.id ? [{ icon: 'edit', label: 'Edit video', href: `/studio/video/${v.id}` }] : []),
      ]} />}
    </div>
  );
}
