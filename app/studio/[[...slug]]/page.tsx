import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ago } from '@/components/ago';
import { Thumbnail } from '@/components/cards';
import { RouteChips } from '@/components/route-chips';
import { SignedOut } from '@/components/signed-out';
import { PostCard } from '@/components/social';
import { Avatar, CheckCircleIcon, EmptyState, Icon, MemberBadge } from '@/components/ui';
import { recentSubscribers } from '@/lib/actions/account';
import { studioMembersRoster, studioMembersStats } from '@/lib/actions/social';
import { formatCount, watchHref } from '@/lib/format';
import { getMe } from '@/lib/server/auth';
import { sql } from '@/lib/server/db';
import { analytics, channelById, channelConfig, channelVideos, commentCount, getVideo, monetization, posts, storyGroups, studioComments } from '@/lib/server/queries';
import type { Me } from '@/lib/types';
import { AgreementsDialog, EarnNotify, EarnPanel, EarnTabs, LearningModule, PartnershipsDialog, PayoutsDialog, ShoppingDialog } from './earn-parts';
import { earnTab } from './earn-shared';
import { ContentTable, CreateButtons, Customize, EditVideo, GoLive, SendFeedback, StudioComments, StudioStories, SubcountPanel, UploadButton } from './studio-parts';

export const metadata = { title: 'Vidora Studio' };

const NAV = [
  ['', 'dashboard', 'Dashboard'], ['content', 'video_library', 'Content'], ['analytics', 'bar_chart', 'Analytics'],
  ['comments', 'comment', 'Comments'], ['stories', 'auto_stories', 'Stories'], ['members', 'paid', 'Earn'], ['live', 'sensors', 'Go live'], ['customization', 'auto_awesome', 'Customization'],
  ['subcount', 'equalizer', 'Live subs'],
] as const;

function StoryGate({ subscribers }: { subscribers: number }) {
  const pct = Math.min(100, (subscribers / 10_000) * 100);
  return (
    <div className="gate">
      {pct >= 100 ? <CheckCircleIcon size={24} /> : <Icon name="lock" size={24} />}
      <div className="gate-bar"><i style={{ width: `${pct}%` }} /></div>
      <span>{subscribers.toLocaleString()} / 10,000</span>
    </div>
  );
}

/** Small pieces for the revamped dashboard. */
function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="s-card stat-card">
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      <span className="muted small">{hint}</span>
    </section>
  );
}

function Dashboard({ me }: { me: Me }) {
  const vids = channelVideos(me.id, me.id);
  const latest = vids[0];
  const events = analytics(me.id);
  const hours = events.reduce((n, e) => n + e.seconds, 0) / 3600;
  const views28 = events.length;
  const recent = studioComments(me.id, me.id).filter((r) => r.comment.author.id !== me.id).slice(0, 4);
  const m = monetization(me.id);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 28 }, (_, i) => {
    const from = start.getTime() - (27 - i) * 86_400_000;
    return events.filter((e) => e.at >= from && e.at < from + 86_400_000).length;
  });
  const max = Math.max(1, ...days);
  const W = 720, H = 150, PAD = 6;
  const line = `M${days.map((y, i) => `${((i / 27) * W).toFixed(1)},${(H - PAD - (y / max) * (H - 2 * PAD)).toFixed(1)}`).join(' L')}`;
  const byVideo = new Map<string, number>();
  for (const e of events) byVideo.set(e.video_id, (byVideo.get(e.video_id) ?? 0) + 1);
  const top = vids.map((v) => ({ v, n: byVideo.get(v.id) ?? 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 4);
  const maxTop = Math.max(1, ...top.map((x) => x.n));

  return (
    <>
      <h1>Channel dashboard <CreateButtons /></h1>

      <div className="dash2">
        <StatCard label="Subscribers" value={formatCount(me.subscribers)} hint="Subscribed to your channel" />
        <StatCard label="Views · 28 days" value={formatCount(views28)} hint="Plays of your videos in the last 28 days" />
        <StatCard label="Watch time · 28 days" value={`${hours.toLocaleString('en', { maximumFractionDigits: 1 })} h`} hint="Total time viewers spent on your videos" />
        <StatCard label="Lifetime revenue" value={m.partner ? `$${(m.earnings / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'} hint={m.partner ? 'Estimated, $2–6 per 1,000 views' : 'Unlocked once you reach Partner'} />

        <section className="s-card dash-span-7">
          <h2>Latest video</h2>
          {latest ? (
            <div className="latest-video">
              <Link href={watchHref(latest)} className="latest-thumb"><Thumbnail v={latest} actions={false} /></Link>
              <div className="latest-body">
                <Link href={watchHref(latest)} className="v-title">{latest.title}</Link>
                <span className="muted small"><Ago ts={latest.publishedAt} /> · {latest.duration < 60 ? 'Short' : 'Video'}</span>
                <div className="stat-strip">
                  <div><b>{latest.views.toLocaleString()}</b><span>Views</span></div>
                  <div><b>{latest.likes.toLocaleString()}</b><span>Likes</span></div>
                  <div><b>{commentCount(latest.id)}</b><span>Comments</span></div>
                </div>
                <Link href="/studio/analytics" className="btn btn-tonal btn-md link"><Icon name="bar_chart" />Analytics</Link>
              </div>
            </div>
          ) : (
            <div className="dropzone compact-drop">
              <span className="drop-circle"><Icon name="upload" size={56} /></span>
              <p>Upload and publish a video to see how it performs here.</p>
              <UploadButton variant="filled" label="Upload video" />
            </div>
          )}
        </section>

        <section className="s-card dash-span-5">
          <h2>Monetization</h2>
          {m.partner ? (
            <>
              <div className="monet-on"><Icon name="payments" filled size={20} /> Monetized — you’re earning</div>
              <div className="big">${(m.earnings / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <p className="muted small">Estimated lifetime revenue, accrued from views at a $2–6 RPM.</p>
            </>
          ) : (
            <>
              <p className="muted small">Reach <b>1,000 subscribers</b> and one of the paths below to unlock Partner.</p>
              <div className="gate"><span className="gate-label">Subscribers</span><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.subscribers / 1000) * 100)}%` }} /></div><span>{m.subscribers.toLocaleString()} of 1,000</span></div>
              {(() => {
                const done = [m.watchHours >= 250, m.shortsViews >= 250_000].filter(Boolean).length;
                return (
                  <>
                    <div className="mon-count">{done} of 2 ways to monetize</div>
                    <div className="mon-paths">
                      <div className={`mon-path ${m.watchHours >= 250 ? 'done' : ''}`}>
                        <div className="mon-path-head">{m.watchHours >= 250 ? <CheckCircleIcon size={18} /> : <Icon name="schedule" size={18} />}Option 1 · Watch time</div>
                        <div className="gate"><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.watchHours / 250) * 100)}%` }} /></div></div>
                        <span>{m.watchHours.toLocaleString('en', { maximumFractionDigits: 1 })} of 250 hours</span>
                      </div>
                      <div className={`mon-path ${m.shortsViews >= 250_000 ? 'done' : ''}`}>
                        <div className="mon-path-head">{m.shortsViews >= 250_000 ? <CheckCircleIcon size={18} /> : <Icon name="smart_display" size={18} />}Option 2 · Shorts views</div>
                        <div className="gate"><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.shortsViews / 250_000) * 100)}%` }} /></div></div>
                        <span>{formatCount(m.shortsViews)} of 250K views</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}
          <div className="perks">
            <span className={m.memberships ? 'perk on' : 'perk'}>{m.memberships ? <CheckCircleIcon size={16} /> : <Icon name="lock" size={16} />}Memberships (500 subs)</span>
            <span className={m.verified ? 'perk on' : 'perk'}>{m.verified ? <CheckCircleIcon size={16} /> : <Icon name="lock" size={16} />}Verified (50K subs)</span>
            <span className={m.shop ? 'perk on' : 'perk'}>{m.shop ? <CheckCircleIcon size={16} /> : <Icon name="lock" size={16} />}Shop (50K subs)</span>
          </div>
        </section>

        <section className="s-card dash-span-7">
          <h2>Views <span className="muted small">last 28 days</span></h2>
          {views28 > 0 ? (
            <>
              <svg className="dash-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Views per day, last 28 days">
                {[0.25, 0.5, 0.75].map((f) => <line key={f} className="grid-line" x1="0" x2={W} y1={H - PAD - f * (H - 2 * PAD)} y2={H - PAD - f * (H - 2 * PAD)} />)}
                <path className="area" d={`${line} L${W},${H - PAD} L0,${H - PAD} Z`} />
                <path className="line" d={line} />
              </svg>
              <div className="chart-axis"><span>28 days ago</span><span>14 days ago</span><span>Today</span></div>
            </>
          ) : <p className="muted">No views in the last 28 days. Share a video and come back when the algorithm pushes it.</p>}
        </section>

        <section className="s-card dash-span-5">
          <h2>Top videos <span className="muted small">28 days</span></h2>
          {top.length ? (
            <ol className="top-list">
              {top.map(({ v, n }, i) => (
                <li key={v.id}>
                  <span className="top-rank">{i + 1}</span>
                  <div className="top-body">
                    <Link href={watchHref(v)} className="top-title">{v.title}</Link>
                    <div className="top-bar-row">
                      <div className="top-bar"><i style={{ width: `${(n / maxTop) * 100}%` }} /></div>
                      <b>{formatCount(n)}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Your best-performing videos will rank here once they start getting plays.</p>}
        </section>

        <section className="s-card dash-span-7">
          <h2>Latest comments</h2>
          {recent.length ? recent.map(({ comment: c }) => (
            <div key={c.id} className="comment">
              <Avatar name={c.author.handle} src={c.author.avatar} size={32} />
              <div className="c-body">
                <div className="c-who"><span>{c.author.handle}</span><span className="c-when"><Ago ts={c.createdAt} /></span></div>
                <div className="c-text">{c.text}</div>
              </div>
            </div>
          )) : <p className="muted">Comments on your videos show up here as they arrive.</p>}
          <Link href="/studio/comments" className="btn btn-text btn-md link">Moderate comments</Link>
        </section>

        <section className="s-card dash-span-5">
          <div className="card-row split-between">
            <h2>Stories</h2>
            <Link href="/studio/stories" className="btn btn-tonal btn-md link"><Icon name="auto_stories" />Manage stories</Link>
          </div>
          <StoryGate subscribers={me.subscribers} />
          <p className="muted">Stories appear at the top of your subscribers’ feeds and on your channel, and vanish after 7 days.</p>
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
    return metric === 'hours' ? events.filter((e) => e.at >= from && e.at < from + 86_400_000).reduce((n, e) => n + e.seconds, 0) / 3600 : events.filter((e) => e.at >= from && e.at < from + 86_400_000).length;
  });
  const total = events.length;
  const totalHours = events.reduce((n, e) => n + e.seconds, 0) / 3600;
  const avgViews = total / 28;
  const max = Math.max(1e-9, ...days);
  const W = 800, H = 240;
  const line = `M${days.map((y, i) => `${((i / 27) * W).toFixed(1)},${(H - 16 - (y / max) * (H - 40)).toFixed(1)}`).join(' L')}`;
  const byVideo = new Map<string, number>();
  for (const e of events) byVideo.set(e.video_id, (byVideo.get(e.video_id) ?? 0) + 1);
  const top = vids.map((v) => ({ v, n: byVideo.get(v.id) ?? 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 5);
  const maxTop = Math.max(1, ...top.map((x) => x.n));
  return (
    <>
      <h1>Channel analytics</h1>
      <p className="muted subtitle">Plays of your videos over the last 28 days, from all viewers.</p>
      <div className="dash2">
        <section className="s-card dash-span-7">
          <h2>{metric === 'hours' ? 'Watch time' : 'Views'} — last 28 days</h2>
          <div className="stat-inline">
            <div><b>{metric === 'hours' ? totalHours.toLocaleString('en', { maximumFractionDigits: 1 }) : total.toLocaleString()}</b><span>{metric === 'hours' ? 'hours watched' : 'total views'}</span></div>
            <div><b>{metric === 'hours' ? `${(totalHours / 28).toFixed(1)} h` : Math.round(avgViews).toLocaleString()}</b><span>{metric === 'hours' ? 'per day' : 'views per day'}</span></div>
            <div><b>{events.length ? Math.max(...days).toLocaleString() : '0'}</b><span>best day</span></div>
          </div>
          {events.length ? (
            <>
              <svg className="dash-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${metric === 'hours' ? 'Watch time' : 'Views'} per day`}>
                {[0.25, 0.5, 0.75].map((f) => <line key={f} className="grid-line" x1="0" x2={W} y1={16 + (1 - f) * (H - 32)} y2={16 + (1 - f) * (H - 32)} />)}
                <path className="area" d={`${line} L${W},${H - 16} L0,${H - 16} Z`} />
                <path className="line" d={line} />
              </svg>
              <div className="chart-axis"><span>28 days ago</span><span>14 days ago</span><span>Today</span></div>
            </>
          ) : <p className="muted">No views yet — analytics will populate once your videos start getting watched.</p>}
          <RouteChips param="metric" fallback="views" items={[{ id: 'views', label: `Views (${total.toLocaleString()})` }, { id: 'hours', label: `Watch time (${totalHours.toFixed(1)} h)` }]} />
        </section>
        <section className="s-card dash-span-5">
          <h2>Top content</h2>
          {top.length ? (
            <ol className="bar-list">
              {top.map(({ v, n }, i) => (
                <li key={v.id}>
                  <span className="bar-rank">{i + 1}</span>
                  <div className="bar-body">
                    <Link href={watchHref(v)} className="bar-title">{v.title}</Link>
                    <div className="bar-row">
                      <div className="bar-track"><i style={{ width: `${(n / maxTop) * 100}%` }} /></div>
                      <b className="bar-n">{formatCount(n)}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Your best-performing videos will rank here once they start getting plays.</p>}
        </section>
        <section className="s-card dash-span-5">
          <h2>Lifetime</h2>
          <div className="stat-inline">
            <div><b>{vids.filter((v) => v.type === 'video').length}</b><span>Videos</span></div>
            <div><b>{vids.filter((v) => v.type === 'short').length}</b><span>Shorts</span></div>
            <div><b>{vids.reduce((n, v) => n + v.views, 0).toLocaleString()}</b><span>Views</span></div>
            <div><b>{me.subscribers.toLocaleString()}</b><span>Subscribers</span></div>
          </div>
        </section>
        <section className="s-card dash-span-7">
          <h2>Best days</h2>
          {events.length ? (
            <ol className="bar-list">
              {(() => {
                const byDay = new Map<number, number>();
                for (const e of events) {
                  const d = new Date(e.at);
                  d.setHours(0, 0, 0, 0);
                  byDay.set(d.getTime(), (byDay.get(d.getTime()) ?? 0) + 1);
                }
                return [...byDay.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([day, n]) => (
                    <li key={day}>
                      <div className="bar-body">
                        <span className="bar-title" style={{ cursor: 'default' }}>{new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                        <div className="bar-row">
                          <div className="bar-track"><i style={{ width: `${(n / Math.max(...byDay.values())) * 100}%` }} /></div>
                          <b className="bar-n">{formatCount(n)}</b>
                        </div>
                      </div>
                    </li>
                  ));
              })()}
            </ol>
          ) : <p className="muted">Your best days will appear here once analytics starts recording plays.</p>}
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
    const videoCount = all.filter((v) => v.type === 'video' && !v.recordedLive).length;
    const shortCount = all.filter((v) => v.type === 'short').length;
    const liveCount = all.filter((v) => v.recordedLive).length;
    const postCount = posts(me.id, { channel: me.id }).length;
    body = (
      <>
        <h1>Channel content <span className="actions"><UploadButton short={tab === 'shorts'} /></span></h1>
        <RouteChips param="tab" fallback="videos" items={[
          { id: 'videos', label: `Videos · ${videoCount}` },
          { id: 'shorts', label: `Shorts · ${shortCount}` },
          { id: 'live', label: `Live · ${liveCount}` },
          { id: 'posts', label: `Posts · ${postCount}` },
        ]} />
        {tab === 'posts' ? (myPosts.length ? <div className="posts-stack">{myPosts.map((p) => <PostCard key={p.id} post={p} />)}</div> : <EmptyState icon="edit_note" title="No posts yet" text="Share an update, a poll or a sneak peek with your community." action={<Link className="btn btn-filled btn-md" href={`/${me.handle}/community`}>Create a post</Link>} />)
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
    body = (
      <>
        <h1>Channel comments</h1>
        <div className="comments-block">
          {rows.length ? <StudioComments rows={rows} me={{ name: me.name, avatar: me.avatar }} /> : <EmptyState icon="comment" title="No comments yet" text="When viewers comment on your videos you can reply, pin, heart or remove them here." />}
        </div>
      </>
    );
  } else if (section === 'stories') {
    const group = storyGroups(me.id, [me.id])[0];
    const totalViews = group?.slides.reduce((n, s) => n + s.views, 0) ?? 0;
    body = (
      <>
        <h1>Stories <span className="actions"><CreateButtons /></span></h1>
        {group && <div className="card-row split-between"><span className="muted small">Active stories: <b>{group.slides.length}</b> · Total views this week: <b>{totalViews.toLocaleString()}</b></span></div>}
        <section className="s-card"><h2>Stories gate</h2>
          <StoryGate subscribers={me.subscribers} />
          <p className="muted small">Stories show at the top of your subscribers’ feeds and on your channel. They expire 7 days after they’re posted.</p>
        </section>
        {group ? (
          <div className="stories-grid">
            <StudioStories slides={group.slides} channelId={me.id} />
          </div>
        ) : <EmptyState icon="auto_stories" title="No active stories" text="Record a photo or a quick video to appear at the top of your fans’ feeds for a week." action={<Link className="btn btn-filled btn-md" href="/studio">Go to dashboard</Link>} />}
      </>
    );
  } else if (section === 'members') {
    const et = earnTab(tab);
    const m = monetization(me.id);
    const [rosterR, statsR] = await Promise.all([studioMembersRoster(me.id), studioMembersStats(me.id)]);
    const roster = rosterR.ok ? rosterR.data : [];
    const stats = statsR.ok ? statsR.data : { revenueCents: 0, memberCount: 0, creatorShareCents: 0 };
    const earned = m.earnings / 100;
    const paidOut = m.earnings >= 100_00;
    const subsPct = Math.min(100, (m.subscribers / 1000) * 100);
    const watchPct = Math.min(100, (m.watchHours / 250) * 100);
    const shortsPct = Math.min(100, (m.shortsViews / 250_000) * 100);
    const myVideos = channelVideos(me.id, me.id);
    const totalViews = (sql('SELECT COALESCE(SUM(views), 0) n FROM videos WHERE channel_id = ?').get(me.id) as { n: number }).n;
    const engagement = totalViews > 0 ? `${((myVideos.reduce((n, v) => n + v.likes, 0) / totalViews) * 100).toFixed(1)}%` : '—';
    const memberReqs = [
      { ok: m.subscribers >= 500, label: `500 subscribers (you have ${m.subscribers.toLocaleString()})` },
      { ok: m.uploads >= 3, label: `3 public uploads in the last 90 days (${m.uploads})` },
      { ok: m.watchHours >= 100, label: `100 watch hours all time (${Math.floor(m.watchHours).toLocaleString()})` },
    ];
    const earnNotified = !!(sql('SELECT earn_notified FROM users WHERE id = ?').get(me.id) as { earn_notified: number } | undefined)?.earn_notified;
    const canMember = memberReqs.every((r) => r.ok);
    const shopPct = Math.min(100, (m.subscribers / 50_000) * 100);

    if (et === 'memberships') {
      body = (
        <div className="earn-page">
          <div className="earn-sticky"><h1>Earn on YouTube</h1><EarnTabs active={et} /></div>
          <section className="s-card">
            <h2>Memberships</h2>
            <div className="stat-inline">
              <div><b>{stats.memberCount.toLocaleString()}</b><span>Active members</span></div>
              <div><b>${(stats.revenueCents / 100).toFixed(2)}</b><span>Monthly revenue</span></div>
              <div><b>${(stats.creatorShareCents / 100).toFixed(2)}</b><span>Creator share (70%)</span></div>
            </div>
          </section>
          <section className="s-card">
            <h2>Roster</h2>
            {roster.length ? (
              <ol className="recent-subs">
                {roster.map((m) => (
                  <li key={m.id}>
                    <Link href={`/${m.handle}`}><Avatar name={m.name} src={m.avatar} size={40} /></Link>
                    <div className="recent-sub-body"><b>{m.name}</b><span className="muted small">{m.handle}</span></div>
                    <MemberBadge tier={m.tier} />
                    <span className="recent-sub-when muted small"><Ago ts={m.started_at} /></span>
                  </li>
                ))}
              </ol>
            ) : <p className="muted">No members yet — publish the Join button to turn superfans into members.</p>}
          </section>
        </div>
      );

    } else if (et === 'supers') {
      body = (
        <div className="earn-page">
          <div className="earn-sticky"><h1>Earn on YouTube</h1><EarnTabs active={et} /></div>
          <div className="earn-narrow">
            <section className="s-card earn-hero-card">
              <div className="earn-big-icon"><Icon name="card_giftcard" filled size={56} /></div>
              <h2 className="earn-partner">Supers &amp; gifts</h2>
              <p className="earn-panel-text">Let your fans join the fun and be part of your stream by sending gifts. You&apos;ll earn money each time you receive a gift.</p>
              <ul className="earn-dialog-list">
                <li><Icon name="check" size={16} />Gifts appear live to everyone watching your stream</li>
                <li><Icon name="check" size={16} />Gift revenue counts as your share — paid out with everything else you earn</li>
                <li><Icon name="check" size={16} />Available to channels on the fan-funding tier</li>
              </ul>
              {canMember ? (
                <div className="earn-cta-row"><Link href="/studio/live" className="btn btn-filled btn-md">Go live to enable gifts</Link></div>
              ) : (
                <>
                  <h3 className="earn-section-title">Get fan funding first</h3>
                  <ul className="earn-req-list">
                    {memberReqs.map((r) => (
                      <li key={r.label} className={r.ok ? 'on' : ''}>{r.ok ? <CheckCircleIcon size={18} /> : <Icon name="lock" size={18} />}{r.label}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      );

    } else if (et === 'shopping') {
      body = (
        <div className="earn-page">
          <div className="earn-sticky"><h1>Earn on YouTube</h1><EarnTabs active={et} /></div>
          <div className="earn-narrow">
            {m.shop ? (
              <section className="s-card earn-hero-card">
                <div className="earn-big-icon"><Icon name="shopping_bag" filled size={56} /></div>
                <h2 className="earn-partner">Shopping</h2>
                <p className="earn-panel-text">Share products on your channel from your own store or the YouTube Shopping affiliate program.</p>
                <ul className="earn-dialog-list">
                  <li><Icon name="check" size={16} />Products appear on the watch page and below your videos</li>
                  <li><Icon name="check" size={16} />Members get early access to drops</li>
                </ul>
                <ShoppingDialog />
              </section>
            ) : (
              <section className="s-card earn-hero-card">
                <div className="earn-big-icon"><Icon name="lock" size={56} /></div>
                <h2 className="earn-partner">Shopping unlocks at 50,000 subscribers</h2>
                <div className="earn-elig-row"><span><b>{m.subscribers.toLocaleString()}</b> subscribers</span><span className="earn-elig-threshold">50,000</span></div>
                <div className="gate-bar"><i style={{ width: `${shopPct}%` }} /></div>
                <p className="muted">Verified channels with 50,000 or more subscribers can tag products on their channel page and in their videos.</p>
              </section>
            )}
          </div>
        </div>
      );

    } else if (et === 'partnerships') {
      body = (
        <div className="earn-page">
          <div className="earn-sticky"><h1>Earn on YouTube</h1><EarnTabs active={et} /></div>
          <div className="earn-narrow">
            <section className="s-card earn-hero-card">
              <div className="earn-big-icon"><Icon name="handshake" filled size={56} /></div>
              <h2 className="earn-partner">Creator Partnerships</h2>
              <p className="earn-panel-text">Creator Partnerships helps by using technology to match creators like you with brands looking to create influencer marketing campaigns.</p>
              <PartnershipsDialog />
              <h3 className="earn-section-title">What brands look at</h3>
              <div className="stat-inline">
                <div><b>{m.subscribers.toLocaleString()}</b><span>Subscribers</span></div>
                <div><b>{myVideos.length.toLocaleString()}</b><span>Public videos</span></div>
                <div><b>{formatCount(totalViews)}</b><span>Total views</span></div>
                <div><b>{stats.memberCount.toLocaleString()}</b><span>Members</span></div>
                <div><b>{engagement}</b><span>Engagement</span></div>
              </div>
              <p className="muted small">Brands prefer steady uploads with an engaged audience — channels with active memberships get matched first.</p>
            </section>
          </div>
        </div>
      );

    } else {
      body = (
        <div className="earn-page">
          <div className="earn-sticky"><h1>Earn on YouTube</h1><EarnTabs active={et} /></div>
          <div className="earn-layout">
            <div className="earn-col">
              <section className="s-card earn-main-card">
                {m.partner ? (
                  <>
                    <h2 className="earn-partner">You&apos;re a YouTube Partner</h2>
                    <p className="earn-paid-line">Estimated lifetime earnings: <b>${earned.toFixed(2)}</b></p>
                    <h3 className="earn-section-title">Your monetization</h3>
                    <ul className="earn-feature-list">
                      <li className="earn-feature"><Icon name="smart_display" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>Watch Page Ads</b><small>Ads before, during and after your videos</small></span><span className="earn-pill on">On</span></li>
                      <li className="earn-feature"><Icon name="play_arrow" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>Shorts Feed Ads</b><small>Automated ad revenue from the Shorts feed</small></span><span className="earn-pill on">On</span></li>
                      <li className="earn-feature"><Icon name="star" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>YouTube Premium</b><small>A share of Premium subscriptions for your watch time</small></span><span className="earn-pill on">On</span></li>
                      <li className="earn-feature"><Icon name="loyalty" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>Channel memberships</b><small>{stats.memberCount.toLocaleString()} active · monthly support from members</small></span><Link href="/studio/members?tab=memberships" className="earn-pill link">Manage</Link></li>
                      <li className="earn-feature"><Icon name="card_giftcard" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>Supers &amp; gifts</b><small>Fans pay to highlight messages in live chat</small></span><Link href="/studio/members?tab=supers" className="earn-pill link">View</Link></li>
                      <li className="earn-feature"><Icon name="shopping_bag" filled size={22} className="earn-feature-icon" /><span className="earn-feature-body"><b>Shopping</b><small>{m.shop ? 'Tag products on your channel' : 'Unlocks at 50,000 subscribers'}</small></span>{m.shop ? <Link href="/studio/members?tab=shopping" className="earn-pill link">View</Link> : <span className="earn-pill off">Locked</span>}</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <h2 className="earn-partner">Become a YouTube Partner</h2>
                    <p className="earn-paid-line">Two ways to start earning on Vidora.</p>
                    <div className="earn-tier-grid">
                      <div className={`earn-tier ${m.memberships ? 'done' : ''}`}>
                        <div className="earn-tier-head">
                          <Icon name="loyalty" filled size={28} className="earn-tier-icon" />
                          <span className="earn-tier-text"><h3>Fan funding</h3><small>Memberships · Supers &amp; gifts</small></span>
                          {m.memberships ? <CheckCircleIcon size={22} /> : <span className="earn-pill off">Locked</span>}
                        </div>
                        <div className="gate"><span className="gate-label">Subscribers</span><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.subscribers / 500) * 100)}%` }} /></div><span>{Math.min(m.subscribers, 500).toLocaleString()} of 500</span></div>
                        <div className="gate"><span className="gate-label">Public uploads · 90 days</span><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.uploads / 3) * 100)}%` }} /></div><span>{Math.min(m.uploads, 3)} of 3</span></div>
                        <div className="earn-tier-either">Either</div>
                        <div className="gate"><span className="gate-label">Watch hours</span><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.watchHours / 100) * 100)}%` }} /></div><span>{Math.floor(m.watchHours).toLocaleString()} of 100</span></div>
                        <div className="gate"><span className="gate-label">Shorts views</span><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.shortsViews / 250_000) * 100)}%` }} /></div><span>{formatCount(m.shortsViews)} of 250K</span></div>
                        {m.memberships && <Link href="/studio/members?tab=memberships" className="btn btn-filled btn-sm earn-tier-cta">Set up memberships</Link>}
                      </div>
                      <div className={`earn-tier ${m.partner ? 'done' : ''}`}>
                        <div className="earn-tier-head">
                          <Icon name="payments" filled size={28} className="earn-tier-icon" />
                          <span className="earn-tier-text"><h3>Full monetization</h3><small>Watch page ads · Shorts ads · Premium</small></span>
                          {m.partner ? <CheckCircleIcon size={22} /> : <span className="earn-pill off">Locked</span>}
                        </div>
                        <div className="gate"><span className="gate-label">Subscribers</span><div className="gate-bar"><i style={{ width: `${subsPct}%` }} /></div><span>{Math.min(m.subscribers, 1000).toLocaleString()} of 1,000</span></div>
                        <div className="earn-tier-either">Either</div>
                        <div className="gate"><span className="gate-label">Watch hours</span><div className="gate-bar"><i style={{ width: `${watchPct}%` }} /></div><span>{Math.floor(m.watchHours).toLocaleString()} of 250</span></div>
                        <div className="gate"><span className="gate-label">Shorts views</span><div className="gate-bar"><i style={{ width: `${shortsPct}%` }} /></div><span>{formatCount(m.shortsViews)} of 250K</span></div>
                        <p className="muted small">$2–6 per 1,000 views, credited automatically.</p>
                        {!m.partner && <EarnNotify notified={earnNotified} />}
                      </div>
                    </div>
                  </>
                )}
                <h3 className="earn-section-title">More ways to earn</h3>
                <div className="earn-panels">
                  <EarnPanel id="gifts" title="Gifts" defaultOpen>
                    <h4 className="earn-panel-heading">Turn on gifts in live streams</h4>
                    <p className="earn-panel-text">Let your fans join the fun and be part of your stream by sending gifts. You&apos;ll earn money each time you receive a gift.</p>
                    <Link href="/studio/members?tab=supers" className="btn btn-filled btn-sm">Get started</Link>
                  </EarnPanel>
                  <hr className="earn-divider" />
                  <EarnPanel id="memberships" title="Memberships">
                    <h4 className="earn-panel-heading">Let people support you with monthly memberships</h4>
                    <p className="earn-panel-text">Members get badges, members-only posts and perks you choose.</p>
                    {canMember ? (
                      <Link href="/studio/members?tab=memberships" className="btn btn-filled btn-sm">Get started</Link>
                    ) : (
                      <ul className="earn-req-list">
                        {memberReqs.map((r) => (
                          <li key={r.label} className={r.ok ? 'on' : ''}>{r.ok ? <CheckCircleIcon size={18} /> : <Icon name="lock" size={18} />}{r.label}</li>
                        ))}
                      </ul>
                    )}
                  </EarnPanel>
                  <hr className="earn-divider" />
                  <EarnPanel id="partnerships" title="Creator Partnerships">
                    <h4 className="earn-panel-heading">Get brand deals your audience will love</h4>
                    <p className="earn-panel-text">Creator Partnerships helps by using technology to match creators like you with brands looking to create influencer marketing campaigns.</p>
                    <PartnershipsDialog />
                  </EarnPanel>
                  <hr className="earn-divider" />
                  <EarnPanel id="shopping" title="Shopping">
                    <h4 className="earn-panel-heading">Turn your viewers into customers</h4>
                    <p className="earn-panel-text">Share products on your channel from your own store or the YouTube Shopping affiliate program</p>
                    {m.shop ? <ShoppingDialog /> : <span className="earn-locked-note"><Icon name="lock" size={16} />Unlocks at 50,000 subscribers</span>}
                  </EarnPanel>
                </div>
              </section>
            </div>
            <div className="earn-col earn-col-side">
              <section className="s-card">
                <div className="earn-paid-head">
                  <h2>Getting paid</h2>
                  <span className={`earn-badge ${paidOut ? 'ready' : ''}`}>{paidOut ? 'Ready for payment' : 'Not ready for payment'}</span>
                </div>
                {paidOut ? (
                  <p className="earn-paid-text">You&apos;ve passed the $100 lifetime threshold — we&apos;ll email you when your payout is processed.</p>
                ) : (
                  <>
                    <p className="earn-paid-text"><b>What you need to do</b></p>
                    <p className="earn-paid-2">No action needed right now</p>
                    <p className="muted small">You haven&apos;t yet met the <a href="https://support.google.com/youtube/answer/14727140?hl=en" target="_blank" rel="noopener noreferrer">payment threshold</a> to receive payment.</p>
                  </>
                )}
                <div className="earn-paid-progress"><div className="gate-bar"><i style={{ width: `${Math.min(100, (m.earnings / 10000) * 100)}%` }} /></div><span className="muted small">${earned.toFixed(2)} of $100</span></div>
              </section>
              <section className="s-card">
                <h2>Vidora Partner Program options</h2>
                <div className="earn-option">
                  <div><b>Creator earnings</b><p className="muted small">View RPM plus 70% of membership fees, credited automatically.</p></div>
                  <PayoutsDialog />
                </div>
                <div className="earn-option">
                  <div><b>Agreements</b><p className="muted small">The Partner Program terms you accepted when you joined.</p></div>
                  <AgreementsDialog />
                </div>
              </section>
              <section className="s-card">
                <h2>Creator resources &amp; tools</h2>
                <div className="earn-resource-grid">
                  <a className="earn-resource" href="https://support.google.com/youtube/answer/3545535?hl=en" target="_blank" rel="noopener noreferrer"><Icon name="support_agent" size={22} /><span>Creator Support</span></a>
                  <a className="earn-resource" href="https://support.google.com/youtube/answer/7648743?hl=en" target="_blank" rel="noopener noreferrer"><Icon name="link" size={22} /><span>Copyright Match Tool</span></a>
                  <a className="earn-resource" href="https://support.google.com/youtube/answer/6388789?hl=en" target="_blank" rel="noopener noreferrer"><Icon name="video_library" size={22} /><span>Video end screens</span></a>
                  <a className="earn-resource" href="https://support.google.com/youtube/answer/72851?hl=en" target="_blank" rel="noopener noreferrer"><Icon name="open_in_new" size={22} /><span>Partner Program terms</span></a>
                </div>
              </section>
            </div>
          </div>
          <LearningModule />
        </div>
      );
    }
  } else if (section === 'live') body = <><h1>Go live</h1><p className="muted subtitle">Record a live-feeling stream directly from your webcam — it’s saved to your channel and published when you end the stream.</p><GoLive name={me.name} /></>;
  else if (section === 'customization') body = <><h1>Channel customization</h1><p className="muted subtitle">Update your banner, avatar, watermark, layout and bio — like YouTube&apos;s Customization.</p><Customize channel={channelById(me.id, me.id)!} config={channelConfig(me.id)} /></>;
  else if (section === 'subcount') {
    const recent = await recentSubscribers(6);
    body = <><h1>Live subscribers</h1><SubcountPanel initial={me.subscribers} recent={recent.ok ? recent.data : []} /></>;
  }
  else notFound();

  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Studio">
        <div className="studio-thumb">
          <Link href={`/${me.handle}`} target="_blank" rel="noopener" className="studio-thumb-fig studio-overlay-container" aria-label="View your channel on Vidora (opens in a new tab)" data-tooltip="View your channel">
            <Avatar channel={me} size={128} />
            <span className="studio-grey-overlay" aria-hidden="true" />
            <span className="studio-overlay-link" aria-hidden="true">
              <span className="studio-open-icon">
                <svg xmlns="http://www.w3.org/2000/svg" height="30" viewBox="0 0 24 24" width="30" focusable="false" aria-hidden="true" style={{ pointerEvents: 'none', display: 'block' }} fill="currentColor"><path d="M19 5H8a1 1 0 000 2h7.586L5.293 17.293a1 1 0 101.414 1.414L17 8.414V16a1 1 0 002 0V5Z" /></svg>
              </span>
            </span>
          </Link>
          <div className="studio-entity">
            <span className="studio-entity-type">Your channel</span>
            <b className="studio-entity-name">{me.name}</b>
          </div>
        </div>
        <ul className="studio-items">
          {NAV.map(([k, icon, label]) => {
            const on = section === k || (section === 'video' && k === 'content');
            return (
              <li key={k}>
                <Link href={`/studio${k ? `/${k}` : ''}`} className={`studio-link ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
                  <Icon name={icon} filled={on} /><span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="studio-bottom">
          <hr className="studio-divider" />
          <Link href="/account" className="studio-link"><Icon name="settings" size={24} /><span>Settings</span></Link>
          <SendFeedback />
        </div>
      </nav>
      <div className="studio-main">{body}</div>
    </div>
  );
}
