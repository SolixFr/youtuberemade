import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ago } from '@/components/ago';
import { ShortCard, Thumbnail, VerifiedBadge, VideoCard } from '@/components/cards';
import { PlaylistTile } from '@/components/library';
import { MessageButton } from '@/components/messages';
import { RouteChips } from '@/components/route-chips';
import { PostCard, SubscribeButton } from '@/components/social';
import { CheckCircleIcon, EmptyState, Icon, MEMBER_TIER_COLORS, Avatar } from '@/components/ui';
import {formatCount, watchHref } from '@/lib/format';
import { getMe } from '@/lib/server/auth';
import { channelByHandle, channelConfig, channelTiers, channelVideos, getVideo, activeLive, memberCount, membershipState, monetization, playlist, playlists, posts, activeMembers, STORY_MIN_SUBS, storyGroups, subscriptionState } from '@/lib/server/queries';
import { studioMembersStats } from '@/lib/actions/social';
import { AboutDialog, AddStoryButton, ChannelHeaderAvatar, ChannelSearch, JoinButton, NewPostPrompt, StoryTile } from './channel-parts';
import { CommunityHub } from '@/components/community';
import { LiveTheater } from '@/app/watch/live-theater';

const TABS = [['', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['playlists', 'Playlists'], ['posts', 'Posts'], ['membership', 'Memberships'], ['stories', 'Stories']] as const;
type Props = { params: Promise<{ handle: string; tab?: string[] }>; searchParams: Promise<{ sort?: string; q?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = decodeURIComponent((await params).handle);
  const c = handle.startsWith('@') ? channelByHandle(handle) : null;
  return { title: c?.name ?? 'Channel not found', description: c?.description.slice(0, 160) };
}

function StoryFrame({ s }: { s: { background: string; textColor: string; image: string | null; text: string; textPos?: string } }) {
  const [pv = 'middle', ph = 'center'] = (s.textPos ?? '').split('-');
  return (
    <div className={`story-tile-frame ${s.image ? 'has-image' : ''}`} style={{ background: s.background, color: s.textColor }}>
      {s.image && <img src={s.image} alt="" loading="lazy" />}
      <p className={`story-text pos-${pv} pos-${ph}`}>{s.text}</p>
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
  const elig = monetization(c.id);
  const customCfg = channelConfig(c.id);
  const subState = subscriptionState(me?.id, c.id);
  const live = activeLive(c.id);
  const all = channelVideos(c.id, me?.id);
  const liveStreams = all.filter((v) => v.recordedLive);
  // The Live tab exists as long as the channel has (or is) a broadcast — it lists past streams too, like YouTube.
  const showLive = !!live || liveStreams.length > 0;
  const TAB_LIST = [['', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ...(showLive ? [['live', 'Live'] as const] : []), ...TABS.filter(([k]) => k !== '' && k !== 'videos' && k !== 'shorts')];
  const tiers = channelTiers(c.id);
  const longs = all.filter((v) => v.type === 'video' && !v.recordedLive);
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
  } else if (tab === 'membership') {
    if (!mine) notFound();
    if (!elig.memberships) {
      const reqs = [
        { ok: elig.subscribers >= 500, label: `500 subscribers (you have ${elig.subscribers.toLocaleString()})` },
        { ok: elig.uploads >= 3, label: `3 public uploads in the last 90 days (you have ${elig.uploads})` },
        { ok: elig.watchHours >= 100, label: `100 watch hours all time (you have ${Math.floor(elig.watchHours).toLocaleString()})` },
      ];
      body = (
        <div className="membership-tab">
          <section className="membership-hero">
            <Icon name="loyalty" size={80} style={{ color: '#9aa0a6' }} />
            <div className="membership-hero-body">
              <h2>Memberships aren&apos;t unlocked yet</h2>
              <p className="muted">Memberships unlock once your channel meets all three requirements.</p>
              <ul className="earn-req-list membership-locked">
                {reqs.map((r) => (
                  <li key={r.label} className={r.ok ? 'on' : ''}>{r.ok ? <CheckCircleIcon size={18} /> : <Icon name="lock" size={18} />}{r.label}</li>
                ))}
              </ul>
              <div className="membership-cta"><Link href="/studio/members" className="btn btn-filled btn-md">See requirements in Studio</Link></div>
            </div>
          </section>
        </div>
      );
    } else if (!tiers.length) {
      body = <EmptyState icon="lock" title="Memberships are off" text="This channel hasn’t turned on memberships yet." />;
    } else {
      const my = membershipState(me?.id, c.id);
      const count = memberCount(c.id);
      const mineStatsR = mine ? await studioMembersStats(me.id) : null;
      const mineStats = mineStatsR && mineStatsR.ok ? mineStatsR.data : null;
      const myTier = my ? tiers.find((t) => t.tier === my.tier) : undefined;
      const perks = mine ? tiers[tiers.length - 1].perks : myTier ? myTier.perks : tiers[0].perks;
      const perkIcon = (p: string) => (/badge/i.test(p) ? 'loyalty' : /emoji/i.test(p) ? 'emoji_emotions' : /posts?/i.test(p) ? 'lock' : /early/i.test(p) ? 'schedule' : /reply/i.test(p) ? 'reply' : /q&a|monthly/i.test(p) ? 'question_answer' : /everything|all/i.test(p) ? 'done_all' : 'loyalty');
      const starColor = my ? MEMBER_TIER_COLORS[(my.tier - 1) % MEMBER_TIER_COLORS.length] : mine ? '#e0e0e0' : '#ffd600';
      body = (
        <div className="membership-tab">
          <section className="membership-hero">
            <Icon name="loyalty" filled size={80} style={{ color: starColor }} />
            <div className="membership-hero-body">
              {mine ? (
                <>
                  <h2>Memberships are on</h2>
                  <p className="muted">{count.toLocaleString()} {count === 1 ? 'member' : 'members'} · ${((mineStats?.revenueCents ?? 0) / 100).toFixed(2)} monthly · ${((mineStats?.creatorShareCents ?? 0) / 100).toFixed(2)} creator share (70%)</p>
                  <Link href="/studio/members" className="btn btn-filled btn-md">Manage members</Link>
                </>
              ) : my ? (
                <>
                  <h2>You&apos;re a member of {c.name}</h2>
                  <p className="muted">Tier {my.tier} · {my.name} · since <Ago ts={my.started_at} /></p>
                  <div className="membership-cta"><JoinButton channelId={c.id} name={c.name} tiers={tiers} initialMember={my} avatar={c.avatar} banner={c.banner} /></div>
                </>
              ) : (
                <>
                  <h2>Join {c.name}</h2>
                  <p className="muted">Loyalty badges, members-only posts and more — starting at ${(tiers[0].price_cents / 100).toFixed(2)}/mo.</p>
                  <div className="membership-cta"><JoinButton channelId={c.id} name={c.name} tiers={tiers} initialMember={null} avatar={c.avatar} banner={c.banner} /></div>
                </>
              )}
            </div>
          </section>
          <section className="membership-section">
            <h3 className="membership-section-title">What members get</h3>
            <div className="perk-chips">{perks.map((p) => <span key={p} className="perk-chip"><Icon name={perkIcon(p)} size={16} />{p}</span>)}</div>
          </section>
          <section className="membership-section">
            <h3 className="membership-section-title">Membership tiers</h3>
            <ol className="membership-tiers">
              {tiers.map((t) => (
                <li key={t.tier} className={`membership-tier-row ${my?.tier === t.tier ? 'on' : ''}`}>
                  <span className="membership-tier-star" style={{ color: MEMBER_TIER_COLORS[(t.tier - 1) % MEMBER_TIER_COLORS.length] }}><Icon name="loyalty" filled size={22} /></span>
                  <span className="membership-tier-name">{t.name}</span>
                  <span className="membership-tier-price">${(t.price_cents / 100).toFixed(2)}/mo</span>
                  {my?.tier === t.tier && <span className="membership-tier-current">Your plan</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      );
    }
  } else if (tab === 'community') {
    const list = posts(me?.id, { channel: c.id });
    body = <CommunityHub channel={c} mine={mine} posts={list} membershipsEnabled={elig.memberships} />;
  } else if (tab === 'live') {
    // Live room for everyone — where the broadcast plays, plus the channel’s past streams below it.
    const liveVideo = live?.video_id ? getVideo(live.video_id, me?.id) : null;
    const past = live ? liveStreams.filter((v) => v.id !== live.video_id) : liveStreams;
    body = (
      <div className="ch-live">
        {live && liveVideo ? (
          <LiveTheater video={liveVideo} me={me ? { id: me.id, name: me.name, handle: me.handle } : null} />
        ) : null}
        {past.length > 0 && (
          <div className="live-past">
            <h2 className="live-past-title">{live ? 'Past live streams' : 'Live streams'}</h2>
            <div className="grid">{past.map((v) => <VideoCard key={v.id} v={v} />)}</div>
          </div>
        )}
        {!live && past.length === 0 && (
          <EmptyState icon="sensors" title="Not live right now" text="Check back soon — the channel isn’t broadcasting." />
        )}
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
    const popular = [...longs].sort((a, b) => b.views - a.views);
    let featured = popular[0];
    if (subState.subscribed && customCfg.featuredVideoId) {
      const fv = getVideo(customCfg.featuredVideoId, me?.id);
      if (fv && fv.channel.id === c.id) featured = fv;
    } else if (!subState.subscribed && customCfg.trailerVideoId) {
      const tv = getVideo(customCfg.trailerVideoId, me?.id);
      if (tv && tv.channel.id === c.id) featured = tv;
    }
    const recentPosts = posts(me?.id, { channel: c.id, limit: 2 });
    const blocks: React.ReactNode[] = [];
    const showMembers = customCfg.homeSections.includes('members') && elig.memberships && memberCount(c.id) >= 8;
    const membersShown = showMembers ? activeMembers(c.id, 24) : [];
    for (const kind of customCfg.homeSections) {
      if (kind === 'recent_uploads' && longs.length) {
        blocks.push(<section key={kind} className="ch-section"><h2>Videos <span className="muted small">{longs.length}</span> <Link href={`/${c.handle}/videos`} className="btn btn-text btn-sm"><Icon name="play_arrow" filled size={20} />Play all</Link></h2><div className="hscroll">{sorted.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div></section>);
      } else if (kind === 'popular_uploads' && longs.length) {
        blocks.push(<section key={kind} className="ch-section"><h2>Popular videos <span className="muted small">{popular.length}</span> <Link href={`/${c.handle}/videos?sort=popular`} className="btn btn-text btn-sm"><Icon name="play_arrow" filled size={20} />Play all</Link></h2><div className="hscroll">{popular.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div></section>);
      } else if (kind === 'shorts' && shorts.length) {
        blocks.push(<section key={kind} className="ch-section"><h2>Shorts <span className="muted small">{shorts.length}</span></h2><div className="shorts-row">{shorts.slice(0, 6).map((v) => <ShortCard key={v.id} v={v} />)}</div></section>);
      } else if (kind === 'playlists') {
        const pubs = playlists(c.id, !mine);
        if (pubs.length) blocks.push(<section key={kind} className="ch-section"><h2>Playlists <span className="muted small">{pubs.length}</span></h2><div className="grid ch-grid">{pubs.slice(0, 6).map((p) => <PlaylistTile key={p.id} p={p} />)}</div></section>);
      } else if (kind.startsWith('playlist:')) {
        const pl = playlist(kind.slice('playlist:'.length), me?.id);
        const pubs = pl?.videos.filter((v) => v.visibility === 'public' || mine) ?? [];
        if (pl && pubs.length) blocks.push(<section key={kind} className="ch-section"><h2>{pl.title} <Link href={`/playlist?list=${pl.id}`} className="btn btn-text btn-sm"><Icon name="play_arrow" filled size={20} />View all</Link></h2><div className="hscroll">{pubs.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div></section>);
      } else if (kind === 'members') {
        if (!showMembers) continue;
        blocks.push(<section key={kind} className="ch-section"><h2>Member recognition <Link href={`/${c.handle}/membership`} className="btn btn-text btn-sm">All members</Link></h2><div className="member-avatars">{membersShown.map((m) => <Link key={m.id} href={`/${m.handle}`} className="member-avatar" title={m.name}><Avatar name={m.name} src={m.avatar} size={72} /></Link>)}</div></section>);
      } else if (kind === 'posts' && recentPosts.length) {
        blocks.push(<section key={kind} className="ch-section"><h2>Posts</h2>{recentPosts.map((p) => <PostCard key={p.id} post={p} />)}</section>);
      }
    }
    body = (
      <>
        {!all.length && mine && <EmptyState icon="smart_display" title="Upload your first video" text="Everything you publish shows up here." />}
        {live && (
          <section className="live-hero ch-section">
            <Link href={`/${c.handle}/live`} className="live-hero-card" aria-label="Watch live">
              <span className="live-chip"><Icon name="sensors" size={16} />LIVE</span>
              <span className="live-hero-title">{live.title}</span>
              <span className="live-hero-sub">{formatCount(live.viewers)} watching now — tap to watch</span>
            </Link>
          </section>
        )}
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
        {blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}
      </>
    );
  }

  if (tab === 'community') {
    // Standalone view: only the community hub, no channel header or tabs.
    const list = posts(me?.id, { channel: c.id });
    return (
      <div className="channel community-page">
        <CommunityHub channel={c} mine={mine} posts={list} membershipsEnabled={elig.memberships} />
      </div>
    );
  }

  return (
    <div className="channel">
      <div className="ch-banner">{c.banner && <img src={c.banner} alt="" />}</div>
      <header className="ch-header">
        <ChannelHeaderAvatar channel={c} />
        <div className="ch-info">
          <h1>{c.name}{c.verified && <VerifiedBadge />}</h1>
          <div className="ch-line"><b>{c.handle}</b>{c.pronouns && <> · {c.pronouns}</>} · {formatCount(c.subscribers)} subscribers · {all.length} video{all.length === 1 ? '' : 's'}</div>
          <Link href={`/${c.handle}/about`} className="ch-desc" scroll={false}>
            <span>{c.description || (mine ? 'Add a channel description in Studio' : 'More about this channel')}</span><Icon name="chevron_right" />
          </Link>
          {c.links[0] && <div className="ch-links"><a href={c.links[0].url} target="_blank" rel="noopener noreferrer nofollow">{c.links[0].url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>{c.links.length > 1 && <span className="muted"> and {c.links.length - 1} more</span>}</div>}
          <div className="ch-buttons">
            {live && <Link href={`/${c.handle}/live`} className="btn btn-live btn-md"><Icon name="sensors" size={20} />LIVE</Link>}
            <SubscribeButton channel={c} initial={subscriptionState(me?.id, c.id)} />
            {!mine && elig.memberships && tiers.length > 0 && <JoinButton channelId={c.id} name={c.name} tiers={tiers} initialMember={membershipState(me?.id, c.id)} avatar={c.avatar} banner={c.banner} />}
            <Link href={`/${c.handle}/community`} className="btn btn-tonal btn-md"><Icon name="groups" />Community</Link>
            {!mine && c.hasAccount && <MessageButton userId={c.id} name={c.name} />}
            {mine && <AddStoryButton />}
          </div>
        </div>
      </header>
      <nav className="tabs" aria-label="Channel sections">
        {TAB_LIST.filter(([k]) => (k !== 'stories' || c.subscribers >= STORY_MIN_SUBS) && (k !== 'membership' || (mine && elig.memberships && tiers.length > 0))).map(([k, label]) => <Link key={k} href={`/${c.handle}${k ? `/${k}` : ''}`} className={`${k === 'live' && live ? 'tab-live ' : ''}${tab === k || (k === '' && tab === 'about') ? 'on' : ''}`} aria-current={tab === k ? 'page' : undefined}>{k === 'live' && live && <span className="live-tab-dot" aria-hidden="true" />}{label}</Link>)}
        <ChannelSearch handle={c.handle} initial={tab === 'search' ? q : ''} />
      </nav>
      <div className="ch-body">{body}</div>
      {tab === 'about' && <AboutDialog channel={c} videos={all.length} views={views} contactEmail={customCfg.contactEmail || undefined} />}
    </div>
  );
}
