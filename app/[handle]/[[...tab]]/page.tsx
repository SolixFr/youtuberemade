import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ago } from '@/components/ago';
import { ShortCard, Thumbnail, VerifiedBadge, VideoCard } from '@/components/cards';
import { PlaylistTile } from '@/components/library';
import { MessageButton } from '@/components/messages';
import { RouteChips } from '@/components/route-chips';
import { PostCard, SubscribeButton } from '@/components/social';
import { EmptyState, Icon } from '@/components/ui';
import {formatCount, watchHref } from '@/lib/format';
import { getMe } from '@/lib/server/auth';
import { channelByHandle, channelVideos, playlists, posts, STORY_MIN_SUBS, storyGroups, subscriptionState } from '@/lib/server/queries';
import { AboutDialog, AddStoryButton, ChannelHeaderAvatar, ChannelSearch, NewPostPrompt, StoryTile } from './channel-parts';

const TABS = [['', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['playlists', 'Playlists'], ['posts', 'Posts'], ['stories', 'Stories']] as const;
type Props = { params: Promise<{ handle: string; tab?: string[] }>; searchParams: Promise<{ sort?: string; q?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = decodeURIComponent((await params).handle);
  const c = handle.startsWith('@') ? channelByHandle(handle) : null;
  return { title: c?.name ?? 'Channel not found', description: c?.description.slice(0, 160) };
}

function StoryFrame({ s }: { s: { background: string; textColor: string; image: string | null; text: string } }) {
  return (
    <div className="story-tile-frame" style={{ background: s.background, color: s.textColor }}>
      {s.image && <img src={s.image} alt="" loading="lazy" />}
      <p>{s.text}</p>
    </div>
  );
}

export default async function ChannelPage({ params, searchParams }: Props) {
  const { handle: raw, tab: tabParts } = await params;
  const { sort = 'latest', q = '' } = await searchParams;
  const handle = decodeURIComponent(raw);
  if (!handle.startsWith('@')) notFound();
  const me = await getMe();
  const c = channelByHandle(handle, me?.id);
  if (!c) return <EmptyState icon="person_off" title="This channel doesn’t exist" />;
  const tab = tabParts?.[0] ?? '';
  const mine = me?.id === c.id;
  const all = channelVideos(c.id, me?.id);
  const longs = all.filter((v) => v.type === 'video');
  const shorts = all.filter((v) => v.type === 'short');
  const story = storyGroups(me?.id, [c.id])[0];
  const sorted = [...longs].sort((a, b) => (sort === 'popular' ? b.views - a.views : sort === 'oldest' ? a.publishedAt - b.publishedAt : b.publishedAt - a.publishedAt));
  const views = all.reduce((n, v) => n + v.views, 0);

  let body: React.ReactNode;
  if (tab === 'search') {
    const term = q.toLowerCase();
    const hits = all.filter((v) => v.title.toLowerCase().includes(term) || v.description.toLowerCase().includes(term));
    body = hits.length ? <div className="grid ch-grid">{hits.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <EmptyState icon="search_off" title="No videos match your search" />;
  } else if (tab === 'videos') {
    body = (
      <>
        <RouteChips param="sort" fallback="latest" items={[{ id: 'latest', label: 'Latest' }, { id: 'popular', label: 'Popular' }, { id: 'oldest', label: 'Oldest' }]} />
        {sorted.length ? <div className="grid">{sorted.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <EmptyState icon="smart_display" title="This channel doesn’t have any videos" />}
      </>
    );
  } else if (tab === 'shorts') {
    body = shorts.length ? <div className="shorts-row ch-grid">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div> : <EmptyState icon="video_library" title="This channel doesn’t have any Shorts" />;
  } else if (tab === 'playlists') {
    const lists = playlists(c.id, !mine);
    body = lists.length ? <div className="grid ch-grid">{lists.map((p) => <PlaylistTile key={p.id} p={p} />)}</div> : <EmptyState icon="playlist_play" title="This channel doesn’t have any playlists" />;
  } else if (tab === 'posts') {
    const list = posts(me?.id, { channel: c.id });
    body = (
      <div className="ch-posts">
        {mine && <NewPostPrompt channel={c} />}
        {list.length ? list.map((p) => <PostCard key={p.id} post={p} />) : <EmptyState icon="edit_note" title="This channel hasn’t posted yet" />}
      </div>
    );
  } else if (tab === 'stories') {
    if (c.subscribers < STORY_MIN_SUBS) body = <EmptyState icon="lock" title={`Stories unlock at ${STORY_MIN_SUBS.toLocaleString()} subscribers`} text={`${c.name} has ${c.subscribers.toLocaleString()} subscribers.`} />;
    else if (!story) body = <EmptyState icon="auto_stories" title="No active stories" text="Stories disappear 7 days after they’re posted." action={mine ? <AddStoryButton /> : undefined} />;
    else body = (
      <div className="story-tiles ch-grid">
        {story.slides.map((s) => <StoryTile key={s.id} channelId={c.id}><StoryFrame s={s} /><div className="muted small"><Ago ts={s.createdAt} />{s.seen ? ' · Seen' : ''}</div></StoryTile>)}
        {mine && <AddStoryButton variant="tile" />}
      </div>
    );
  } else {
    const featured = [...longs].sort((a, b) => b.views - a.views)[0];
    const recentPosts = posts(me?.id, { channel: c.id, limit: 2 });
    body = (
      <>
        {!all.length && mine && <EmptyState icon="smart_display" title="Upload your first video" text="Everything you publish shows up here." />}
        {featured && (
          <section className="ch-section">
            <div className="featured">
              <Link href={watchHref(featured)}><Thumbnail v={featured} /></Link>
              <div><h3><Link href={watchHref(featured)}>{featured.title}</Link></h3><div className="muted small">{formatCount(featured.views)} views · <Ago ts={featured.publishedAt} /></div><p className="desc">{featured.description.split('\n\n')[0]}</p></div>
            </div>
          </section>
        )}
        {story && (
          <section className="ch-section"><h2>Stories</h2>
            <div className="story-tiles">{story.slides.slice(-4).map((s) => <StoryTile key={s.id} channelId={c.id}><StoryFrame s={s} /></StoryTile>)}</div>
          </section>
        )}
        {longs.length > 0 && (
          <section className="ch-section">
            <h2>Videos <Link href={`/${c.handle}/videos`} className="btn btn-text btn-sm"><Icon name="play_arrow" filled size={20} />Play all</Link></h2>
            <div className="hscroll">{sorted.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div>
          </section>
        )}
        {shorts.length > 0 && <section className="ch-section"><h2>Shorts</h2><div className="shorts-row">{shorts.slice(0, 6).map((v) => <ShortCard key={v.id} v={v} />)}</div></section>}
        {recentPosts.length > 0 && <section className="ch-section"><h2>Posts</h2>{recentPosts.map((p) => <PostCard key={p.id} post={p} />)}</section>}
      </>
    );
  }

  return (
    <div className="channel">
      <div className="ch-banner">{c.banner && <img src={c.banner} alt="" />}</div>
      <header className="ch-header">
        <ChannelHeaderAvatar channel={c} />
        <div className="ch-info">
          <h1>{c.name}{c.verified && <VerifiedBadge />}</h1>
          <div className="ch-line"><b>{c.handle}</b> · {formatCount(c.subscribers)} subscribers · {all.length} video{all.length === 1 ? '' : 's'}</div>
          <Link href={`/${c.handle}/about`} className="ch-desc" scroll={false}>
            <span>{c.description || (mine ? 'Add a channel description in Studio' : 'More about this channel')}</span><Icon name="chevron_right" />
          </Link>
          {c.links[0] && <div className="ch-links"><a href={c.links[0].url} target="_blank" rel="noopener noreferrer nofollow">{c.links[0].url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>{c.links.length > 1 && <span className="muted"> and {c.links.length - 1} more</span>}</div>}
          <div className="ch-buttons">
            <SubscribeButton channel={c} initial={subscriptionState(me?.id, c.id)} />
            {!mine && c.hasAccount && <MessageButton userId={c.id} name={c.name} />}
            {mine && <AddStoryButton />}
          </div>
        </div>
      </header>
      <nav className="tabs" aria-label="Channel sections">
        {TABS.map(([k, label]) => <Link key={k} href={`/${c.handle}${k ? `/${k}` : ''}`} className={tab === k || (k === '' && tab === 'about') ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{label}</Link>)}
        <ChannelSearch handle={c.handle} initial={tab === 'search' ? q : ''} />
      </nav>
      <div className="ch-body">{body}</div>
      {tab === 'about' && <AboutDialog channel={c} videos={all.length} views={views} />}
    </div>
  );
}
