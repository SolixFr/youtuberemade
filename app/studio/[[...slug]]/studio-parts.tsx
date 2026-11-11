'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ago } from '@/components/ago';
import { useApp } from '@/components/app-context';
import { Thumbnail } from '@/components/cards';
import { Player } from '@/components/player';
import { drawStreamCard } from '@/components/stream-card';
import { posClasses } from '@/components/stories';
import { Avatar, Button, ConfirmDialog, Dialog, Field, Icon, IconButton, useToast } from '@/components/ui';
import { probeVideo } from '@/components/upload';
import { submitReport } from '@/lib/actions/admin';
import { updateChannel } from '@/lib/actions/channels';
import { attachLiveStats, endLive, liveState, sendLiveMessage, startLive } from '@/lib/actions/live';
import { addComment, deleteComment, deleteStory, moderateComment } from '@/lib/actions/social';
import { deleteVideo, myPickers, updateVideo } from '@/lib/actions/studio';
import { mySubscribers, recentSubscribers } from '@/lib/actions/account';
import { formatCount, formatDate, formatDuration, watchHref } from '@/lib/format';
import type { Channel, Comment, StorySlide, Video, Visibility } from '@/lib/types';
import { uploadFile } from '@/lib/upload-client';

const visIcon = (v: Visibility) => (v === 'public' ? 'visibility' : v === 'unlisted' ? 'link' : 'lock');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function CreateButtons() {
  const app = useApp();
  const canStory = (app.me?.subscribers ?? 0) >= 10_000;
  return (
    <span className="actions">
      <Button size="sm" icon="upload" onClick={() => app.open({ kind: 'upload' })}>Upload</Button>
      <Link href="/studio/live" className="btn btn-tonal btn-sm"><Icon name="sensors" size={20} />Go live</Link>
      <Button size="sm" icon="edit_note" onClick={() => app.open({ kind: 'post' })}>Post</Button>
      {canStory && <Button size="sm" icon="add_circle" onClick={() => app.open({ kind: 'story' })}>Story</Button>}
    </span>
  );
}

export function UploadButton({ short, label = 'Upload', variant = 'blue' }: { short?: boolean; label?: string; variant?: 'blue' | 'filled' }) {
  const app = useApp();
  return <Button variant={variant} size="sm" icon="upload" onClick={() => app.open({ kind: 'upload', short })}>{label}</Button>;
}

/* ---------------- Content table ---------------- */
export function ContentTable({ videos: initial, comments }: { videos: Video[]; comments: Record<string, number> }) {
  const toast = useToast();
  const router = useRouter();
  const [videos, setVideos] = useState(initial);
  const [confirm, setConfirm] = useState<Video | null>(null);
  const [now] = useState(() => Date.now());
  return (
    <div className="table-wrap">
      <table className="s-table">
        <thead><tr><th>Video</th><th>Visibility</th><th className="hide-m">Date</th><th>Views</th><th className="hide-m">Comments</th><th className="hide-m">Likes</th></tr></thead>
        <tbody>
          {videos.map((v) => {
            const scheduled = v.publishedAt > now;
            return (
              <tr key={v.id}>
                <td>
                  <div className="s-video">
                    <Link href={`/studio/video/${v.id}`}><Thumbnail v={v} preview={false} actions={false} /></Link>
                    <div>
                      <b>{v.title}</b>
                      <span className="muted">{v.description.split('\n')[0] || 'Add description'}</span>
                      <div className="s-tools">
                        <Link className="icon-btn" href={`/studio/video/${v.id}`} aria-label="Details" data-tooltip="Details"><Icon name="edit" size={20} /></Link>
                        <Link className="icon-btn" href={watchHref(v)} aria-label="View on Vidora" data-tooltip="View on Vidora"><Icon name="play_arrow" size={20} /></Link>
                        <IconButton icon="delete" label="Delete forever" size={32} onClick={() => setConfirm(v)} />
                      </div>
                    </div>
                  </div>
                </td>
                <td><span className="vis"><Icon name={scheduled ? 'schedule' : visIcon(v.visibility)} size={18} />{scheduled ? 'Scheduled' : cap(v.visibility)}</span></td>
                <td className="hide-m">{formatDate(v.publishedAt)}<div className="muted small">{scheduled ? 'Scheduled' : 'Published'}</div></td>
                <td>{v.views.toLocaleString()}</td>
                <td className="hide-m">{comments[v.id] ?? 0}</td>
                <td className="hide-m">{v.likes.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {confirm && (
        <ConfirmDialog title="Permanently delete this video?" text={`“${confirm.title}”, its file and its comments will be deleted. This can’t be undone.`} confirm="Delete forever" onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const r = await deleteVideo(confirm.id);
            if (!r.ok) return toast(r.error);
            setVideos((x) => x.filter((y) => y.id !== confirm.id));
            toast('Video deleted');
            router.refresh();
          }} />
      )}
    </div>
  );
}

/* ---------------- Edit video ---------------- */
export function EditVideo({ video: v }: { video: Video }) {
  const toast = useToast();
  const router = useRouter();
  const [title, setTitle] = useState(v.title);
  const [desc, setDesc] = useState(v.description);
  const [vis, setVis] = useState<Visibility>(v.visibility);
  const [thumb, setThumb] = useState<{ file: File; url: string } | null>(null);
  const [vtt, setVtt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = title !== v.title || desc !== v.description || vis !== v.visibility || !!thumb || !!vtt;
  const save = async () => {
    setBusy(true);
    try {
      const [thumbnail, captions] = await Promise.all([
        thumb ? uploadFile(thumb.file, 'image').promise : Promise.resolve(null),
        vtt ? uploadFile(vtt, 'captions').promise : Promise.resolve(null),
      ]);
      const r = await updateVideo(v.id, { title, description: desc, visibility: vis, thumbnail, captions });
      if (!r.ok) throw new Error(r.error);
      setThumb(null);
      setVtt(null);
      toast('Changes saved');
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h1><IconButton icon="arrow_back" label="Back to content" onClick={() => router.push('/studio/content')} />Video details
        <span className="actions"><Link className="btn btn-tonal btn-sm" href={watchHref(v)}>View</Link><Button variant="filled" size="sm" disabled={!dirty || !title.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button></span>
      </h1>
      <div className="upload-grid">
        <div>
          <Field label="Title (required)" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description" count={`${desc.length}/5000`}><textarea rows={8} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <h4>Thumbnail</h4>
          <div className="thumb-picks">
            <label className="thumb-upload"><Icon name="add_photo_alternate" />Change<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setThumb({ file: f, url: URL.createObjectURL(f) }); }} /></label>
            <span className="thumb-pick on"><img src={thumb?.url ?? v.thumbnail} alt="" /></span>
          </div>
          <h4>Subtitles</h4>
          <label className="btn btn-tonal btn-sm"><Icon name="closed_caption" size={20} />{vtt ? vtt.name : v.captions ? 'Replace .vtt file' : 'Upload a .vtt file'}<input type="file" accept=".vtt,text/vtt" hidden onChange={(e) => setVtt(e.target.files?.[0] ?? null)} /></label>
        </div>
        <aside>
          <Player video={v} autoplay={false} compact />
          <Field label="Visibility">
            <select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select>
          </Field>
          <p className="muted small">{formatDuration(v.duration)} · {v.type === 'short' ? 'Short' : 'Video'} · {formatDate(v.publishedAt)}</p>
        </aside>
      </div>
    </>
  );
}

/* ---------------- Comment moderation ---------------- */
export function StudioComments({ rows: initial, me }: { rows: { comment: Comment; video: Video; replies: number }[]; me: { name: string; avatar: string | null } }) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [reply, setReply] = useState<string | null>(null);
  const [text, setText] = useState('');
  const patch = (id: string, p: Partial<Comment>) => setRows((r) => r.map((x) => (x.comment.id === id ? { ...x, comment: { ...x.comment, ...p } } : x)));
  return (
    <>
      {rows.map(({ comment: c, video: v }) => (
        <div key={c.id} className="comment s-comment">
          <Avatar name={c.author.handle} src={c.author.avatar} size={40} />
          <div className="c-body">
            <div className="c-who"><span>{c.author.handle}</span><span className="c-when"><Ago ts={c.createdAt} /></span></div>
            <div className="c-text">{c.text}</div>
            <div className="c-toolbar">
              <Button variant="text" onClick={() => { setReply(c.id); setText(''); }}>Reply</Button>
              <IconButton icon="favorite" filled={c.hearted} label={c.hearted ? 'Remove heart' : 'Heart'} onClick={async () => { const r = await moderateComment(c.id, c.hearted ? 'unheart' : 'heart'); if (r.ok) patch(c.id, { hearted: !c.hearted }); }} />
              <IconButton icon="push_pin" filled={c.pinned} label={c.pinned ? 'Unpin' : 'Pin'} onClick={async () => { const r = await moderateComment(c.id, c.pinned ? 'unpin' : 'pin'); if (r.ok) patch(c.id, { pinned: !c.pinned }); }} />
              <IconButton icon="delete" label="Remove" onClick={async () => { const r = await deleteComment(c.id); if (r.ok) setRows((x) => x.filter((y) => y.comment.id !== c.id)); else toast(r.error); }} />
            </div>
            {reply === c.id && (
              <div className="c-composer reply">
                <Avatar name={me.name} src={me.avatar} size={24} />
                <div className="c-field">
                  <textarea className="line-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as the creator…" />
                  <div className="c-actions"><Button variant="text" onClick={() => setReply(null)}>Cancel</Button>
                    <Button variant="blue" disabled={!text.trim()} onClick={async () => { const r = await addComment(v.id, text, c.id); if (!r.ok) return toast(r.error); setReply(null); toast('Reply posted'); }}>Reply</Button></div>
                </div>
              </div>
            )}
          </div>
          <Link href={watchHref(v)} className="s-comment-video"><Thumbnail v={v} preview={false} actions={false} /><span className="muted small">{v.title}</span></Link>
        </div>
      ))}
    </>
  );
}

/* ---------------- Stories manager ---------------- */
export function StudioStories({ slides: initial, channelId }: { slides: StorySlide[]; channelId: string }) {
  const app = useApp();
  const toast = useToast();
  const [slides, setSlides] = useState(initial);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  return (
    <div className="story-tiles">
      {slides.map((s) => {
        const left = Math.max(0, 7 * 86_400_000 - (now - s.createdAt));
        return (
          <div key={s.id} className="story-tile">
            <button type="button" className={`story-tile-frame ${s.image ? 'has-image' : ''}`} style={{ background: s.background, color: s.textColor }} onClick={() => app.openStory(channelId)}>
              {s.image && <img src={s.image} alt="" />}<p className={posClasses(s.textPos)}>{s.text}</p>
            </button>
            <div className="muted small"><span>{formatCount(s.views)} views · {formatCount(s.likes)} likes · </span>Expires in {Math.ceil(left / 86_400_000)} day{left > 86_400_000 ? 's' : ''}{s.video ? ` · links “${s.video.title}”` : ''}</div>
            <Button size="sm" variant="text" icon="delete" onClick={() => setConfirm(s.id)}>Delete</Button>
          </div>
        );
      })}
      {confirm && <ConfirmDialog title="Delete story?" text="It will be removed for everyone." onClose={() => setConfirm(null)} onConfirm={async () => {
        const r = await deleteStory(confirm);
        if (!r.ok) return toast(r.error);
        setSlides((x) => x.filter((y) => y.id !== confirm));
        toast('Story deleted');
      }} />}
    </div>
  );
}

/* ---------------- Go live: webcam recording + simulated live audience ---------------- */
interface OnAirSession {
  id: string;
  startedAt: number;
  views: number;
  likes: number;
  subsGained: number;
  joins: number;
  giftsCents: number;
  viewers: number;
}
interface LiveChatMessage {
  id: number | string;
  author: string;
  text: string;
  kind: 'chat' | 'creator' | 'gift' | 'sub' | 'join';
  amountCents: number;
  at: number;
}

export function GoLive({ name }: { name: string }) {
  const toast = useToast();
  const router = useRouter();
  const cam = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCard = useRef<{ stop: () => void } | null>(null);
  const chatBox = useRef<HTMLDivElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [live, setLive] = useState<{ started: number; rec: MediaRecorder; chunks: Blob[]; sessionId: string; videoId: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [pending, setPending] = useState<LiveChatMessage[]>([]);
  const chatIds = useRef(new Set<number | string>());
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState<OnAirSession | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); fallbackCard.current?.stop(); }, [stream]);
  // When there's no camera, draw the “starting soon” card into the preview during the stream.
  useEffect(() => {
    if (!live || stream) return;
    const c = liveCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = (t: number) => { drawStreamCard(ctx, name, t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, stream, name]);
  useEffect(() => { if (cam.current && stream) { cam.current.srcObject = stream; void cam.current.play().catch(() => {}); } }, [stream]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setElapsed((Date.now() - live.started) / 1000), 500);
    return () => clearInterval(t);
  }, [live]);
  // Poll the on-air dashboard once a session exists.
  useEffect(() => {
    if (!live?.sessionId) return;
    let alive = true;
    const poll = async () => {
      const r = await liveState(live.sessionId);
      if (!alive || !r.ok) return;
      setStats(r.data.session);
      const fresh = r.data.messages.filter((m) => !chatIds.current.has(m.id));
      if (fresh.length) {
        for (const m of fresh) chatIds.current.add(m.id);
        setChat((cur) => [...cur, ...fresh].slice(-200));
        if (fresh.some((m) => m.kind === 'creator')) setPending((p) => p.filter((echo) => !fresh.some((m) => m.kind === 'creator' && m.text === echo.text)));
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 1500);
    return () => { alive = false; clearInterval(t); };
  }, [live?.sessionId]);
  useEffect(() => { const el = chatBox.current; if (el) el.scrollTop = el.scrollHeight; }, [chat, pending]);

  const camera = async () => {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }));
      setError('');
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError') setError('Camera permission was denied. Allow it in the browser’s site settings, or go live with the card instead.');
      else if (name === 'NotFoundError') setError('No camera or microphone was found. You can go live with the card instead.');
      else if (name === 'NotSupportedError' || name === 'SecurityError') setError('The camera is blocked — the page isn’t on a secure origin, or the context isn’t secure. Open it on localhost (or HTTPS).');
      else setError('The camera couldn’t be started. You can go live with the card instead.');
    }
  };
  const start = async () => {
    let recStream: MediaStream | undefined = stream ?? undefined;
    if (!recStream) {
      // No camera: stream the “starting soon” card from a hidden canvas.
      const card = document.createElement('canvas');
      card.width = 1280;
      card.height = 720;
      const ctx = card.getContext('2d');
      if (!ctx) { toast('The fallback card couldn’t be drawn.'); return; }
      let raf = 0;
      const loop = (t: number) => { drawStreamCard(ctx, name, t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      fallbackCard.current = { stop: () => cancelAnimationFrame(raf) };
      recStream = card.captureStream(30);
    }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(recStream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(1000);
    // Register the live session so the audience simulator starts filling the room.
    const r = await startLive({ title: title.trim() || undefined, description: desc });
    if (!r.ok) { toast(r.error); return; }
    chatIds.current = new Set();
    setChat([]);
    setPending([]);
    setStats(null);
    setLive({ started: Date.now(), rec, chunks, sessionId: r.data.id, videoId: r.data.videoId ?? '' });
  };
  const stop = async () => {
    if (!live) return;
    setSaving(0);
    const sessionId = live.sessionId;
    const vid = live.videoId;
    try {
      await new Promise<void>((r) => { live.rec.onstop = () => r(); live.rec.stop(); });
      const blob = new Blob(live.chunks, { type: (live.rec.mimeType || 'video/webm').split(';')[0] });
      const url = URL.createObjectURL(blob);
      const probe = await probeVideo(url);
      URL.revokeObjectURL(url);
      const video = await uploadFile(blob, 'video', (p) => setSaving(p)).promise;
      await attachLiveStats(sessionId, { src: video, duration: probe.duration || (Date.now() - live.started) / 1000 });
      const ended = await endLive(sessionId);
      for (const m of chat) if (m.kind === 'creator') await addComment(vid, m.text);
      stream?.getTracks().forEach((t) => t.stop());
      fallbackCard.current?.stop();
      fallbackCard.current = null;
      const summary = ended.ok ? ` · ${formatCount(ended.data.views)} views, ${ended.data.subscribers} subs, ${ended.data.joins} joins, $${(ended.data.giftsCents / 100).toFixed(2)} in gifts` : '';
      toast(`Stream ended — published to your channel${summary}`, { label: 'Watch', run: () => router.push(`/watch?v=${vid}`) });
      setStream(null);
      setLive(null);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = msg.trim();
    if (!body || !live) return;
    setMsg('');
    // Echo locally until the canonical row arrives from the server.
    setPending((p) => [...p, { id: `p${Date.now()}`, author: name, text: body, kind: 'creator', amountCents: 0, at: Date.now() }]);
    const r = await sendLiveMessage(live.sessionId, body);
    if (!r.ok) toast(r.error);
  };

  return (
    <div className="live-setup">
      <div>
        <div className="cam">
          {stream ? <video ref={cam} muted playsInline /> : live ? (
            <canvas ref={liveCanvasRef} width={1280} height={720} className="cam-canvas" />
          ) : (
            <div><Icon name="videocam" size={48} /><p>{error || 'Turn on your camera, or go live with the card — works with no camera at all.'}</p><Button variant="blue" onClick={camera}>Turn on camera</Button></div>
          )}
          {live && <span className="on-air"><span className="live-dot" />LIVE · {formatDuration(elapsed)}</span>}
        </div>
        <Field label="Title" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title" disabled={!!live} /></Field>
        <Field label="Description"><textarea rows={3} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!!live} /></Field>
        <div className="btn-row">
          {live ? <Button variant="filled" icon="stop_circle" disabled={saving !== null} onClick={stop}>{saving !== null ? `Saving ${Math.round(saving * 100)}%` : 'End stream'}</Button>
            : <Button variant="filled" icon="sensors" onClick={start}>Go live</Button>}
        </div>
        <p className="muted small">No camera? It streams a “starting soon” card drawn for your channel instead. There’s no streaming server — viewers, chat, gifts, subs and member joins are simulated locally. The recording publishes to your channel when you end the stream, and your live numbers are folded into it.</p>
      </div>
      <aside className="live-dashboard">
        <div className="onair-stats" aria-label="Live statistics">
          <div className="onair-stat"><b>{stats?.viewers ?? (live ? '…' : 0)}</b><span>Watching now</span></div>
          <div className="onair-stat"><b>{stats ? formatCount(stats.views) : 0}</b><span>Total views</span></div>
          <div className="onair-stat"><b>{stats?.subsGained ?? 0}</b><span>Subs</span></div>
          <div className="onair-stat"><b>{stats?.joins ?? 0}</b><span>Members</span></div>
          <div className="onair-stat gift"><b>${((stats?.giftsCents ?? 0) / 100).toFixed(2)}</b><span>Gifts</span></div>
        </div>
        <div ref={chatBox} className="onair-chat" aria-live="polite" aria-label="Live chat">
          {chat.length + pending.length === 0 && <p className="muted">{live ? 'Say hello to your audience — chat appears here.' : 'Chat opens when you go live.'}</p>}
          {[...chat, ...pending].sort((a, b) => a.at - b.at).map((m) => (
            <div key={m.id} className={`onair-msg msg-${m.kind}`}>
              {m.kind === 'gift' ? <Icon name="card_giftcard" size={16} /> : m.kind === 'join' ? <Icon name="loyalty" filled size={16} /> : m.kind === 'sub' ? <Icon name="person_add" size={16} /> : null}
              <b>{m.author}</b><span>{m.text}</span>
            </div>
          ))}
        </div>
        <form onSubmit={send} className="onair-send">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={live ? `Chat as ${name}…` : 'Chat opens when you go live'} maxLength={200} disabled={!live} aria-label="Chat message" />
          <IconButton icon="send" label="Send" type="submit" disabled={!live || !msg.trim()} />
        </form>
      </aside>
    </div>
  );
}

/* ---------------- Customization (YouTube-style Profile / Home tab) ---------------- */
const CUSTOM_TABS = [['profile', 'Profile'], ['home', 'Home tab']] as const;
type CustomTab = (typeof CUSTOM_TABS)[number][0];
const SECTION_KINDS = [
  ['recent_uploads', 'Recent uploads'],
  ['popular_uploads', 'Popular videos'],
  ['shorts', 'Shorts'],
  ['playlists', 'Playlists'],
  ['posts', 'Posts'],
  ['members', 'Member recognition (needs 8+ members)'],
] as const;
type BaseSectionKind = (typeof SECTION_KINDS)[number][0];
type SectionKind = BaseSectionKind | `playlist:${string}`;
const MAX_SECTIONS = 12;

export interface CustomizeConfig {
  contactEmail: string;
  trailerVideoId: string | null;
  featuredVideoId: string | null;
  watermark: string | null;
  watermarkDisplay: 'end' | 'custom' | 'full';
  watermarkStart: number;
  homeSections: SectionKind[];
}

export function Customize({ channel, config }: { channel: Channel; config: CustomizeConfig }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<CustomTab>('profile');
  // Profile
  const [name, setName] = useState(channel.name);
  const [handle, setHandle] = useState(channel.handle);
  const [desc, setDesc] = useState(channel.description);
  const [pronouns, setPronouns] = useState(channel.pronouns);
  const [email, setEmail] = useState(config.contactEmail);
  const [links, setLinks] = useState(() => channel.links.map((l) => ({ title: l.title, url: l.url })));
  const [avatar, setAvatar] = useState<{ file: File | null; url: string | null } | null>(null);
  const [banner, setBanner] = useState<{ file: File; url: string } | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [watermark, setWatermark] = useState<{ file: File; url: string } | null>(null);
  const [watermarkRemoved, setWatermarkRemoved] = useState(false);
  const [watermarkDisplay, setWatermarkDisplay] = useState<'end' | 'custom' | 'full'>(config.watermarkDisplay);
  const [watermarkStart, setWatermarkStart] = useState(String(config.watermarkStart));
  // Home tab
  const [trailer, setTrailer] = useState<string | null>(config.trailerVideoId);
  const [featured, setFeatured] = useState<string | null>(config.featuredVideoId);
  const [sections, setSections] = useState<SectionKind[]>(config.homeSections);
  const [videos, setVideos] = useState<{ id: string; title: string; thumbnail: string }[]>([]);
  const [playlists, setPlaylists] = useState<{ id: string; title: string; count: number }[]>([]);
  useEffect(() => { myPickers().then((r) => { if (r.ok) { setVideos(r.data.videos); setPlaylists(r.data.playlists); } }); }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionLabel = (k: SectionKind) => {
    const base = SECTION_KINDS.find(([id]) => id === k);
    if (base) return base[1];
    const pid = k.startsWith('playlist:') ? k.slice('playlist:'.length) : '';
    const p = playlists.find((x) => x.id === pid);
    return `Single playlist: ${p?.title ?? 'Playlist'}${p ? ` (${p.count})` : ''}`;
  };
  const moveSection = (i: number, dir: -1 | 1) =>
    setSections((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const linksText = () => links.map((r) => [r.title.trim(), r.url.trim()] as const).filter(([t, u]) => t || u)
    .map(([t, u]) => `${t} | ${u}`)
    .join('\n');
  const publish = async () => {
    setBusy(true);
    setError(null);
    const rows = links.map((r) => [r.title.trim(), r.url.trim()] as const).filter(([t, u]) => t || u);
    for (const [t, u] of rows) {
      if (!t || !u) { setError('Every link needs both a title and a URL'); setBusy(false); return; }
      try { new URL(u); } catch { setError(`“${t}” isn’t a valid URL — start with https://`); setBusy(false); return; }
    }
    try {
      const wmStart = Math.max(1, Math.min(3600, Math.floor(Number(watermarkStart) || 8)));
      const [av, bn, wm] = await Promise.all([
        avatar?.file ? uploadFile(avatar.file, 'image').promise : Promise.resolve(avatar ? null : undefined),
        banner ? uploadFile(banner.file, 'image').promise : Promise.resolve(bannerRemoved ? null : undefined),
        watermark ? uploadFile(watermark.file, 'image').promise : Promise.resolve(watermarkRemoved ? null : undefined),
      ]);
      const r = await updateChannel({
        name, handle, description: desc, links: linksText(), pronouns,
        avatar: av, banner: bn,
        contactEmail: email,
        trailerVideoId: trailer,
        featuredVideoId: featured,
        watermark: wm,
        watermarkDisplay,
        watermarkStart: wmStart,
        homeSections: sections,
      });
      if (!r.ok) { setError(r.error); return; }
      setAvatar(null); setBanner(null); setWatermark(null); setWatermarkRemoved(false); setBannerRemoved(false);
      toast('Changes published');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="card-actions-row">
        <Link href={`/${channel.handle}`} className="btn btn-tonal btn-sm">View channel</Link>
        <Button variant="filled" size="sm" disabled={!name.trim() || busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish'}</Button>
      </div>
      <nav className="cust-tabs" role="tablist" aria-label="Channel customization sections">
        {CUSTOM_TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={`cust-tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <div className="customize">
        {error && <p className="form-error" role="alert">{error}</p>}

        {tab === 'home' && (
          <>
            <section className="custom-card">
              <h4>Channel trailer for people who haven&apos;t subscribed</h4>
              <p className="muted small">This video plays on your channel homepage when a visitor isn&apos;t subscribed. Leave it as “None” to show your most popular video.</p>
              {trailer ? (
                <div className="trailer-current">
                  <img className="trailer-thumb" src={videos.find((v) => v.id === trailer)?.thumbnail ?? ''} alt="" />
                  <div className="trailer-text">
                    <b>{videos.find((v) => v.id === trailer)?.title ?? 'Channel trailer'}</b>
                    <button type="button" className="link" onClick={() => setTrailer(null)}>Remove trailer</button>
                  </div>
                </div>
              ) : (
                videos.length ? (
                  <Field label="Channel trailer">
                    <select value="" onChange={(e) => e.target.value && setTrailer(e.target.value)} aria-label="Choose a channel trailer">
                      <option value="">None — show your most popular video</option>
                      {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                    </select>
                  </Field>
                ) : <p className="muted small">Publish a public video first — then pick one as your trailer.</p>
              )}
            </section>

            <section className="custom-card">
              <h4>Featured video for returning subscribers</h4>
              <p className="muted small">Shown at the top of your homepage for viewers who are subscribed. Subscribers won&apos;t see it again at the top once they&apos;ve watched it. Leave it as “None” to show your most popular video.</p>
              {featured ? (
                <div className="trailer-current">
                  <img className="trailer-thumb" src={videos.find((v) => v.id === featured)?.thumbnail ?? ''} alt="" />
                  <div className="trailer-text">
                    <b>{videos.find((v) => v.id === featured)?.title ?? 'Featured video'}</b>
                    <button type="button" className="link" onClick={() => setFeatured(null)}>Remove featured video</button>
                  </div>
                </div>
              ) : (
                videos.length ? (
                  <Field label="Featured video">
                    <select value="" onChange={(e) => e.target.value && setFeatured(e.target.value)} aria-label="Choose a featured video">
                      <option value="">None — show your most popular video</option>
                      {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                    </select>
                  </Field>
                ) : <p className="muted small">Publish a public video first — then pick one to feature.</p>
              )}
            </section>

            <section className="custom-card">
              <h4>Layout</h4>
              <p className="muted small">Customize the layout of your channel homepage with up to {MAX_SECTIONS} sections.</p>
              {sections.length === 0 && <p className="muted small">No sections — your homepage will only show your trailer and stories.</p>}
              <ol className="sections-list">
                {sections.map((kind, i) => (
                  <li key={kind} className="sections-row">
                    <Icon name="drag_indicator" className="sections-grip" size={22} aria-hidden="true" />
                    <span className="sections-name">{sectionLabel(kind)}</span>
                    <span className="grow" />
                    <IconButton icon="arrow_upward" label="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)} />
                    <IconButton icon="arrow_downward" label="Move down" disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)} />
                    <IconButton icon="close" label={`Remove ${sectionLabel(kind)}`} onClick={() => setSections((s) => s.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ol>
              {sections.length < MAX_SECTIONS ? (
                <Field label="Add a section" hint={
                  SECTION_KINDS.filter(([k]) => !sections.includes(k)).length === 0 && playlists.every((p) => sections.includes(`playlist:${p.id}`))
                    ? 'Everything you can add is already on your homepage.'
                    : undefined
                }>
                  <select value="" onChange={(e) => { const k = e.target.value as SectionKind; if (k) setSections((s) => [...s, k]); }} aria-label="Add a section">
                    <option value="">Choose a section to add…</option>
                    <optgroup label="Sections">
                      {SECTION_KINDS.filter(([k]) => !sections.includes(k)).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </optgroup>
                    {playlists.some((p) => !sections.includes(`playlist:${p.id}`)) && (
                      <optgroup label="Single playlists">
                        {playlists.filter((p) => !sections.includes(`playlist:${p.id}`)).map((p) => <option key={p.id} value={`playlist:${p.id}`}>Single playlist: {p.title} ({p.count})</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>
              ) : <p className="muted small">{MAX_SECTIONS} sections — the maximum. Remove one to add another.</p>}
            </section>
          </>
        )}

        {tab === 'profile' && (
          <>
            <section className="custom-card">
              <h4>Banner image</h4>
              <p className="muted small">Shown at the top of your channel page. 2048 × 1152 works best.</p>
              <div className="banner-preview">
                {banner?.url ?? (!bannerRemoved && channel.banner) ? (
                  <img src={banner?.url ?? channel.banner ?? undefined} alt="Banner preview" />
                ) : <span className="banner-preview-empty"><Icon name="image" size={44} aria-hidden="true" /></span>}
                <span className="banner-safe" aria-hidden="true" />
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <label className="btn btn-tonal btn-sm">{banner || (!bannerRemoved && channel.banner) ? 'Change' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setBanner({ file: f, url: URL.createObjectURL(f) }); setBannerRemoved(false); } }} /></label>
                {(banner || (!bannerRemoved && channel.banner)) && <Button size="sm" variant="text" onClick={() => { setBanner(null); setBannerRemoved(true); }}>Remove</Button>}
              </div>
            </section>

            <section className="custom-card">
              <h4>Picture</h4>
              <p className="muted small">Your profile picture will appear where your channel is presented on Vidora, like next to your videos and comments.</p>
              <div className="custom-row">
                {avatar?.url ? <img src={avatar.url} alt="" className="avatar" width={96} height={96} /> : <Avatar name={name} src={avatar ? null : channel.avatar} size={96} />}
                <div className="btn-row">
                  <label className="btn btn-tonal btn-sm">Change<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar({ file: f, url: URL.createObjectURL(f) }); }} /></label>
                  <Button size="sm" variant="text" onClick={() => setAvatar({ file: null, url: null })}>Remove</Button>
                </div>
              </div>
            </section>

            <section className="custom-card">
              <h4>Name &amp; handle</h4>
              <Field label="Channel name" count={`${name.length}/50`}><input maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Handle" hint="Your unique @name. People find you with it."><input value={handle} maxLength={31} onChange={(e) => setHandle(e.target.value.startsWith('@') ? e.target.value : `@${e.target.value}`)} /></Field>
              <Field label="Channel URL" hint="People can reach your channel with this link.">
                <div className="url-row">
                  <input readOnly value={`/${handle}`} onFocus={(e) => e.target.select()} aria-label="Channel URL" />
                  <IconButton icon="content_copy" label="Copy channel URL" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/${handle}`); toast('Link copied to your clipboard'); } catch { toast('Couldn’t copy the link'); } }} />
                </div>
              </Field>
            </section>

            <section className="custom-card">
              <h4>Pronouns</h4>
              <p className="muted small">Optionally add your pronouns. They appear on your channel page.</p>
              <Field label="Pronouns"><input value={pronouns} maxLength={40} onChange={(e) => setPronouns(e.target.value)} placeholder="Add your pronouns (optional)" /></Field>
            </section>

            <section className="custom-card">
              <h4>Description</h4>
              <p className="muted small">Tell viewers about your channel. It appears in the About section of your channel.</p>
              <Field label="Description" count={`${desc.length}/1000`}><textarea rows={5} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your channel" /></Field>
            </section>

            <section className="custom-card">
              <h4>Links</h4>
              <p className="muted small">Share external links with your viewers. They&apos;ll be visible on your channel profile and About page.</p>
              <ol className="links-list">
                {links.map((l, i) => (
                  <li key={i} className="link-row">
                    <Icon name="drag_indicator" className="sections-grip" size={22} aria-hidden="true" />
                    <input className="link-title" value={l.title} placeholder="Link title" maxLength={60} aria-label={`Link ${i + 1} title`} onChange={(e) => setLinks((s) => s.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))} />
                    <input className="link-url" value={l.url} placeholder="https://…" maxLength={500} aria-label={`Link ${i + 1} URL`} onChange={(e) => setLinks((s) => s.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))} />
                    <span className="link-move">
                      <IconButton icon="arrow_upward" label="Move up" disabled={i === 0} onClick={() => setLinks((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} />
                      <IconButton icon="arrow_downward" label="Move down" disabled={i === links.length - 1} onClick={() => setLinks((s) => { const n = [...s]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })} />
                    </span>
                    <IconButton icon="close" label={`Remove link ${i + 1}`} onClick={() => setLinks((s) => s.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ol>
              {links.filter((r) => r.title.trim() || r.url.trim()).length < 10 && <Button variant="tonal" size="sm" icon="add" onClick={() => setLinks((s) => [...s, { title: '', url: '' }])}>Add link</Button>}
              <p className="muted small" style={{ marginTop: 8 }}>{links.filter((r) => r.title.trim() || r.url.trim()).length}/10 links</p>
            </section>

            <section className="custom-card">
              <h4>Contact info</h4>
              <p className="muted small">Let people know how to contact you with business inquiries. The email address may appear in the About section of your channel.</p>
              <Field label="Contact email"><input type="email" maxLength={100} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></Field>
            </section>

            <section className="custom-card">
              <h4>Video watermark</h4>
              <p className="muted small">The watermark will appear on your videos in the right-hand corner of the video player. Viewers who aren&apos;t subscribed can tap it to subscribe.</p>
              <div className="custom-row">
                {watermark ? <img src={watermark.url} alt="" className="wm-preview" width={96} height={96} /> : !watermarkRemoved && config.watermark ? <img src={config.watermark} alt="" className="wm-preview" width={96} height={96} /> : <div className="wm-preview empty"><Icon name="image" size={32} aria-hidden="true" /></div>}
                <div className="btn-row">
                  <label className="btn btn-tonal btn-sm">{watermark || (!watermarkRemoved && config.watermark) ? 'Change' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setWatermark({ file: f, url: URL.createObjectURL(f) }); setWatermarkRemoved(false); } }} /></label>
                  {(watermark || (!watermarkRemoved && config.watermark)) && <Button size="sm" variant="text" onClick={() => { setWatermark(null); setWatermarkRemoved(true); }}>Remove</Button>}
                </div>
              </div>
              <fieldset className="wm-display">
                <legend className="muted small">Display time</legend>
                <label className="wm-radio"><input type="radio" name="watermark-display" checked={watermarkDisplay === 'end'} onChange={() => setWatermarkDisplay('end')} />End of video</label>
                <label className="wm-radio"><input type="radio" name="watermark-display" checked={watermarkDisplay === 'custom'} onChange={() => setWatermarkDisplay('custom')} />Custom start time</label>
                <label className="wm-radio"><input type="radio" name="watermark-display" checked={watermarkDisplay === 'full'} onChange={() => setWatermarkDisplay('full')} />Entire video</label>
              </fieldset>
              {watermarkDisplay === 'custom' && (
                <Field label="Show watermark after" hint="Seconds into the video (1–3600)."><input type="number" min={1} max={3600} value={watermarkStart} onChange={(e) => setWatermarkStart(e.target.value)} /></Field>
              )}
            </section>
          </>
        )}

      </div>
    </>
  );
}

/* ---------------- Live subs ---------------- */
/** One rolling digit: remounts and animates upward when its value changes. */
function DigitReel({ ch, index }: { ch: string; index: number }) {
  if (!/[0-9]/.test(ch)) return <span className="odo-sep" style={{ animationDelay: `${index * 35}ms` }}>{ch}</span>;
  return (
    <span className="odo-window" key={`${index}-${ch}`} aria-hidden="true">
      <span className="odo-digit" style={{ animationDelay: `${index * 35}ms` }}>{ch}</span>
    </span>
  );
}
function Odometer({ value }: { value: string }) {
  return (
    <span className="odo" aria-label={value}>
      {value.split('').map((ch, i) => <DigitReel key={i} ch={ch} index={i} />)}
    </span>
  );
}
const TIERS = [100, 500, 1_000, 10_000, 50_000, 100_000, 500_000];

export interface RecentSub { id: string; handle: string; name: string; avatar: string | null; subscribed_at: number }
const MILESTONES: Record<number, string> = {
  100: 'Hundred Club',
  500: 'Memberships unlocked',
  1_000: 'Partner unlocked',
  10_000: 'Stories unlocked',
  50_000: 'Verified badge',
  100_000: 'Six figures',
};

export interface RecentSub { id: string; handle: string; name: string; avatar: string | null; subscribed_at: number }

export function SubcountPanel({ initial, recent }: { initial: number; recent: RecentSub[] }) {
  const [count, setCount] = useState(initial);
  const [subs, setSubs] = useState<RecentSub[]>(recent);
  useEffect(() => {
    let alive = true;
    const poll = () => Promise.all([mySubscribers(), recentSubscribers(6)]).then(([n, r]) => {
      if (!alive) return;
      setCount((prev) => (n.ok ? n.data : prev));
      setSubs((prev) => (r.ok ? r.data : prev));
    });
    poll();
    const t = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const nextTier = TIERS.find((t) => t > count) ?? TIERS[TIERS.length - 1];
  const prevTier = nextTier === TIERS[0] ? 0 : TIERS[TIERS.indexOf(nextTier) - 1];
  const pct = Math.min(100, ((count - prevTier) / (nextTier - prevTier)) * 100);
  const remaining = nextTier - count;
  const milestone = [...Object.keys(MILESTONES)].map(Number).sort((a, b) => b - a).find((t) => count >= t);

  return (
    <div className="live-subs">
      <section className="s-card live-count-card">
        <div className="live-label"><span className="live-dot" />Live subscribers</div>
        <div className="live-number"><Odometer value={count.toLocaleString()} /></div>
        <div className="live-milestone">{milestone ? <>Unlocked: <b>{MILESTONES[milestone]}</b></> : 'Not unlocked yet'}</div>

        <div className="live-tier">
          <div className="live-tier-top"><span>{nextTier >= count ? `${count.toLocaleString()} / ${nextTier.toLocaleString()} to reach ${MILESTONES[nextTier] ?? nextTier.toLocaleString()}` : 'Max tier reached'}</span><span className="muted small">{prevTier.toLocaleString()} — {nextTier.toLocaleString()}</span></div>
          <div className="gate-bar"><i style={{ width: `${pct}%` }} /></div>
          <p className="muted small">{remaining > 0 ? <>You’re <b>{remaining.toLocaleString()}</b> subscribers away from the next milestone.</> : 'You’ve hit the top tier. Keep posting.'}</p>
        </div>
      </section>

      <section className="s-card live-recent-card">
        <h2>Recent subscribers</h2>
        {subs.length === 0 ? (
          <p className="muted">No subscribers yet. Keep posting — the first one always feels the best.</p>
        ) : (
          <ol className="recent-subs">
            {subs.map((s) => (
              <li key={s.id}>
                <Link href={`/${s.handle}`}><Avatar name={s.name} src={s.avatar} size={40} /></Link>
                <div className="recent-sub-body">
                  <b>{s.name}</b>
                  <span className="muted small">{s.handle}</span>
                </div>
                <span className="recent-sub-when muted small"><Ago ts={s.subscribed_at} /></span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** "Send feedback" — files straight into Vidora's review queue for the admin team. */
export function SendFeedback() {
  const app = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const me = app.me;
    if (!me || !text.trim()) return;
    setBusy(true);
    const r = await submitReport('channel', me.id, `Studio feedback: ${text.trim()}`);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setText('');
    setOpen(false);
    toast('Thanks — we read every note.');
  };
  return (
    <>
      <button type="button" className="studio-link studio-feedback" onClick={() => setOpen(true)}><Icon name="feedback" size={24} /><span>Send feedback</span></button>
      {open && (
        <Dialog title="Send feedback" onClose={() => setOpen(false)} width={480}
          footer={<><Button variant="text" onClick={() => setOpen(false)}>Cancel</Button><Button variant="filled" onClick={submit} disabled={!text.trim() || busy}>{busy ? 'Sending…' : 'Send'}</Button></>}>
          <Field label="What should we know?" hint="Goes straight to the Vidora team — no need to sugarcoat it.">
            <textarea autoFocus rows={5} value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Tell us what's working, what's broken, or what's missing…" />
          </Field>
        </Dialog>
      )}
    </>
  );
}
