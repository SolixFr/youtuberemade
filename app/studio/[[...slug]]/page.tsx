import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ago } from '@/components/ago';
import { Thumbnail } from '@/components/cards';
import { RouteChips } from '@/components/route-chips';
import { SignedOut } from '@/components/signed-out';
import { PostCard } from '@/components/social';
import { Avatar, EmptyState, Icon } from '@/components/ui';
import {watchHref } from '@/lib/format';
import { demoTools, getMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { analytics, channelById, channelVideos, commentCount, getVideo, posts, storyGroups, studioComments } from '@/lib/server/queries';
import type { Me } from '@/lib/types';
import { ContentTable, CreateButtons, Customize, EditVideo, GoLive, StudioComments, StudioStories, UploadButton } from './studio-parts';

export const metadata = { title: 'Vidora Studio' };

const NAV = [
  ['', 'dashboard', 'Dashboard'], ['content', 'video_library', 'Content'], ['analytics', 'bar_chart', 'Analytics'],
  ['comments', 'comment', 'Comments'], ['stories', 'auto_stories', 'Stories'], ['live', 'sensors', 'Go live'], ['customization', 'palette', 'Customization'],
] as const;

function StoryGate({ subscribers }: { subscribers: number }) {
  const pct = Math.min(100, (subscribers / 10_000) * 100);
  return (
    <div className="gate">
      <Icon name={pct >= 100 ? 'check_circle' : 'lock'} filled={pct >= 100} />
      <div className="gate-bar"><i style={{ width: `${pct}%` }} /></div>
      <span>{subscribers.toLocaleString()} / 10,000</span>
    </div>
  );
}

function Dashboard({ me }: { me: Me }) {
  const vids = channelVideos(me.id, me.id);
  const latest = vids[0];
  const events = analytics(me.id);
  const hours = events.reduce((n, e) => n + e.seconds, 0) / 3600;
  const recent = studioComments(me.id, me.id).filter((r) => r.comment.author.id !== me.id).slice(0, 4);
  return (
    <>
      <h1>Channel dashboard <CreateButtons /></h1>
      <div className="dash">
        <section className="s-card">
          {latest ? (
            <>
              <h2>Latest video performance</h2>
              <Link href={watchHref(latest)}><Thumbnail v={latest} actions={false} /></Link>
              <b>{latest.title}</b>
              <div className="s-row"><span>Views</span><b>{latest.views.toLocaleString()}</b></div>
              <div className="s-row"><span>Likes</span><b>{latest.likes.toLocaleString()}</b></div>
              <div className="s-row"><span>Comments</span><b>{commentCount(latest.id)}</b></div>
              <Link href="/studio/analytics" className="btn btn-text btn-md link">Go to analytics</Link>
            </>
          ) : (
            <div className="dropzone compact-drop">
              <span className="drop-circle"><Icon name="upload" size={56} /></span>
              <p>Upload and publish a video to see how it performs.</p>
              <UploadButton variant="filled" label="Upload video" />
            </div>
          )}
        </section>
        <section className="s-card">
          <h2>Channel analytics</h2>
          <div className="muted">Current subscribers</div>
          <div className="big">{me.subscribers.toLocaleString()}</div>
          <hr />
          <b>Summary</b> <span className="muted small">Last 28 days</span>
          <div className="s-row"><span>Views</span><b>{events.length.toLocaleString()}</b></div>
          <div className="s-row"><span>Watch time (hours)</span><b>{hours.toFixed(1)}</b></div>
          <Link href="/studio/analytics" className="btn btn-text btn-md link">Go to channel analytics</Link>
        </section>
        <section className="s-card">
          <h2>Stories</h2>
          <StoryGate subscribers={me.subscribers} />
          <p className="muted">Stories show at the top of your subscribers’ feeds and on your channel, and disappear after 7 days.</p>
          <Link href="/studio/stories" className="btn btn-text btn-md link">Manage stories</Link>
        </section>
        <section className="s-card">
          <h2>Latest comments</h2>
          {recent.length ? recent.map(({ comment: c }) => (
            <div key={c.id} className="comment"><Avatar name={c.author.handle} src={c.author.avatar} size={32} /><div className="c-body"><div className="c-who"><span>{c.author.handle}</span><span className="c-when"><Ago ts={c.createdAt} /></span></div><div className="c-text">{c.text}</div></div></div>
          )) : <p className="muted">Comments on your videos will show up here.</p>}
          <Link href="/studio/comments" className="btn btn-text btn-md link">View all</Link>
        </section>
      </div>
    </>
  );
}

function Analytics({ me, metric }: { me: Me; metric: string }) {
  const events = analytics(me.id);
  const vids = channelVideos(me.id, me.id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 28 }, (_, i) => {
    const from = start.getTime() - (27 - i) * 86_400_000;
    const inDay = events.filter((e) => e.at >= from && e.at < from + 86_400_000);
    return metric === 'hours' ? inDay.reduce((n, e) => n + e.seconds, 0) / 3600 : inDay.length;
  });
  const max = Math.max(1e-9, ...days);
  const W = 800, H = 220;
  const line = `M${days.map((y, i) => `${((i / 27) * W).toFixed(1)},${(H - 12 - (y / max) * (H - 32)).toFixed(1)}`).join(' L')}`;
  const byVideo = new Map<string, number>();
  for (const e of events) byVideo.set(e.video_id, (byVideo.get(e.video_id) ?? 0) + 1);
  const top = vids.map((v) => ({ v, n: byVideo.get(v.id) ?? 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 5);
  return (
    <>
      <h1>Channel analytics</h1>
      <p className="muted subtitle">Plays of your videos over the last 28 days, from all viewers.</p>
      <section className="s-card">
        <RouteChips param="metric" fallback="views" items={[{ id: 'views', label: `Views · ${events.length.toLocaleString()}` }, { id: 'hours', label: `Watch time · ${(events.reduce((n, e) => n + e.seconds, 0) / 3600).toFixed(1)} h` }]} />
        {events.length ? (
          <>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${metric === 'hours' ? 'Watch time' : 'Views'} per day`}>
              {[0, 1, 2, 3].map((i) => <line key={i} className="grid-line" x1="0" x2={W} y1={20 + (i * (H - 32)) / 3} y2={20 + (i * (H - 32)) / 3} />)}
              <path className="area" d={`${line} L${W},${H - 12} L0,${H - 12} Z`} />
              <path className="line" d={line} />
            </svg>
            <div className="chart-axis"><span>28 days ago</span><span>Today</span></div>
          </>
        ) : <EmptyState icon="bar_chart" title="No views in the last 28 days" text={vids.length ? 'Plays of your videos will be counted here.' : 'Upload a video to start collecting analytics.'} />}
      </section>
      <div className="dash spaced">
        <section className="s-card">
          <h2>Top content</h2>
          {top.length ? top.map(({ v, n }, i) => <div key={v.id} className="s-row"><span>{i + 1}. {v.title}</span><b>{n}</b></div>) : <p className="muted">No plays yet</p>}
        </section>
        <section className="s-card">
          <h2>Lifetime</h2>
          <div className="s-row"><span>Videos</span><b>{vids.filter((v) => v.type === 'video').length}</b></div>
          <div className="s-row"><span>Shorts</span><b>{vids.filter((v) => v.type === 'short').length}</b></div>
          <div className="s-row"><span>Total views</span><b>{vids.reduce((n, v) => n + v.views, 0).toLocaleString()}</b></div>
          <div className="s-row"><span>Subscribers</span><b>{me.subscribers.toLocaleString()}</b></div>
        </section>
      </div>
    </>
  );
}

export default async function StudioPage({ params, searchParams }: { params: Promise<{ slug?: string[] }>; searchParams: Promise<{ tab?: string; metric?: string }> }) {
  const [{ slug = [] }, { tab = 'videos', metric = 'views' }] = await Promise.all([params, searchParams]);
  const [section = '', arg] = slug;
  const me = await getMe();
  if (!me) return <SignedOut icon="video_settings" title="Vidora Studio" text="Sign in to upload videos and manage your channel." next="/studio" />;

  let body: React.ReactNode;
  if (section === '') body = <Dashboard me={me} />;
  else if (section === 'content') {
    const all = channelVideos(me.id, me.id);
    const list = all.filter((v) => (tab === 'shorts' ? v.type === 'short' : tab === 'live' ? v.recordedLive : v.type === 'video' && !v.recordedLive));
    const counts = Object.fromEntries((sql('SELECT video_id, COUNT(*) n FROM comments WHERE video_id IN (SELECT id FROM videos WHERE channel_id = ?) GROUP BY video_id').all(me.id) as { video_id: string; n: number }[]).map((r) => [r.video_id, r.n]));
    const myPosts = tab === 'posts' ? posts(me.id, { channel: me.id }) : [];
    body = (
      <>
        <h1>Channel content <span className="actions"><UploadButton short={tab === 'shorts'} /></span></h1>
        <RouteChips param="tab" fallback="videos" items={[{ id: 'videos', label: 'Videos' }, { id: 'shorts', label: 'Shorts' }, { id: 'live', label: 'Live' }, { id: 'posts', label: 'Posts' }]} />
        {tab === 'posts' ? (myPosts.length ? myPosts.map((p) => <PostCard key={p.id} post={p} />) : <EmptyState icon="edit_note" title="No posts yet" />)
          : list.length ? <ContentTable key={tab} videos={list} comments={counts} /> : <EmptyState icon={tab === 'live' ? 'sensors' : 'smart_display'} title="No content available" action={tab === 'live' ? <Link className="btn btn-filled btn-md" href="/studio/live">Go live</Link> : <UploadButton variant="filled" short={tab === 'shorts'} label={tab === 'shorts' ? 'Upload a Short' : 'Upload videos'} />} />}
      </>
    );
  } else if (section === 'video' && arg) {
    const v = getVideo(arg, me.id);
    if (!v || v.channel.id !== me.id) notFound();
    body = <EditVideo video={v} />;
  } else if (section === 'analytics') body = <Analytics me={me} metric={metric} />;
  else if (section === 'comments') {
    const rows = studioComments(me.id, me.id).filter((r) => r.comment.author.id !== me.id);
    body = <><h1>Channel comments</h1>{rows.length ? <StudioComments rows={rows} me={{ name: me.name, avatar: me.avatar }} /> : <EmptyState icon="comment" title="No comments yet" text="When viewers comment on your videos you can reply, pin, heart or remove them here." />}</>;
  } else if (section === 'stories') {
    const group = storyGroups(me.id, [me.id])[0];
    body = (
      <>
        <h1>Stories <span className="actions"><CreateButtons /></span></h1>
        <StoryGate subscribers={me.subscribers} />
        <p className="muted subtitle">Short updates (a photo or text) that appear at the top of your subscribers’ feeds and on your channel for 7 days.</p>
        {group ? <StudioStories slides={group.slides} channelId={me.id} /> : <EmptyState icon="auto_stories" title="No active stories" />}
      </>
    );
  } else if (section === 'live') body = <><h1>Go live</h1><GoLive name={me.name} /></>;
  else if (section === 'customization') body = <Customize channel={channelById(me.id, me.id)!} demoTools={demoTools()} />;
  else notFound();

  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Studio">
        <div className="studio-me"><Avatar channel={me} size={112} /><b>Your channel</b><span className="muted">{me.name}</span></div>
        {NAV.map(([k, icon, label]) => {
          const on = section === k || (section === 'video' && k === 'content');
          return <Link key={k} href={`/studio${k ? `/${k}` : ''}`} className={`studio-link ${on ? 'on' : ''}`} title={label} aria-current={on ? 'page' : undefined}><Icon name={icon} filled={on} /><span>{label}</span></Link>;
        })}
      </nav>
      <div className="studio-main">{body}</div>
    </div>
  );
}
