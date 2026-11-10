'use client';

import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { ShortCard, Thumbnail, VerifiedBadge, VideoCard, watchHref } from '@/components/cards';
import { PlaylistTile } from '@/components/library';
import { PostCard, SubscribeButton } from '@/components/social';
import { Avatar, Button, Chips, Dialog, EmptyState, Icon, MediaImg } from '@/components/ui';
import { formatCount, formatDate, timeAgo } from '@/lib/format';
import { activeStories, canWatch, hasUnseenStory, STORY_MIN_SUBS, useDB } from '@/lib/store';

const TABS = [['', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['playlists', 'Playlists'], ['posts', 'Posts'], ['stories', 'Stories']] as const;

export default function ChannelPage() {
  const params = useParams<{ handle: string; tab?: string[] }>();
  const handle = decodeURIComponent(params.handle);
  const tab = params.tab?.[0] ?? '';
  const d = useDB();
  const app = useApp();
  const router = useRouter();
  const [sort, setSort] = useState('latest');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const c = Object.values(d.channels).find((x) => x.handle.toLowerCase() === handle.toLowerCase());
  if (!handle.startsWith('@')) notFound();
  if (!c) return <EmptyState icon="person_off" title="This channel doesn’t exist" />;

  const mine = !!c.isMine;
  const all = d.videos.filter((v) => v.channelId === c.id && (mine || (v.visibility === 'public' && canWatch(v))));
  const longs = all.filter((v) => v.type === 'video');
  const shorts = all.filter((v) => v.type === 'short');
  const posts = d.posts.filter((p) => p.channelId === c.id).sort((a, b) => b.createdAt - a.createdAt);
  const story = activeStories(d).find((g) => g.channelId === c.id);
  const ring = hasUnseenStory(d, c.id);
  const sorted = [...longs].sort((a, b) => (sort === 'popular' ? b.views - a.views : sort === 'oldest' ? a.publishedAt - b.publishedAt : b.publishedAt - a.publishedAt));
  const featured = [...longs].sort((a, b) => b.views - a.views)[0];
  const totalViews = all.reduce((n, v) => n + v.views, 0);
  const results = q.trim() ? all.filter((v) => v.title.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const showAbout = tab === 'about';

  let body;
  if (searching && q.trim()) {
    body = results.length ? <div className="grid" style={{ paddingTop: 24 }}>{results.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <EmptyState icon="search_off" title="This channel has no videos matching your search" />;
  } else if (tab === 'videos') {
    body = (
      <>
        <div className="pad-m"><Chips value={sort} onChange={setSort} items={[{ id: 'latest', label: 'Latest' }, { id: 'popular', label: 'Popular' }, { id: 'oldest', label: 'Oldest' }]} /></div>
        {sorted.length ? <div className="grid">{sorted.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <EmptyState icon="smart_display" title="This channel doesn’t have any videos" />}
      </>
    );
  } else if (tab === 'shorts') {
    body = shorts.length ? <div className="shorts-row" style={{ paddingTop: 24 }}>{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div> : <EmptyState icon="video_library" title="This channel doesn’t have any Shorts" />;
  } else if (tab === 'playlists') {
    const lists = mine ? d.playlists : [];
    body = lists.length ? <div className="grid" style={{ paddingTop: 24 }}>{lists.map((p) => <PlaylistTile key={p.id} id={p.id} title={p.title} ids={p.videoIds} vis={p.visibility} />)}</div>
      : <EmptyState icon="playlist_play" title="This channel doesn’t have any playlists" />;
  } else if (tab === 'posts') {
    body = (
      <div style={{ paddingTop: 24 }}>
        {mine && (
          <button type="button" className="post" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => app.open({ kind: 'post' })}>
            <Avatar channel={c} size={40} /><div className="post-body"><p className="muted" style={{ padding: '10px 0' }}>Share a sneak peek, an update, or a question with your audience</p>
              <div className="row-wrap" style={{ margin: 0 }}><span className="btn btn-tonal btn-sm"><Icon name="image" size={20} />Image</span><span className="btn btn-tonal btn-sm"><Icon name="ballot" size={20} />Poll</span></div></div>
          </button>
        )}
        {posts.length ? posts.map((p) => <PostCard key={p.id} p={p} />) : <EmptyState icon="edit_note" title="This channel hasn’t posted yet" />}
      </div>
    );
  } else if (tab === 'stories') {
    if (c.subscribers < STORY_MIN_SUBS) {
      body = <EmptyState icon="lock" title={`Stories unlock at ${STORY_MIN_SUBS.toLocaleString()} subscribers`} text={`${c.name} has ${c.subscribers.toLocaleString()} subscribers.`} />;
    } else if (!story) {
      body = <EmptyState icon="auto_stories" title="No active stories" text="Stories disappear 7 days after they’re posted."
        action={mine ? <Button variant="blue" icon="add" onClick={() => app.open({ kind: 'story' })}>Create story</Button> : undefined} />;
    } else {
      body = (
        <div className="story-tiles" style={{ paddingTop: 24 }}>
          {story.slides.map((s) => (
            <button type="button" key={s.id} className="story-tile" onClick={() => app.openStory(c.id)}>
              <div className="story-tile-frame" style={{ background: s.background, color: s.textColor }}>{s.image && <MediaImg src={s.image} />}<p>{s.text}</p></div>
              <div className="muted small" style={{ marginTop: 6 }}>{timeAgo(s.createdAt)}{d.user.seenStories.includes(s.id) ? ' · Seen' : ''}</div>
            </button>
          ))}
          {mine && <button type="button" className="story-tile" onClick={() => app.open({ kind: 'story' })}><div className="story-tile-frame" style={{ background: 'var(--tonal)' }}><Icon name="add" size={40} /></div><div className="small" style={{ marginTop: 6 }}>Add to story</div></button>}
        </div>
      );
    }
  } else {
    body = (
      <>
        {!all.length && mine && (
          <EmptyState icon="smart_display" title="Create content on any device" text="Upload and record at home or on the go. Everything you make public will appear here."
            action={<Button variant="filled" onClick={() => app.open({ kind: 'upload' })}>Upload video</Button>} />
        )}
        {featured && (
          <section className="ch-section">
            <div className="featured">
              <Link href={watchHref(featured)}><Thumbnail v={featured} /></Link>
              <div><h3><Link href={watchHref(featured)}>{featured.title}</Link></h3><div className="muted small">{formatCount(featured.views)} views · {timeAgo(featured.publishedAt)}</div><p className="desc">{featured.description.split('\n\n')[0]}</p></div>
            </div>
          </section>
        )}
        {story && (
          <section className="ch-section"><h2>Stories</h2>
            <div className="story-tiles">{story.slides.slice(-4).map((s) => (
              <button type="button" key={s.id} className="story-tile" onClick={() => app.openStory(c.id)}>
                <div className="story-tile-frame" style={{ background: s.background, color: s.textColor }}>{s.image && <MediaImg src={s.image} />}<p>{s.text}</p></div>
              </button>
            ))}</div>
          </section>
        )}
        {longs.length > 0 && (
          <section className="ch-section">
            <h2>Videos <Link href={`/${c.handle}/videos`} className="btn btn-text btn-sm"><Icon name="play_arrow" filled size={20} />Play all</Link></h2>
            <div className="hscroll">{sorted.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div>
          </section>
        )}
        {shorts.length > 0 && (
          <section className="ch-section"><h2>Shorts</h2><div className="shorts-row">{shorts.slice(0, 6).map((v) => <ShortCard key={v.id} v={v} />)}</div></section>
        )}
        {posts.length > 0 && <section className="ch-section"><h2>Posts</h2>{posts.slice(0, 2).map((p) => <PostCard key={p.id} p={p} />)}</section>}
      </>
    );
  }

  return (
    <div className="channel">
      <div className="ch-banner">{c.banner ? <MediaImg src={c.banner} /> : null}</div>
      <header className="ch-header">
        <div className="ch-top">
          {ring !== null ? (
            <button type="button" className="ch-avatar" onClick={() => app.openStory(c.id)} aria-label="View story"><Avatar channel={c} size={160} ring={ring ? 'unseen' : 'seen'} /></button>
          ) : <span className="ch-avatar"><Avatar channel={c} size={160} /></span>}
        </div>
        <div className="ch-info">
          <h1>{c.name}{c.verified && <VerifiedBadge />}</h1>
          <div className="ch-line"><b>{c.handle}</b> · {formatCount(c.subscribers)} subscribers · {all.length} video{all.length === 1 ? '' : 's'}</div>
          <button type="button" className="ch-desc" onClick={() => router.push(`/${c.handle}/about`)}>
            <span>{c.description || (mine ? 'Add a channel description in Studio' : 'More about this channel')}</span><Icon name="chevron_right" />
          </button>
          {c.links[0] && <div className="ch-links"><a href={c.links[0].url} target="_blank" rel="noopener noreferrer">{c.links[0].url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>{c.links.length > 1 && <span className="muted"> and {c.links.length - 1} more link{c.links.length > 2 ? 's' : ''}</span>}</div>}
          <div className="ch-buttons"><SubscribeButton channelId={c.id} />{mine && <Button icon="add_circle" onClick={() => app.open({ kind: 'story' })}>Add story</Button>}</div>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map(([k, label]) => <Link key={k} href={`/${c.handle}${k ? `/${k}` : ''}`} className={!searching && (tab === k || (k === '' && tab === 'about')) ? 'on' : ''} onClick={() => setSearching(false)}>{label}</Link>)}
        <span className={`tab-search ${searching ? 'open' : ''}`}>
          <button type="button" aria-label="Search channel" onClick={() => setSearching(!searching)}><Icon name="search" /></button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search this channel" autoFocus={searching} />
        </span>
      </nav>
      {body}
      {showAbout && (
        <Dialog title="About" onClose={() => router.push(`/${c.handle}`)} width={560}>
          {c.description && <p style={{ whiteSpace: 'pre-wrap', marginBottom: 24 }}>{c.description}</p>}
          {c.links.length > 0 && (<><h3 style={{ fontSize: 18, marginBottom: 12 }}>Links</h3>{c.links.map((l) => <div key={l.url} className="about-row" style={{ marginBottom: 12 }}><Icon name="link" /><div><div>{l.title}</div><a className="link" href={l.url} target="_blank" rel="noopener noreferrer">{l.url.replace(/^https?:\/\//, '')}</a></div></div>)}</>)}
          <h3 style={{ fontSize: 18, margin: '24px 0 12px' }}>Channel details</h3>
          <div className="about-grid">
            <div className="about-row"><Icon name="public" />vidora.example/{c.handle}</div>
            <div className="about-row"><Icon name="group" />{c.subscribers.toLocaleString()} subscribers</div>
            <div className="about-row"><Icon name="smart_display" />{all.length} videos</div>
            <div className="about-row"><Icon name="trending_up" />{totalViews.toLocaleString()} views</div>
            <div className="about-row"><Icon name="info" />Joined {formatDate(c.joinedAt)}</div>
          </div>
          <div className="row-wrap" style={{ marginTop: 24 }}>
            <Button icon="share" onClick={() => app.open({ kind: 'share', title: c.name, path: `/${c.handle}` })}>Share channel</Button>
            {!mine && <Button icon="flag" onClick={() => app.open({ kind: 'report', what: 'channel' })}>Report user</Button>}
          </div>
        </Dialog>
      )}
    </div>
  );
}
