'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Ago } from '@/components/ago';
import { useApp } from '@/components/app-context';
import { Thumbnail } from '@/components/cards';
import { Player } from '@/components/player';
import { Avatar, Button, ConfirmDialog, Field, Icon, IconButton, useToast } from '@/components/ui';
import { probeVideo } from '@/components/upload';
import { updateChannel } from '@/lib/actions/channels';
import { addComment, deleteComment, deleteStory, moderateComment } from '@/lib/actions/social';
import { createVideo, deleteVideo, updateVideo } from '@/lib/actions/studio';
import {formatDate, formatDuration, watchHref } from '@/lib/format';
import type { Channel, Comment, StorySlide, Video, Visibility } from '@/lib/types';
import { uploadFile } from '@/lib/upload-client';

const visIcon = (v: Visibility) => (v === 'public' ? 'visibility' : v === 'unlisted' ? 'link' : 'lock');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function CreateButtons() {
  const app = useApp();
  return (
    <span className="actions">
      <Button size="sm" icon="upload" onClick={() => app.open({ kind: 'upload' })}>Upload</Button>
      <Link href="/studio/live" className="btn btn-tonal btn-sm"><Icon name="sensors" size={20} />Go live</Link>
      <Button size="sm" icon="edit_note" onClick={() => app.open({ kind: 'post' })}>Post</Button>
      <Button size="sm" icon="add_circle" onClick={() => app.open({ kind: 'story' })}>Story</Button>
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
            <button type="button" className="story-tile-frame" style={{ background: s.background, color: s.textColor }} onClick={() => app.openStory(channelId)}>
              {s.image && <img src={s.image} alt="" />}<p>{s.text}</p>
            </button>
            <div className="muted small">Expires in {Math.ceil(left / 86_400_000)} day{left > 86_400_000 ? 's' : ''}{s.video ? ` · links “${s.video.title}”` : ''}</div>
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

/* ---------------- Go live: webcam recording, published when the stream ends ---------------- */
export function GoLive({ name }: { name: string }) {
  const toast = useToast();
  const router = useRouter();
  const cam = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [live, setLive] = useState<{ started: number; rec: MediaRecorder; chunks: Blob[] } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [chat, setChat] = useState<{ id: number; text: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  useEffect(() => { if (cam.current && stream) { cam.current.srcObject = stream; void cam.current.play().catch(() => {}); } }, [stream]);
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
    setSaving(0);
    try {
      await new Promise<void>((r) => { live.rec.onstop = () => r(); live.rec.stop(); });
      const blob = new Blob(live.chunks, { type: (live.rec.mimeType || 'video/webm').split(';')[0] });
      const url = URL.createObjectURL(blob);
      const probe = await probeVideo(url);
      URL.revokeObjectURL(url);
      const thumbBlob = probe.frames[1] ?? probe.frames[0];
      if (!thumbBlob) throw new Error('The recording couldn’t be read');
      const [video, thumbnail] = await Promise.all([uploadFile(blob, 'video', (p) => setSaving(p)).promise, uploadFile(thumbBlob, 'image').promise]);
      const r = await createVideo({
        video, thumbnail, title: title.trim() || `Live stream, ${new Date().toLocaleDateString()}`, description: desc,
        duration: probe.duration || (Date.now() - live.started) / 1000, short: false, topic: 'People & Blogs', madeForKids: false, visibility: 'public', recordedLive: true,
      });
      if (!r.ok) throw new Error(r.error);
      for (const m of chat) await addComment(r.data.id, m.text);
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setLive(null);
      toast('Stream ended. The recording is on your channel.', { label: 'Watch', run: () => router.push(`/watch?v=${r.data.id}`) });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setChat((c) => [...c, { id: Date.now(), text: msg.trim() }]);
    setMsg('');
  };

  return (
    <div className="live-setup">
      <div>
        <div className="cam">
          {stream ? <video ref={cam} muted playsInline /> : (
            <div><Icon name="videocam" size={48} /><p>{error || 'Turn on your camera to preview the stream.'}</p><Button variant="blue" onClick={camera}>Turn on camera</Button></div>
          )}
          {live && <span className="on-air">LIVE · {formatDuration(elapsed)}</span>}
        </div>
        <Field label="Title" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title" disabled={!!live} /></Field>
        <Field label="Description"><textarea rows={3} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!!live} /></Field>
        <div className="btn-row">
          {live ? <Button variant="filled" icon="stop_circle" disabled={saving !== null} onClick={stop}>{saving !== null ? `Saving ${Math.round(saving * 100)}%` : 'End stream'}</Button>
            : <Button variant="filled" icon="sensors" disabled={!stream} onClick={start}>Go live</Button>}
        </div>
        <p className="muted small">There’s no streaming server, so viewers can’t join live. The stream is recorded and published to your channel when you end it, with your chat messages as comments.</p>
      </div>
      <aside className="live-chat">
        <div className="live-chat-head">Live chat</div>
        <div className="live-chat-msgs">
          {chat.length === 0 && <p className="muted">{live ? 'Say hello to your audience.' : 'Chat opens when you go live.'}</p>}
          {chat.map((m) => <div key={m.id}><b>{name}</b>{m.text}</div>)}
        </div>
        <form onSubmit={send}><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Chat as ${name}…`} maxLength={200} disabled={!live} aria-label="Chat message" /><IconButton icon="send" label="Send" type="submit" disabled={!live || !msg.trim()} /></form>
      </aside>
    </div>
  );
}

/* ---------------- Customization ---------------- */
export function Customize({ channel, demoTools }: { channel: Channel; demoTools: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(channel.name);
  const [handle, setHandle] = useState(channel.handle);
  const [desc, setDesc] = useState(channel.description);
  const [links, setLinks] = useState(channel.links.map((l) => `${l.title} | ${l.url}`).join('\n'));
  const [subs, setSubs] = useState(String(channel.subscribers));
  const [avatar, setAvatar] = useState<{ file: File | null; url: string | null } | null>(null);
  const [banner, setBanner] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const [av, bn] = await Promise.all([
        avatar?.file ? uploadFile(avatar.file, 'image').promise : Promise.resolve(avatar ? null : undefined),
        banner ? uploadFile(banner.file, 'image').promise : Promise.resolve(undefined),
      ]);
      const r = await updateChannel({ name, handle, description: desc, links, avatar: av, banner: bn, subscribers: demoTools ? Number(subs) : undefined });
      if (!r.ok) { setError(r.error); return; }
      setAvatar(null);
      setBanner(null);
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
      <h1>Channel customization <span className="actions"><Link href={`/${channel.handle}`} className="btn btn-tonal btn-sm">View channel</Link><Button variant="filled" size="sm" disabled={!name.trim() || busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish'}</Button></span></h1>
      <div className="customize">
        {error && <p className="form-error" role="alert">{error}</p>}
        <h4>Picture</h4>
        <div className="custom-row">
          {avatar?.url ? <img src={avatar.url} alt="" className="avatar" width={96} height={96} /> : <Avatar name={name} src={avatar ? null : channel.avatar} size={96} />}
          <div>
            <p className="muted small">Shown next to your videos and comments. Square images work best.</p>
            <div className="btn-row">
              <label className="btn btn-tonal btn-sm">Change<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar({ file: f, url: URL.createObjectURL(f) }); }} /></label>
              <Button size="sm" variant="text" onClick={() => setAvatar({ file: null, url: null })}>Remove</Button>
            </div>
          </div>
        </div>
        <h4>Banner image</h4>
        <div className="custom-row">
          <div className="custom-banner">{(banner?.url ?? channel.banner) && <img src={banner?.url ?? channel.banner!} alt="" />}</div>
          <label className="btn btn-tonal btn-sm">{channel.banner || banner ? 'Change' : 'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setBanner({ file: f, url: URL.createObjectURL(f) }); }} /></label>
        </div>
        <Field label="Name" count={`${name.length}/50`}><input maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Handle"><input value={handle} maxLength={31} onChange={(e) => setHandle(e.target.value.startsWith('@') ? e.target.value : `@${e.target.value}`)} /></Field>
        <Field label="Description" count={`${desc.length}/1000`}><textarea rows={5} maxLength={1000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your channel" /></Field>
        <Field label="Links" hint="One per line: Title | https://example.com"><textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} /></Field>
        {demoTools && (
          <>
            <h4>Subscriber count (demo tool)</h4>
            <p className="muted small">Only available in development or when VIDORA_DEMO_TOOLS=1, so you can try Stories (10,000+ subscribers) on a fresh account.</p>
            <Field label="Subscribers"><input type="number" min={0} value={subs} onChange={(e) => setSubs(e.target.value)} /></Field>
          </>
        )}
      </div>
    </>
  );
}
