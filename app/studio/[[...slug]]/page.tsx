'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApp } from '@/components/app-context';
import { Thumbnail, watchHref } from '@/components/cards';
import { Player } from '@/components/player';
import { PostCard } from '@/components/social';
import { Avatar, Button, Chips, ConfirmDialog, EmptyState, Field, Icon, IconButton, MediaImg, ShortsIcon, useToast } from '@/components/ui';
import { formatDate, formatDuration, timeAgo, uid } from '@/lib/format';
import { deleteFile, putFile } from '@/lib/media';
import { activeStories, myChannel, setDocumentTitle, STORY_MIN_SUBS, update, useDB, useNow } from '@/lib/store';
import type { Video, Visibility } from '@/lib/types';

const NAV = [
  ['', 'dashboard', 'Dashboard'], ['content', 'video_library', 'Content'], ['analytics', 'bar_chart', 'Analytics'],
  ['comments', 'comment', 'Comments'], ['stories', 'auto_stories', 'Stories'], ['live', 'sensors', 'Go live'], ['customization', 'palette', 'Customization'],
] as const;

const visIcon = (v: Visibility) => (v === 'public' ? 'visibility' : v === 'unlisted' ? 'link' : 'lock');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function StudioPage() {
  const params = useParams<{ slug?: string[] }>();
  const [section = '', arg] = params.slug ?? [];
  const d = useDB();
  const me = myChannel(d);
  useEffect(() => { setDocumentTitle('Vidora Studio'); }, []);
  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Studio">
        <div className="studio-me"><Avatar channel={me} size={112} /><b>Your channel</b><span className="muted">{me.name}</span></div>
        {NAV.map(([k, icon, label]) => (
          <Link key={k} href={`/studio${k ? `/${k}` : ''}`} className={`studio-link ${section === k || (section === 'video' && k === 'content') ? 'on' : ''}`} title={label}>
            <Icon name={icon} filled={section === k} /><span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="studio-main">
        {section === '' && <Dashboard />}
        {section === 'content' && <Content />}
        {section === 'video' && arg && <EditVideo id={arg} />}
        {section === 'analytics' && <Analytics />}
        {section === 'comments' && <StudioComments />}
        {section === 'stories' && <StudioStories />}
        {section === 'live' && <GoLive />}
        {section === 'customization' && <Customize />}
      </div>
    </div>
  );
}

function useMine() {
  const d = useDB();
  return d.videos.filter((v) => v.channelId === 'me').sort((a, b) => b.publishedAt - a.publishedAt);
}

function last28(d: ReturnType<typeof useDB>, ids: Set<string>) {
  const since = Date.now() - 28 * 86_400_000;
  const events = d.user.viewLog.filter((e) => ids.has(e.videoId) && e.at >= since);
  return { views: events.length, hours: events.reduce((n, e) => n + e.seconds, 0) / 3600, events };
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const d = useDB();
  const app = useApp();
  const me = myChannel(d);
  const mine = useMine();
  const latest = mine[0];
  const ids = new Set(mine.map((v) => v.id));
  const stats = last28(d, ids);
  const comments = d.comments.filter((c) => ids.has(c.videoId) && !c.mine).sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const eligible = me.subscribers >= STORY_MIN_SUBS;
  return (
    <>
      <h1>Channel dashboard
        <span className="actions">
          <Button size="sm" icon="upload" onClick={() => app.open({ kind: 'upload' })}>Upload</Button>
          <Link href="/studio/live" className="btn btn-tonal btn-sm"><Icon name="sensors" size={20} />Go live</Link>
          <Button size="sm" icon="edit_note" onClick={() => app.open({ kind: 'post' })}>Post</Button>
          <Button size="sm" icon="add_circle" onClick={() => app.open({ kind: 'story' })}>Story</Button>
        </span>
      </h1>
      <div className="dash">
        <section className="s-card">
          {latest ? (
            <>
              <h2>Latest video performance</h2>
              <Link href={watchHref(latest)}><Thumbnail v={latest} overlayActions={false} /></Link>
              <b>{latest.title}</b>
              <div className="s-row" style={{ marginTop: 12 }}><span>Views</span><b>{latest.views.toLocaleString()}</b></div>
              <div className="s-row"><span>Likes</span><b>{latest.likes.toLocaleString()}</b></div>
              <div className="s-row"><span>Comments</span><b>{d.comments.filter((c) => c.videoId === latest.id).length}</b></div>
              <Link href="/studio/analytics" className="btn btn-text btn-md link">Go to video analytics</Link>
            </>
          ) : (
            <div className="dropzone" style={{ padding: '24px 8px' }}>
              <span className="drop-circle"><Icon name="upload" size={56} /></span>
              <p>Want to see metrics on your recent video? Upload and publish a video to get started.</p>
              <Button variant="filled" onClick={() => app.open({ kind: 'upload' })}>Upload videos</Button>
            </div>
          )}
        </section>
        <section className="s-card">
          <h2>Channel analytics</h2>
          <div className="muted">Current subscribers</div>
          <div className="big">{me.subscribers.toLocaleString()}</div>
          <hr style={{ border: 0, borderTop: '1px solid var(--divider)', margin: '16px 0' }} />
          <b>Summary</b> <span className="muted small">Last 28 days, this browser</span>
          <div className="s-row"><span>Views</span><b>{stats.views.toLocaleString()}</b></div>
          <div className="s-row"><span>Watch time (hours)</span><b>{stats.hours.toFixed(1)}</b></div>
          <Link href="/studio/analytics" className="btn btn-text btn-md link">Go to channel analytics</Link>
        </section>
        <section className="s-card">
          <h2>Stories</h2>
          <StoryGate />
          <p className="muted">Stories appear at the top of your subscribers’ feeds and on your channel, and disappear after 7 days.</p>
          <div className="row-wrap" style={{ marginTop: 16 }}>
            <Button variant="blue" disabled={!eligible} onClick={() => app.open({ kind: 'story' })}>Create story</Button>
            <Link href="/studio/stories" className="btn btn-text btn-md">Manage</Link>
          </div>
        </section>
        <section className="s-card">
          <h2>Latest comments</h2>
          {comments.length ? comments.map((c) => (
            <div key={c.id} className="comment"><Avatar name={c.author} size={32} /><div className="c-body"><div className="c-who"><span>{c.author}</span><span className="c-when">{timeAgo(c.createdAt)}</span></div><div className="c-text">{c.text}</div></div></div>
          )) : <p className="muted">Comments on your videos will show up here.</p>}
          <Link href="/studio/comments" className="btn btn-text btn-md link">View more</Link>
        </section>
      </div>
    </>
  );
}

function StoryGate() {
  const d = useDB();
  const me = myChannel(d);
  const pct = Math.min(100, (me.subscribers / STORY_MIN_SUBS) * 100);
  return (
    <div className="gate">
      <Icon name={pct >= 100 ? 'check_circle' : 'lock'} filled={pct >= 100} />
      <div className="gate-bar"><i style={{ width: `${pct}%` }} /></div>
      <span>{me.subscribers.toLocaleString()} / {STORY_MIN_SUBS.toLocaleString()}</span>
    </div>
  );
}

/* ---------------- Content ---------------- */
function Content() {
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const mine = useMine();
  const [tab, setTab] = useState('videos');
  const [confirm, setConfirm] = useState<Video | null>(null);
  const now = useNow();
  const list = mine.filter((v) => (tab === 'videos' ? v.type === 'video' && !v.recordedLive : tab === 'shorts' ? v.type === 'short' : tab === 'live' ? v.recordedLive : false));
  const posts = d.posts.filter((p) => p.channelId === 'me');
  return (
    <>
      <h1>Channel content <span className="actions"><Button variant="blue" size="sm" icon="upload" onClick={() => app.open({ kind: 'upload', short: tab === 'shorts' })}>Upload</Button></span></h1>
      <Chips value={tab} onChange={setTab} items={[{ id: 'videos', label: 'Videos' }, { id: 'shorts', label: 'Shorts' }, { id: 'live', label: 'Live' }, { id: 'posts', label: 'Posts' }]} />
      {tab === 'posts' ? (
        posts.length ? posts.map((p) => <PostCard key={p.id} p={p} />) : <EmptyState icon="edit_note" title="No posts yet" action={<Button onClick={() => app.open({ kind: 'post' })}>Create post</Button>} />
      ) : list.length ? (
        <div className="table-wrap">
          <table className="s-table">
            <thead><tr><th>{tab === 'shorts' ? 'Short' : 'Video'}</th><th>Visibility</th><th className="hide-m">Date</th><th>Views</th><th className="hide-m">Comments</th><th className="hide-m">Likes</th></tr></thead>
            <tbody>
              {list.map((v) => {
                const scheduled = v.publishedAt > now;
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="s-video">
                        <Link href={`/studio/video/${v.id}`}><Thumbnail v={v} preview={false} overlayActions={false} /></Link>
                        <div>
                          <b>{v.title}</b>
                          <span className="muted">{v.description.split('\n')[0] || 'Add description'}</span>
                          <div className="s-tools">
                            <Link className="icon-btn" href={`/studio/video/${v.id}`} aria-label="Details" data-tooltip="Details"><Icon name="edit" size={20} /></Link>
                            <Link className="icon-btn" href="/studio/analytics" aria-label="Analytics" data-tooltip="Analytics"><Icon name="bar_chart" size={20} /></Link>
                            <Link className="icon-btn" href="/studio/comments" aria-label="Comments" data-tooltip="Comments"><Icon name="comment" size={20} /></Link>
                            <Link className="icon-btn" href={watchHref(v)} aria-label="View" data-tooltip="View on Vidora"><Icon name="play_arrow" size={20} /></Link>
                            <IconButton icon="delete" label="Delete forever" size={32} onClick={() => setConfirm(v)} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span className="vis"><Icon name={scheduled ? 'schedule' : visIcon(v.visibility)} size={18} />{scheduled ? 'Scheduled' : cap(v.visibility)}</span></td>
                    <td className="hide-m">{formatDate(v.publishedAt)}<div className="muted small">{scheduled ? 'Scheduled' : 'Published'}</div></td>
                    <td>{v.views.toLocaleString()}</td>
                    <td className="hide-m">{d.comments.filter((c) => c.videoId === v.id).length}</td>
                    <td className="hide-m">{v.likes.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={tab === 'live' ? 'sensors' : 'smart_display'} title="No content available"
          action={tab === 'live' ? <Link className="btn btn-filled btn-md" href="/studio/live">Go live</Link> : <Button variant="filled" onClick={() => app.open({ kind: 'upload', short: tab === 'shorts' })}>Upload {tab === 'shorts' ? 'a Short' : 'videos'}</Button>} />
      )}
      {confirm && (
        <ConfirmDialog title="Permanently delete this video?" text={`“${confirm.title}” and its comments will be deleted from this browser. This can’t be undone.`} confirm="Delete forever" onClose={() => setConfirm(null)}
          onConfirm={() => {
            const v = confirm;
            update((db) => {
              db.videos = db.videos.filter((x) => x.id !== v.id);
              db.comments = db.comments.filter((c) => c.videoId !== v.id);
              db.playlists.forEach((p) => { p.videoIds = p.videoIds.filter((x) => x !== v.id); });
            });
            deleteFile(v.src); deleteFile(v.thumbnail); deleteFile(v.captions);
            toast('Video deleted');
          }} />
      )}
    </>
  );
}

function EditVideo({ id }: { id: string }) {
  const d = useDB();
  const toast = useToast();
  const router = useRouter();
  const v = d.videos.find((x) => x.id === id && x.channelId === 'me');
  const [title, setTitle] = useState(v?.title ?? '');
  const [desc, setDesc] = useState(v?.description ?? '');
  const [vis, setVis] = useState<Visibility>(v?.visibility ?? 'private');
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [vtt, setVtt] = useState<File | null>(null);
  if (!v) return <EmptyState icon="error" title="Video not found" />;
  const dirty = title !== v.title || desc !== v.description || vis !== v.visibility || !!thumb || !!vtt;
  const save = async () => {
    const newThumb = thumb ? await putFile(thumb) : undefined;
    const newVtt = vtt ? await putFile(vtt) : undefined;
    const oldThumb = v.thumbnail;
    const oldVtt = v.captions;
    update((db) => {
      const x = db.videos.find((y) => y.id === id);
      if (!x) return;
      x.title = title.trim() || x.title;
      x.description = desc;
      x.visibility = vis;
      if (newThumb) x.thumbnail = newThumb;
      if (newVtt) x.captions = newVtt;
    });
    if (newThumb) deleteFile(oldThumb);
    if (newVtt) deleteFile(oldVtt);
    setThumb(null);
    setVtt(null);
    toast('Changes saved');
  };
  return (
    <>
      <h1><IconButton icon="arrow_back" label="Back to content" onClick={() => router.push('/studio/content')} />Video details
        <span className="actions"><Link className="btn btn-tonal btn-sm" href={watchHref(v)}>View</Link><Button variant="filled" size="sm" disabled={!dirty || !title.trim()} onClick={save}>Save</Button></span>
      </h1>
      <div className="upload-grid">
        <div>
          <Field label="Title (required)" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description" count={`${desc.length}/5000`}><textarea rows={8} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <h4>Thumbnail</h4>
          <div className="thumb-picks">
            <label className="thumb-upload"><Icon name="add_photo_alternate" />Change<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setThumb(f); setThumbUrl(URL.createObjectURL(f)); } }} /></label>
            <span className="thumb-pick on">{thumbUrl ? <img src={thumbUrl} alt="" /> : <MediaImg src={v.thumbnail} />}</span>
          </div>
          <h4>Subtitles</h4>
          <label className="btn btn-tonal btn-sm"><Icon name="closed_caption" size={20} />{vtt ? vtt.name : v.captions ? 'Replace .vtt file' : 'Upload a .vtt file'}<input type="file" accept=".vtt,text/vtt" hidden onChange={(e) => setVtt(e.target.files?.[0] ?? null)} /></label>
        </div>
        <aside>
          <Player v={v} autoplay={false} compact />
          <Field label="Visibility">
            <select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}>
              <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
            </select>
          </Field>
          <p className="muted small">{formatDuration(v.duration)} · {v.type === 'short' ? 'Short' : 'Video'} · uploaded {formatDate(v.publishedAt)}</p>
        </aside>
      </div>
    </>
  );
}

/* ---------------- Analytics (real local watch events) ---------------- */
function Analytics() {
  const d = useDB();
  const mine = useMine();
  const me = myChannel(d);
  const [metric, setMetric] = useState<'views' | 'hours'>('views');
  const ids = useMemo(() => new Set(mine.map((v) => v.id)), [mine]);
  const { views, hours, events } = last28(d, ids);
  const days = Array.from({ length: 28 }, (_, i) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (27 - i));
    const end = start.getTime() + 86_400_000;
    const inDay = events.filter((e) => e.at >= start.getTime() && e.at < end);
    return metric === 'views' ? inDay.length : inDay.reduce((n, e) => n + e.seconds, 0) / 3600;
  });
  const max = Math.max(1e-9, ...days);
  const W = 800, H = 220;
  const pts = days.map((y, i) => [(i / 27) * W, H - 12 - (y / max) * (H - 32)]);
  const line = `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' L')}`;
  const top = mine.map((v) => ({ v, n: events.filter((e) => e.videoId === v.id).length })).sort((a, b) => b.n - a.n).slice(0, 5);
  return (
    <>
      <h1>Channel analytics</h1>
      <p className="muted" style={{ marginTop: -16, marginBottom: 24 }}>Counted from playback in this browser over the last 28 days.</p>
      <section className="s-card">
        <div className="kpis">
          <button type="button" className={metric === 'views' ? 'on' : ''} onClick={() => setMetric('views')}><small>Views</small><b>{views.toLocaleString()}</b></button>
          <button type="button" className={metric === 'hours' ? 'on' : ''} onClick={() => setMetric('hours')}><small>Watch time (hours)</small><b>{hours.toFixed(1)}</b></button>
          <button type="button" disabled><small>Subscribers</small><b>{me.subscribers.toLocaleString()}</b></button>
        </div>
        {events.length ? (
          <>
            <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${metric} per day for the last 28 days`}>
              {[0, 1, 2, 3].map((i) => <line key={i} className="grid-line" x1="0" x2={W} y1={20 + (i * (H - 32)) / 3} y2={20 + (i * (H - 32)) / 3} />)}
              <path className="area" d={`${line} L${W},${H - 12} L0,${H - 12} Z`} />
              <path className="line" d={line} />
            </svg>
            <div className="chart-axis"><span>28 days ago</span><span>Today</span></div>
          </>
        ) : <EmptyState icon="bar_chart" title="No views in the last 28 days" text={mine.length ? 'Watch one of your videos to see it counted here.' : 'Upload a video to start collecting analytics.'} />}
      </section>
      <div className="dash" style={{ marginTop: 24 }}>
        <section className="s-card">
          <h2>Your top content</h2>
          {top.length ? top.map(({ v, n }, i) => <div key={v.id} className="s-row"><span>{i + 1}. {v.title}</span><b>{n}</b></div>) : <p className="muted">No content yet</p>}
        </section>
        <section className="s-card">
          <h2>Lifetime</h2>
          <div className="s-row"><span>Videos</span><b>{mine.filter((v) => v.type === 'video').length}</b></div>
          <div className="s-row"><span>Shorts</span><b>{mine.filter((v) => v.type === 'short').length}</b></div>
          <div className="s-row"><span>Total views</span><b>{mine.reduce((n, v) => n + v.views, 0).toLocaleString()}</b></div>
          <div className="s-row"><span>Total likes</span><b>{mine.reduce((n, v) => n + v.likes, 0).toLocaleString()}</b></div>
        </section>
      </div>
    </>
  );
}

/* ---------------- Comments moderation ---------------- */
function StudioComments() {
  const d = useDB();
  const mine = useMine();
  const ids = new Set(mine.map((v) => v.id));
  const [reply, setReply] = useState<string | null>(null);
  const [text, setText] = useState('');
  const me = myChannel(d);
  const rows = d.comments.filter((c) => ids.has(c.videoId) && !c.parentId).sort((a, b) => b.createdAt - a.createdAt);
  if (!rows.length) return <><h1>Channel comments</h1><EmptyState icon="comment" title="No comments yet" text="When viewers comment on your videos, you can reply, pin, heart or remove them here." /></>;
  return (
    <>
      <h1>Channel comments</h1>
      {rows.map((c) => {
        const v = mine.find((x) => x.id === c.videoId)!;
        const replies = d.comments.filter((r) => r.parentId === c.id).length;
        return (
          <div key={c.id} className="comment" style={{ paddingBottom: 16, borderBottom: '1px solid var(--divider)' }}>
            {c.mine ? <Avatar channel={me} size={40} /> : <Avatar name={c.author} size={40} />}
            <div className="c-body">
              <div className="c-who"><span>{c.mine ? me.handle : c.author}</span><span className="c-when">{timeAgo(c.createdAt)}</span></div>
              <div className="c-text">{c.text}</div>
              <div className="c-toolbar">
                <Button variant="text" onClick={() => { setReply(c.id); setText(''); }}>Reply</Button>
                <span>{replies} {replies === 1 ? 'reply' : 'replies'}</span>
                <IconButton icon="favorite" filled={c.hearted} label={c.hearted ? 'Remove heart' : 'Heart'} onClick={() => update((db) => { const x = db.comments.find((y) => y.id === c.id); if (x) x.hearted = !x.hearted; })} />
                <IconButton icon="push_pin" filled={c.pinned} label={c.pinned ? 'Unpin' : 'Pin'} onClick={() => update((db) => { db.comments.forEach((x) => { if (x.videoId === c.videoId) x.pinned = x.id === c.id ? !c.pinned : false; }); })} />
                <IconButton icon="delete" label="Remove" onClick={() => update((db) => { db.comments = db.comments.filter((x) => x.id !== c.id && x.parentId !== c.id); })} />
              </div>
              {reply === c.id && (
                <div className="c-composer reply">
                  <Avatar channel={me} size={24} />
                  <div className="c-field">
                    <textarea className="line-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as the creator..." />
                    <div className="c-actions"><Button variant="text" onClick={() => setReply(null)}>Cancel</Button>
                      <Button variant="blue" disabled={!text.trim()} onClick={() => { update((db) => { db.comments.push({ id: uid('c'), videoId: c.videoId, parentId: c.id, author: me.handle, mine: true, byCreator: true, text: text.trim(), createdAt: Date.now(), likes: 0 }); }); setReply(null); }}>Reply</Button></div>
                  </div>
                </div>
              )}
            </div>
            <Link href={watchHref(v)} style={{ width: 120, flexShrink: 0 }}><Thumbnail v={v} preview={false} overlayActions={false} /><span className="muted small">{v.title}</span></Link>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Stories ---------------- */
function StudioStories() {
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const me = myChannel(d);
  const [confirm, setConfirm] = useState<string | null>(null);
  const now = useNow();
  const active = activeStories(d).find((g) => g.channelId === 'me')?.slides ?? [];
  const expired = d.stories.filter((s) => s.channelId === 'me' && now - s.createdAt > 7 * 86_400_000);
  return (
    <>
      <h1>Stories <span className="actions"><Button variant="blue" size="sm" icon="add" disabled={me.subscribers < STORY_MIN_SUBS} onClick={() => app.open({ kind: 'story' })}>Create story</Button></span></h1>
      <StoryGate />
      <p className="muted" style={{ marginBottom: 24 }}>Stories are short updates (a photo or text, optionally linking one of your videos). They show at the top of subscribers’ feeds and on your channel for 7 days.</p>
      {active.length === 0 && <EmptyState icon="auto_stories" title="No active stories" />}
      <div className="story-tiles">
        {active.map((s) => {
          const left = Math.max(0, 7 * 86_400_000 - (now - s.createdAt));
          const linked = d.videos.find((v) => v.id === s.videoId);
          return (
            <div key={s.id} className="story-tile">
              <button type="button" className="story-tile-frame" style={{ background: s.background, color: s.textColor, width: '100%' }} onClick={() => app.openStory('me')}>{s.image && <MediaImg src={s.image} />}<p>{s.text}</p></button>
              <div className="muted small" style={{ marginTop: 6 }}>Expires in {Math.ceil(left / 86_400_000)} day{left > 86_400_000 ? 's' : ''}{linked ? ` · links “${linked.title}”` : ''}</div>
              <Button size="sm" variant="text" icon="delete" onClick={() => setConfirm(s.id)}>Delete</Button>
            </div>
          );
        })}
      </div>
      {expired.length > 0 && <p className="muted small" style={{ marginTop: 24 }}>{expired.length} expired {expired.length === 1 ? 'story is' : 'stories are'} hidden from viewers.</p>}
      {confirm && <ConfirmDialog title="Delete story?" text="It will be removed for everyone." onClose={() => setConfirm(null)}
        onConfirm={() => { const s = d.stories.find((x) => x.id === confirm); update((db) => { db.stories = db.stories.filter((x) => x.id !== confirm); }); deleteFile(s?.image); toast('Story deleted'); }} />}
    </>
  );
}

/* ---------------- Go live: webcam preview, recorded and saved as a video when the stream ends ---------------- */
function GoLive() {
  const d = useDB();
  const toast = useToast();
  const router = useRouter();
  const me = myChannel(d);
  const camRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [live, setLive] = useState<{ started: number; rec: MediaRecorder; chunks: Blob[] } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [chat, setChat] = useState<{ id: string; text: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => { if (camRef.current && stream) { camRef.current.srcObject = stream; camRef.current.play().catch(() => {}); } }, [stream]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setElapsed((Date.now() - live.started) / 1000), 500);
    return () => clearInterval(t);
  }, [live]);

  const camera = async () => {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }));
      setError('');
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'No camera or microphone was found.');
    }
  };
  const start = () => {
    if (!stream) return;
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(1000);
    setLive({ started: Date.now(), rec, chunks });
    setChat([]);
  };
  const stop = async () => {
    if (!live) return;
    setSaving(true);
    await new Promise<void>((r) => { live.rec.onstop = () => r(); live.rec.stop(); });
    const blob = new Blob(live.chunks, { type: live.rec.mimeType || 'video/webm' });
    let thumb = '';
    const v = camRef.current;
    if (v) {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 360;
      c.getContext('2d')?.drawImage(v, 0, 0, 640, 360);
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
      if (b) thumb = await putFile(b);
    }
    const src = await putFile(blob);
    const id = uid('v');
    const duration = Math.round((Date.now() - live.started) / 1000);
    update((db) => {
      db.videos.unshift({ id, channelId: 'me', type: 'video', title: title.trim() || `Live stream, ${new Date().toLocaleDateString()}`, description: desc, duration, views: 0, likes: 0, publishedAt: Date.now(), src, thumbnail: thumb, visibility: 'public', topic: 'People & Blogs', recordedLive: true });
      chat.forEach((m, i) => db.comments.push({ id: uid('c'), videoId: id, author: me.handle, mine: true, byCreator: true, text: m.text, createdAt: Date.now() + i, likes: 0 }));
    });
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setLive(null);
    setSaving(false);
    toast('Stream ended. The recording was saved to your channel.', { label: 'Watch', run: () => router.push(`/watch?v=${id}`) });
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setChat([...chat, { id: uid('m'), text: msg.trim() }]);
    setMsg('');
  };

  return (
    <>
      <h1>Go live</h1>
      <div className="live-setup">
        <div>
          <div className="cam">
            {stream ? <video ref={camRef} muted playsInline /> : (
              <div><Icon name="videocam" size={48} /><p style={{ margin: '12px 0' }}>{error || 'Turn on your camera to preview the stream.'}</p><Button variant="blue" onClick={camera}>Turn on camera</Button></div>
            )}
            {live && <span className="on-air">LIVE · {formatDuration(elapsed)}</span>}
          </div>
          <Field label="Title" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title" disabled={!!live} /></Field>
          <Field label="Description"><textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!!live} /></Field>
          <div className="row-wrap">
            {live ? <Button variant="filled" icon="stop_circle" disabled={saving} onClick={stop}>{saving ? 'Saving…' : 'End stream'}</Button>
              : <Button variant="filled" icon="sensors" disabled={!stream} onClick={start}>Go live</Button>}
          </div>
          <p className="muted small">This demo has no streaming server, so nobody else can watch live. The stream is recorded in your browser and published to your channel as a video when you end it, with your chat messages as comments.</p>
        </div>
        <aside className="live-chat">
          <div className="live-chat-head">Live chat</div>
          <div className="live-chat-msgs">
            {chat.length === 0 && <p className="muted">{live ? 'Say hello to your audience.' : 'Chat opens when you go live.'}</p>}
            {chat.map((m) => <div key={m.id}><b>{me.name}</b>{m.text}</div>)}
          </div>
          <form onSubmit={send}><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Chat as ${me.name}...`} maxLength={200} disabled={!live} aria-label="Chat message" /><IconButton icon="send" label="Send" type="submit" disabled={!live || !msg.trim()} /></form>
        </aside>
      </div>
    </>
  );
}

/* ---------------- Customization ---------------- */
function Customize() {
  const d = useDB();
  const toast = useToast();
  const me = myChannel(d);
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [desc, setDesc] = useState(me.description);
  const [links, setLinks] = useState(me.links.map((l) => `${l.title} | ${l.url}`).join('\n'));
  const [subs, setSubs] = useState(String(me.subscribers));
  const [avatar, setAvatar] = useState<{ blob: Blob | null; url: string | null } | null>(null);
  const [banner, setBanner] = useState<{ blob: Blob; url: string } | null>(null);
  const handleOk = /^@[a-z0-9._-]{3,30}$/i.test(handle) && !Object.values(d.channels).some((c) => !c.isMine && c.handle.toLowerCase() === handle.toLowerCase());
  const publish = async () => {
    const av = avatar?.blob ? await putFile(avatar.blob) : undefined;
    const bn = banner ? await putFile(banner.blob) : undefined;
    const oldAv = me.avatar;
    const oldBn = me.banner;
    update((db) => {
      const c = db.channels.me;
      c.name = name.trim() || c.name;
      c.handle = handle;
      c.description = desc;
      c.subscribers = Math.max(0, Math.floor(Number(subs) || 0));
      c.links = links.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter(([t, u]) => t && (u || t)).map(([t, u]) => ({ title: u ? t : t.replace(/^https?:\/\//, ''), url: (u || t).startsWith('http') ? (u || t) : `https://${u || t}` }));
      if (avatar) c.avatar = av;
      if (bn) c.banner = bn;
    });
    if (avatar && oldAv !== av) deleteFile(oldAv);
    if (bn) deleteFile(oldBn);
    setAvatar(null);
    setBanner(null);
    toast('Changes published');
  };
  return (
    <>
      <h1>Channel customization <span className="actions"><Link href={`/${me.handle}`} className="btn btn-tonal btn-sm">View channel</Link><Button variant="filled" size="sm" disabled={!handleOk || !name.trim()} onClick={publish}>Publish</Button></span></h1>
      <div style={{ maxWidth: 760 }}>
        <h4>Picture</h4>
        <div className="custom-row">
          {avatar?.url ? <img src={avatar.url} alt="" className="avatar" style={{ width: 96, height: 96 }} /> : avatar ? <Avatar name={name} size={96} /> : <Avatar channel={me} size={96} />}
          <div>
            <p className="muted small" style={{ marginBottom: 8 }}>Shown next to your videos and comments. A square image of at least 98×98 px works best.</p>
            <div className="row-wrap" style={{ margin: 0 }}>
              <label className="btn btn-tonal btn-sm">Change<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar({ blob: f, url: URL.createObjectURL(f) }); }} /></label>
              <Button size="sm" variant="text" onClick={() => setAvatar({ blob: null, url: null })}>Remove</Button>
            </div>
          </div>
        </div>
        <h4>Banner image</h4>
        <div className="custom-row">
          <div className="custom-banner">{banner ? <img src={banner.url} alt="" /> : me.banner ? <MediaImg src={me.banner} /> : null}</div>
          <label className="btn btn-tonal btn-sm">{me.banner || banner ? 'Change' : 'Upload'}<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setBanner({ blob: f, url: URL.createObjectURL(f) }); }} /></label>
        </div>
        <Field label="Name" count={`${name.length}/50`}><input maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Handle" hint={handleOk ? undefined : 'Use @ followed by 3–30 letters, numbers, dots, dashes or underscores. It must not be taken.'}>
          <input value={handle} onChange={(e) => setHandle(e.target.value.startsWith('@') ? e.target.value : `@${e.target.value}`)} />
        </Field>
        <Field label="Description" count={`${desc.length}/1000`}><textarea rows={5} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your channel" /></Field>
        <Field label="Links (one per line: Title | https://example.com)"><textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} /></Field>
        <h4>Subscriber count (demo)</h4>
        <p className="muted small" style={{ marginBottom: 8 }}>There are no other users in this demo, so you set your own count. Stories unlock at {STORY_MIN_SUBS.toLocaleString()}.</p>
        <Field label="Subscribers"><input type="number" min={0} value={subs} onChange={(e) => setSubs(e.target.value)} /></Field>
        <p className="muted small"><ShortsIcon size={16} /> Shorts and videos you upload appear on your channel automatically.</p>
      </div>
    </>
  );
}

