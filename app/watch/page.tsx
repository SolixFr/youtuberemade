'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { CompactCard, Thumbnail, VerifiedBadge } from '@/components/cards';
import { Player, type PlayerHandle } from '@/components/player';
import { Comments, RichText, SubscribeButton } from '@/components/social';
import { Avatar, Button, Chips, EmptyState, Icon, IconButton, Menu, useIsMobile, useToast } from '@/components/ui';
import { rateVideo, recordWatch } from '@/lib/actions';
import { formatCount, formatDate, formatDuration, parseChapters, timeAgo } from '@/lib/format';
import { resolveMedia } from '@/lib/media';
import { canWatch, channelOf, feedVideos, hasUnseenStory, setDocumentTitle, update, useDB, videoOf } from '@/lib/store';
import type { Video } from '@/lib/types';

function UpNext({ next, onPlay, onCancel }: { next: Video; onPlay: () => void; onCancel: () => void }) {
  const [left, setLeft] = useState(8);
  useEffect(() => {
    if (left <= 0) { onPlay(); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onPlay]);
  const d = useDB();
  return (
    <div className="p-end">
      <span className="muted" style={{ color: '#ccc' }}>Up next in {left}</span>
      <div className="p-end-card">
        <Thumbnail v={next} preview={false} overlayActions={false} />
        <div><b>{next.title}</b><span style={{ color: '#ccc' }}>{channelOf(d, next.channelId)?.name} · {formatCount(next.views)} views</span></div>
      </div>
      <div className="row-wrap" style={{ margin: 0 }}>
        <Button variant="tonal" onClick={onCancel}>Cancel</Button>
        <Button variant="filled" className="on-media-light" onClick={onPlay}>Play now</Button>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const params = useSearchParams();
  const d = useDB();
  const v = videoOf(d, params.get('v'));
  if (!v || !channelOf(d, v.channelId) || !canWatch(v)) {
    return <EmptyState icon="error" title="This video isn't available anymore" action={<Link href="/" className="btn btn-tonal btn-md">Go to home</Link>} />;
  }
  // Keyed by video so per-video UI state (description, comments, end screen) starts fresh.
  return <WatchView key={v.id} v={v} />;
}

function WatchView({ v }: { v: Video }) {
  const params = useSearchParams();
  const listId = params.get('list');
  const clipParam = params.get('clip');
  const startAt = params.get('t') ? Number(params.get('t')) : undefined;
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const mobile = useIsMobile();
  const player = useRef<PlayerHandle>(null);
  const [theater, setTheater] = useState(() => { try { return localStorage.getItem('vidora-theater') === '1'; } catch { return false; } });
  const [descOpen, setDescOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [related, setRelated] = useState('all');
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const time = useRef(0);
  const c = channelOf(d, v.channelId)!;

  useEffect(() => {
    recordWatch(v.id);
    setDocumentTitle(`${v.title} - Vidora`);
    window.scrollTo(0, 0);
  }, [v.id, v.title]);

  const clip = (() => {
    if (!clipParam) return undefined;
    const [s, e] = clipParam.split('-').map(Number);
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: s, end: e } : undefined;
  })();

  const playlist = (() => {
    if (!listId) return null;
    if (listId === 'WL') return { id: 'WL', title: 'Watch later', ids: d.user.watchLater };
    if (listId === 'LL') return { id: 'LL', title: 'Liked videos', ids: d.user.liked };
    const p = d.playlists.find((x) => x.id === listId);
    return p ? { id: p.id, title: p.title, ids: p.videoIds } : null;
  })();

  const relatedList = (() => {
    const pool = feedVideos(d).filter((x) => x.id !== v.id && x.type === 'video');
    const score = (x: Video) => (x.channelId === v.channelId ? 2 : 0) + (x.topic === v.topic ? 1 : 0) + Math.log10(x.views + 1) / 10;
    if (related === 'channel') return pool.filter((x) => x.channelId === v.channelId);
    if (related === 'topic') return pool.filter((x) => x.topic === v.topic);
    if (related === 'recent') return [...pool].sort((a, b) => b.publishedAt - a.publishedAt);
    if (related === 'watched') return pool.filter((x) => d.user.history.some((h) => h.videoId === x.id));
    return [...pool].sort((a, b) => score(b) - score(a));
  })();

  const nextId = (() => {
    if (app.queue.length) return app.queue[0];
    if (playlist) {
      const i = playlist.ids.indexOf(v.id);
      if (i >= 0 && i + 1 < playlist.ids.length) return playlist.ids[i + 1];
    }
    return relatedList[0]?.id;
  })();
  const next = videoOf(d, nextId);
  const goNext = () => {
    if (!next) return;
    if (app.queue[0] === next.id) app.setQueue(app.queue.slice(1));
    router.push(`/watch?v=${next.id}${playlist && playlist.ids.includes(next.id) ? `&list=${playlist.id}` : ''}`);
  };

  const liked = d.user.liked.includes(v.id);
  const disliked = d.user.disliked.includes(v.id);
  const chapters = parseChapters(v.description, v.duration);
  const seek = (t: number) => { player.current?.seek(t); player.current?.play(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const download = async () => {
    const url = await resolveMedia(v.src);
    if (!url) return toast('This file is no longer available');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${v.title.replace(/[\\/:*?"<>|]+/g, '')}.mp4`;
    a.click();
    update((db) => { if (!db.user.downloads.includes(v.id)) db.user.downloads.unshift(v.id); });
    toast('Download started');
  };
  const storyState = hasUnseenStory(d, c.id);
  const topComment = d.comments.filter((x) => x.videoId === v.id && !x.parentId).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.likes - a.likes)[0];
  const commentCount = d.comments.filter((x) => x.videoId === v.id).length;

  const description = (
    <div className={`description ${descOpen ? 'open' : ''} ${mobile ? '' : 'desktop'}`} onClick={() => !descOpen && setDescOpen(true)}>
      <div className="desc-stats">
        <span>{descOpen ? `${v.views.toLocaleString()} views` : `${formatCount(v.views)} views`}</span>
        <span>{descOpen ? formatDate(v.publishedAt) : timeAgo(v.publishedAt)}</span>
        {v.visibility !== 'public' && <span className="muted"><Icon name={v.visibility === 'private' ? 'lock' : 'link'} size={16} /> {v.visibility}</span>}
      </div>
      <div className="desc-body"><RichText text={(descOpen ? v.description : v.description.split('\n\n')[0]) || 'No description has been added to this video.'} onSeek={seek} /></div>
      {descOpen && chapters.length > 0 && (
        <div className="desc-chapters"><h3>Chapters</h3>
          <div className="chapter-list">{chapters.map((ch) => <button type="button" key={ch.t} className="chapter-btn" onClick={() => seek(ch.t)}><b>{ch.title}</b><span className="link">{formatDuration(ch.t)}</span></button>)}</div>
        </div>
      )}
      {descOpen && v.credit && <div className="desc-credit"><h3>Source</h3><a href={v.credit.url} target="_blank" rel="noopener noreferrer">{v.credit.label}</a></div>}
      {descOpen && (
        <div className="desc-channel">
          <Link href={`/${c.handle}`}><Avatar channel={c} size={48} /></Link>
          <div><Link href={`/${c.handle}`} className="w-owner-name">{c.name}</Link><div className="muted small">{formatCount(c.subscribers)} subscribers</div></div>
          <span className="grow" />
          <Link className="btn btn-outline btn-md" href={`/${c.handle}/videos`}><Icon name="smart_display" />Videos</Link>
          <Link className="btn btn-outline btn-md" href={`/${c.handle}/about`}><Icon name="info" />About</Link>
        </div>
      )}
      <button type="button" className="desc-more" onClick={(e) => { e.stopPropagation(); setDescOpen(!descOpen); }}>{descOpen ? 'Show less' : '...more'}</button>
    </div>
  );

  return (
    <div className={`watch ${theater && !mobile ? 'theater' : ''}`}>
      <div className="watch-primary">
        <div className="watch-player">
          <Player key={v.id} ref={player} v={v} hotkeys startAt={startAt} clip={clip} theater={theater}
            onTheater={() => { const t = !theater; setTheater(t); try { localStorage.setItem('vidora-theater', t ? '1' : '0'); } catch { /* ignore */ } }}
            onMini={(t, playing) => { app.setMini({ videoId: v.id, time: t, playing }); router.push('/'); }}
            onNext={next ? goNext : undefined}
            onTime={(t) => { time.current = t; }}
            onEnded={() => { if (d.user.autoplay && next && !clip) setEnded(true); }} />
          {ended && next && <UpNext next={next} onPlay={goNext} onCancel={() => setEnded(false)} />}
        </div>
        <div className="watch-info">
          <h1 className="w-title">{v.title}</h1>
          <div className="w-meta-mobile">{formatCount(v.views)} views · {timeAgo(v.publishedAt)} <b onClick={() => setDescOpen(true)}>...more</b></div>
          <div className="w-actions">
            <div className="w-owner">
              {storyState !== null ? (
                <button type="button" onClick={() => app.openStory(c.id)} aria-label={`${c.name} story`}><Avatar channel={c} size={40} ring={storyState ? 'unseen' : 'seen'} /></button>
              ) : <Link href={`/${c.handle}`}><Avatar channel={c} size={40} /></Link>}
              <div className="w-owner-text">
                <Link href={`/${c.handle}`} className="w-owner-name ch-name">{c.name}{c.verified && <VerifiedBadge />}</Link>
                <div className="w-owner-subs">{formatCount(c.subscribers)} subscribers</div>
              </div>
              <SubscribeButton channelId={c.id} />
            </div>
            <div className="w-buttons">
              <div className="seg">
                <button type="button" aria-label="Like this video" data-tooltip="I like this" onClick={() => { const r = rateVideo(v.id, 'like'); toast(r ? 'Added to Liked videos' : 'Removed from Liked videos'); }}>
                  <Icon name="thumb_up" filled={liked} />{formatCount(v.likes)}
                </button>
                <button type="button" aria-label="Dislike this video" data-tooltip="I dislike this" onClick={() => rateVideo(v.id, 'dislike')}><Icon name="thumb_down" filled={disliked} /></button>
              </div>
              <Button icon="share" onClick={() => app.open({ kind: 'share', title: v.title, path: `/watch?v=${v.id}`, startAt: time.current })}>Share</Button>
              <Button icon="download" onClick={download}>Download</Button>
              <Button icon="content_cut" onClick={() => app.open({ kind: 'clip', videoId: v.id, at: time.current })}>Clip</Button>
              <Button icon="playlist_add" onClick={() => app.open({ kind: 'save', videoId: v.id })}>Save</Button>
              <Button icon="more_horiz" aria-label="More actions" onClick={(e) => setMoreAnchor(e.currentTarget)} />
            </div>
          </div>
          {mobile ? (descOpen && description) : description}
          {mobile && !commentsOpen && (
            <div className="c-teaser" onClick={() => setCommentsOpen(true)}>
              <b>Comments</b> <span className="muted">{commentCount}</span>
              <div className="c-teaser-row">{topComment ? <><Avatar name={topComment.author} size={24} /><span>{topComment.text}</span></> : <span className="muted">Add a comment...</span>}</div>
            </div>
          )}
          <section className={`comments ${commentsOpen ? 'expanded' : ''}`}>
            {mobile && <div className="row-end"><IconButton icon="close" label="Close comments" onClick={() => setCommentsOpen(false)} /></div>}
            <Comments videoId={v.id} onSeek={seek} />
          </section>
        </div>
      </div>
      <aside className="watch-secondary">
        {playlist && (
          <div className="playlist-box">
            <div className="box-head"><div className="grow"><b>{playlist.title}</b><span className="muted small">{Math.max(1, playlist.ids.indexOf(v.id) + 1)} / {playlist.ids.length}</span></div></div>
            <div className="box-list">{playlist.ids.map((x, i) => { const pv = videoOf(d, x); return pv ? <CompactCard key={x} v={pv} index={i} active={x === v.id} /> : null; })}</div>
          </div>
        )}
        {app.queue.length > 0 && (
          <div className="queue-box">
            <div className="box-head"><div className="grow"><b>Queue</b><span className="muted small">{app.queue.length} video{app.queue.length === 1 ? '' : 's'}</span></div><IconButton icon="close" label="Clear queue" onClick={() => app.setQueue([])} /></div>
            <div className="box-list">{app.queue.map((x, i) => { const qv = videoOf(d, x); return qv ? <CompactCard key={x} v={qv} index={i} extraMenu={[{ icon: 'delete', label: 'Remove from queue', onSelect: () => app.setQueue(app.queue.filter((q) => q !== x)) }]} /> : null; })}</div>
          </div>
        )}
        <div className="secondary-chips">
          <Chips value={related} onChange={setRelated} items={[
            { id: 'all', label: 'All' }, { id: 'channel', label: `From ${c.name}` }, { id: 'topic', label: v.topic },
            { id: 'recent', label: 'Recently uploaded' }, { id: 'watched', label: 'Watched' },
          ]} />
        </div>
        {relatedList.map((x) => <CompactCard key={x.id} v={x} />)}
        {!relatedList.length && <p className="muted pad-m">No videos match this filter.</p>}
      </aside>
      {moreAnchor && <Menu anchor={moreAnchor} onClose={() => setMoreAnchor(null)} items={[
        { icon: 'schedule', label: d.user.watchLater.includes(v.id) ? 'Remove from Watch later' : 'Save to Watch later', onSelect: () => update((db) => { db.user.watchLater = db.user.watchLater.includes(v.id) ? db.user.watchLater.filter((x) => x !== v.id) : [v.id, ...db.user.watchLater]; }) },
        { icon: 'flag', label: 'Report', onSelect: () => app.open({ kind: 'report', what: 'video' }) },
        ...(v.channelId === 'me' ? [{ icon: 'edit', label: 'Edit video', href: `/studio/video/${v.id}` }] : []),
      ]} />}
    </div>
  );
}
