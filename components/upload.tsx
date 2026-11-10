'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createPost } from '@/lib/actions/social';
import { createVideo, myPickers } from '@/lib/actions/studio';
import { formatDuration, parseChapters } from '@/lib/format';
import type { Visibility } from '@/lib/types';
import { uploadFile, type UploadHandle } from '@/lib/upload-client';
import { useApp } from './app-context';
import { Avatar, Button, Dialog, Field, Icon, IconButton, useToast } from './ui';

export const TOPICS = ['Education', 'Science & Technology', 'People & Blogs', 'Film & Animation', 'Music', 'Gaming', 'Travel & Events', 'Earth', 'The Sun', 'Rockets', 'Telescopes & Mars'];
const MAX_VIDEO = 1024 * 1024 * 1024;

interface Probe { duration: number; width: number; height: number; frames: Blob[] }

/** Reads duration and orientation, and grabs three frames to offer as thumbnails. */
export function probeVideo(url: string): Promise<Probe> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.muted = true;
    el.preload = 'auto';
    el.playsInline = true;
    el.src = url;
    const frames: Blob[] = [];
    const finish = (p: Partial<Probe>) => { el.removeAttribute('src'); el.load(); resolve({ duration: 0, width: 16, height: 9, frames, ...p }); };
    el.onerror = () => finish({});
    el.onloadedmetadata = async () => {
      let duration = el.duration;
      if (!Number.isFinite(duration)) {
        // MediaRecorder files report Infinity until the end has been seeked once.
        el.currentTime = 1e9;
        await new Promise((r) => { el.ontimeupdate = r; setTimeout(r, 2000); });
        duration = Number.isFinite(el.duration) ? el.duration : 0;
      }
      const canvas = document.createElement('canvas');
      const scale = 1280 / Math.max(el.videoWidth, el.videoHeight, 1);
      canvas.width = Math.max(2, Math.round(el.videoWidth * scale));
      canvas.height = Math.max(2, Math.round(el.videoHeight * scale));
      for (const f of [0.15, 0.5, 0.85]) {
        await new Promise<void>((r) => { el.onseeked = () => r(); el.currentTime = Math.max(0.1, duration * f); setTimeout(r, 2500); });
        canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (blob) frames.push(blob);
      }
      finish({ duration, width: el.videoWidth, height: el.videoHeight });
    };
  });
}

type UploadState = { status: 'uploading'; progress: number } | { status: 'done'; url: string } | { status: 'error'; message: string };

export function UploadDialog({ short, onClose }: { short?: boolean; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [custom, setCustom] = useState<{ blob: Blob; url: string } | null>(null);
  const [thumbIdx, setThumbIdx] = useState(0);
  const [captions, setCaptions] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const handle = useRef<UploadHandle | null>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [topic, setTopic] = useState('Education');
  const [kids, setKids] = useState<boolean | null>(null);
  const [asShort, setAsShort] = useState(!!short);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [playlist, setPlaylist] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [schedule, setSchedule] = useState('');
  const [toStory, setToStory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ id: string; type: string; scheduled: boolean; visibility: Visibility; thumb: string | null; duration: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [minSchedule] = useState(() => new Date(Date.now() + 5 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));

  useEffect(() => { myPickers().then((r) => r.ok && setPlaylists(r.data.playlists)); }, []);
  useEffect(() => () => { handle.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => frameUrls.forEach((u) => URL.revokeObjectURL(u)), [frameUrls]);

  const choose = async (f: File) => {
    if (!f.type.startsWith('video/')) return toast('Choose a video file (MP4, MOV or WebM)');
    if (f.size > MAX_VIDEO) return toast('Videos can be up to 1 GB');
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 100));
    // Start uploading straight away while the details are filled in.
    setUpload({ status: 'uploading', progress: 0 });
    const h = uploadFile(f, 'video', (p) => setUpload({ status: 'uploading', progress: p }));
    handle.current = h;
    h.promise.then((u) => setUpload({ status: 'done', url: u }), (err: Error) => setUpload({ status: 'error', message: err.message }));
    const p = await probeVideo(url);
    setProbe(p);
    setFrameUrls(p.frames.map((b) => URL.createObjectURL(b)));
    if (p.height > p.width && p.duration <= 180) setAsShort(true);
  };

  const publish = async () => {
    if (!probe || !handle.current) return;
    setSaving(true);
    try {
      const videoUrl = await handle.current.promise;
      const thumbBlob = thumbIdx === -1 && custom ? custom.blob : probe.frames[thumbIdx] ?? probe.frames[0];
      if (!thumbBlob) throw new Error('Couldn’t read a frame from this video. Upload a thumbnail image instead.');
      const [thumbnail, captionsUrl] = await Promise.all([
        uploadFile(thumbBlob, 'image').promise,
        captions ? uploadFile(captions, 'captions').promise : Promise.resolve(null),
      ]);
      const publishAt = schedule ? new Date(schedule).getTime() : null;
      const r = await createVideo({
        video: videoUrl, thumbnail, captions: captionsUrl, title, description: desc, duration: probe.duration, short: asShort, topic,
        madeForKids: !!kids, visibility, publishAt, playlistId: playlist || null, shareToStory: toStory,
      });
      if (!r.ok) throw new Error(r.error);
      setDone({ id: r.data.id, type: r.data.type, scheduled: !!publishAt, visibility, thumb: thumbIdx === -1 && custom ? custom.url : frameUrls[thumbIdx] ?? null, duration: probe.duration });
      handle.current = null;
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const href = done.type === 'short' ? `/shorts/${done.id}` : `/watch?v=${done.id}`;
    return (
      <Dialog title={done.scheduled ? 'Video scheduled' : done.visibility === 'private' ? 'Video saved as private' : 'Video published'} onClose={onClose} width={440}
        footer={(close) => <><Link className="btn btn-text btn-md" href="/studio/content" onClick={close}>Go to content</Link><Link className="btn btn-blue btn-md" href={href} onClick={close}>Watch</Link></>}>
        <div className="thumb done-thumb">{done.thumb && <img src={done.thumb} alt="" />}<span className="duration">{formatDuration(done.duration)}</span></div>
        <p className="muted">{done.scheduled ? `It will go public on ${new Date(schedule).toLocaleString()}.` : done.visibility === 'unlisted' ? 'Only people with the link can watch it.' : done.visibility === 'private' ? 'Only you can see it.' : 'It’s now on your channel and in your subscribers’ feeds.'}</p>
        <CopyLink path={href} />
      </Dialog>
    );
  }

  if (!file) {
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files[0];
      if (f) void choose(f);
    };
    return (
      <Dialog title={short ? 'Upload a Short' : 'Upload videos'} onClose={onClose} width={960} className="upload-dialog">
        <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          <span className="drop-circle"><Icon name="upload" size={64} /></span>
          <p className="drop-title">Drag and drop {short ? 'a vertical video' : 'a video file'} to upload</p>
          <p className="muted">Your video stays private until you publish it.</p>
          <label className="btn btn-filled btn-md">Select file<input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} /></label>
          <p className="muted small drop-note">MP4, MOV or WebM, up to 1 GB.</p>
        </div>
      </Dialog>
    );
  }

  const chapters = parseChapters(desc, probe?.duration ?? 0);
  const eligible = (app.me?.subscribers ?? 0) >= 10_000;
  const pct = upload?.status === 'uploading' ? Math.round(upload.progress * 100) : 100;
  const status = upload?.status === 'error' ? upload.message : upload?.status === 'done' ? (probe ? `Upload complete · ${formatDuration(probe.duration)}` : 'Upload complete · processing…') : `Uploading ${pct}%`;

  return (
    <Dialog title={title || 'Untitled'} onClose={onClose} width={960} className="upload-dialog" dismissable={false}
      footer={(close) => (
        <>
          <div className="upload-status">
            <span className={upload?.status === 'error' ? 'error' : ''}><Icon name={upload?.status === 'done' ? 'check_circle' : upload?.status === 'error' ? 'error' : 'cloud_upload'} size={20} />{status}</span>
            <span className="progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
          </div>
          <Button variant="text" onClick={() => { handle.current?.abort(); close(); }}>Cancel</Button>
          {step > 0 && <Button variant="text" onClick={() => setStep(0)}>Back</Button>}
          {step === 0
            ? <Button variant="filled" disabled={!title.trim() || kids === null || !probe} onClick={() => setStep(1)}>Next</Button>
            : <Button variant="filled" disabled={saving || upload?.status === 'error'} onClick={publish}>{saving ? (upload?.status === 'uploading' ? `Waiting for upload… ${pct}%` : 'Saving…') : schedule ? 'Schedule' : visibility === 'private' ? 'Save' : 'Publish'}</Button>}
        </>
      )}>
      <ol className="steps">
        {['Details', 'Visibility'].map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><span className="step-dot">{i < step && <Icon name="check" size={16} />}</span>{s}</li>)}
      </ol>
      <div className="upload-grid">
        <div>
          {step === 0 ? (
            <>
              <h3>Details</h3>
              <Field label="Title (required)" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title that describes your video" /></Field>
              <Field label="Description" count={`${desc.length}/5000`} hint={chapters.length ? `${chapters.length} chapters found` : 'Put timestamps such as “0:00 Intro” on their own lines to add chapters.'}>
                <textarea rows={6} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your video" />
              </Field>
              <h4>Thumbnail</h4>
              <p className="muted small">Pick a frame from your video or upload an image.</p>
              <div className="thumb-picks">
                <label className="thumb-upload"><Icon name="add_photo_alternate" />Upload file
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCustom({ blob: f, url: URL.createObjectURL(f) }); setThumbIdx(-1); } }} />
                </label>
                {custom && <button type="button" className={`thumb-pick ${thumbIdx === -1 ? 'on' : ''}`} onClick={() => setThumbIdx(-1)}><img src={custom.url} alt="Custom thumbnail" /></button>}
                {frameUrls.length
                   
                  ? frameUrls.map((u, i) => <button type="button" key={u} className={`thumb-pick ${thumbIdx === i ? 'on' : ''}`} onClick={() => setThumbIdx(i)}><img src={u} alt={`Frame ${i + 1}`} /></button>)
                  : <span className="thumb-pick loading">Reading frames…</span>}
              </div>
              {playlists.length > 0 && (
                <Field label="Add to playlist">
                  <select value={playlist} onChange={(e) => setPlaylist(e.target.value)}><option value="">None</option>{playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
                </Field>
              )}
              <h4>Audience</h4>
              <p className="muted small">Is this video made for kids? (required)</p>
              <label className="radio-row"><input type="radio" name="kids" checked={kids === true} onChange={() => setKids(true)} />Yes, it’s made for kids</label>
              <label className="radio-row"><input type="radio" name="kids" checked={kids === false} onChange={() => setKids(false)} />No, it’s not made for kids</label>
              <h4>Format and category</h4>
              <label className="check-row"><input type="checkbox" checked={asShort} onChange={(e) => setAsShort(e.target.checked)} />Publish as a Short</label>
              <Field label="Category"><select value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <h4>Subtitles</h4>
              <label className="btn btn-tonal btn-sm"><Icon name="closed_caption" size={20} />{captions ? captions.name : 'Upload a .vtt file'}
                <input type="file" accept=".vtt,text/vtt" hidden onChange={(e) => setCaptions(e.target.files?.[0] ?? null)} />
              </label>
            </>
          ) : (
            <>
              <h3>Visibility</h3>
              <p className="muted">Choose when to publish and who can see your video</p>
              <div className="radio-card">
                <b>Save or publish</b>
                {([['private', 'Private', 'Only you can watch your video'], ['unlisted', 'Unlisted', 'Anyone with the link can watch'], ['public', 'Public', 'Everyone can watch your video']] as const).map(([k, l, s]) => (
                  <label key={k} className="radio-row"><input type="radio" name="vis" checked={visibility === k && !schedule} onChange={() => { setVisibility(k); setSchedule(''); }} /><span><b>{l}</b><small>{s}</small></span></label>
                ))}
              </div>
              <div className="radio-card">
                <b>Schedule</b>
                <small className="muted">Pick a date and time to make your video public.</small>
                <input type="datetime-local" className="input" value={schedule} min={minSchedule} onChange={(e) => { setSchedule(e.target.value); setVisibility('public'); }} />
              </div>
              <div className="radio-card">
                <b>Share to your story</b>
                <label className="check-row">
                  <input type="checkbox" disabled={!eligible || visibility !== 'public' || !!schedule} checked={toStory} onChange={(e) => setToStory(e.target.checked)} />
                  <span>{eligible ? 'Post a story that links to this video (visible for 7 days)' : 'Stories unlock at 10,000 subscribers'}</span>
                </label>
              </div>
            </>
          )}
        </div>
        <aside className="upload-preview">
          {preview && <video src={preview} controls playsInline preload="metadata" />}
          <dl>
            <dt>Filename</dt><dd>{file.name}</dd>
            <dt>Size</dt><dd>{(file.size / 1e6).toFixed(1)} MB</dd>
            {probe && <><dt>Length</dt><dd>{formatDuration(probe.duration)} · {probe.width}×{probe.height}</dd></>}
          </dl>
        </aside>
      </div>
    </Dialog>
  );
}

function CopyLink({ path }: { path: string }) {
  const toast = useToast();
  const url = new URL(path, window.location.origin).toString();
  return (
    <div className="copy-row">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Video link" />
      <Button variant="blue" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast('Couldn’t copy'))}>Copy</Button>
    </div>
  );
}

/* ---------------- Post composer ---------------- */
export function PostComposer({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'text' | 'image' | 'poll' | 'video'>('text');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [options, setOptions] = useState(['', '']);
  const [videos, setVideos] = useState<{ id: string; title: string }[]>([]);
  const [videoId, setVideoId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { myPickers().then((r) => r.ok && setVideos(r.data.videos)); }, []);

  const valid = kind === 'poll' ? text.trim() && options.filter((o) => o.trim()).length >= 2 : kind === 'image' ? !!image : kind === 'video' ? !!videoId : !!text.trim();
  const post = async (close: () => void) => {
    setBusy(true);
    try {
      const img = kind === 'image' && image ? await uploadFile(image.blob, 'image').promise : null;
      const r = await createPost({ text, image: img, poll: kind === 'poll' ? options.filter((o) => o.trim()) : undefined, videoId: kind === 'video' ? videoId : undefined });
      if (!r.ok) return toast(r.error);
      close();
      router.refresh();
      toast('Post published', { label: 'View', run: () => router.push(`/post/${r.data}`) });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Create post" onClose={onClose} width={600}
      footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="blue" disabled={!valid || busy} onClick={() => post(close)}>{busy ? 'Posting…' : 'Post'}</Button></>}>
      <div className="composer-head"><Avatar channel={app.me} size={40} /><b>{app.me?.name}</b><span className="muted small">Public</span></div>
      <textarea className="composer-text" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'poll' ? 'Ask a question' : 'Share an update, a sneak peek or a question'} />
      {kind === 'image' && (image ? (
         
        <div className="composer-image"><img src={image.url} alt="" /><button type="button" className="icon-btn on-media" aria-label="Remove image" onClick={() => setImage(null)}><Icon name="close" /></button></div>
      ) : (
        <label className="dropzone small"><Icon name="add_photo_alternate" size={40} /><span>Choose an image</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setImage({ blob: f, url: URL.createObjectURL(f) }); }} />
        </label>
      ))}
      {kind === 'poll' && (
        <div className="poll-edit">
          {options.map((o, i) => (
            <div key={i} className="poll-edit-row">
              <Field label={`Option ${i + 1}`} count={`${o.length}/65`}><input maxLength={65} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
              {options.length > 2 && <IconButton icon="close" label="Remove option" onClick={() => setOptions(options.filter((_, j) => j !== i))} />}
            </div>
          ))}
          {options.length < 5 && <Button variant="text" icon="add" onClick={() => setOptions([...options, ''])}>Add option</Button>}
        </div>
      )}
      {kind === 'video' && (videos.length ? (
        <Field label="Your video"><select value={videoId} onChange={(e) => setVideoId(e.target.value)}><option value="">Choose a video</option>{videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}</select></Field>
      ) : <p className="muted">Publish a public video first to attach it.</p>)}
      <div className="composer-kinds">
        {([['image', 'image', 'Image'], ['poll', 'ballot', 'Poll'], ['video', 'smart_display', 'Video']] as const).map(([k, icon, label]) => (
          <Button key={k} size="sm" variant={kind === k ? 'filled' : 'tonal'} icon={icon} onClick={() => setKind(kind === k ? 'text' : k)}>{label}</Button>
        ))}
      </div>
    </Dialog>
  );
}
