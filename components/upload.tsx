'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { formatDuration, parseChapters, uid } from '@/lib/format';
import { putFile } from '@/lib/media';
import { myChannel, STORY_MIN_SUBS, update, useDB, useNow } from '@/lib/store';
import type { Video, Visibility } from '@/lib/types';
import { useApp } from './app-context';
import { Button, Dialog, Field, Icon, MediaImg, useToast } from './ui';

const TOPICS = ['Earth', 'The Sun', 'Rockets', 'Telescopes & Mars', 'Education', 'Science & Technology', 'People & Blogs', 'Film & Animation', 'Music', 'Gaming', 'Travel & Events'];

interface Probe { duration: number; width: number; height: number; frames: Blob[] }

/** Reads duration/orientation and grabs three frames to offer as thumbnails. */
function probeVideo(url: string): Promise<Probe> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.muted = true;
    el.preload = 'auto';
    el.playsInline = true;
    el.src = url;
    const frames: Blob[] = [];
    const finish = (p: Partial<Probe>) => resolve({ duration: 0, width: 16, height: 9, frames, ...p });
    el.onerror = () => finish({});
    el.onloadedmetadata = async () => {
      let duration = el.duration;
      if (!Number.isFinite(duration)) {
        // MediaRecorder output reports Infinity until the end is seeked once.
        el.currentTime = 1e9;
        await new Promise((r) => { el.ontimeupdate = r; setTimeout(r, 2000); });
        duration = Number.isFinite(el.duration) ? el.duration : 0;
      }
      const canvas = document.createElement('canvas');
      const scale = 640 / Math.max(el.videoWidth, el.videoHeight, 1);
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

export function UploadDialog({ short, onClose }: { short?: boolean; onClose: () => void }) {
  const d = useDB();
  const toast = useToast();
  const me = myChannel(d);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [custom, setCustom] = useState<{ blob: Blob; url: string } | null>(null);
  const [thumbIdx, setThumbIdx] = useState(0);
  const [captions, setCaptions] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [topic, setTopic] = useState('Education');
  const [kids, setKids] = useState<boolean | null>(null);
  const [asShort, setAsShort] = useState(!!short);
  const [playlist, setPlaylist] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [schedule, setSchedule] = useState('');
  const [toStory, setToStory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Video | null>(null);
  const [drag, setDrag] = useState(false);
  const now = useNow();

  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    frameUrls.forEach((u) => URL.revokeObjectURL(u));
  }, [fileUrl, frameUrls]);

  const choose = async (f: File) => {
    if (!f.type.startsWith('video/')) return toast('Choose a video file');
    const url = URL.createObjectURL(f);
    setFile(f);
    setFileUrl(url);
    setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 100));
    const p = await probeVideo(url);
    setProbe(p);
    setFrameUrls(p.frames.map((b) => URL.createObjectURL(b)));
    if (p.height > p.width && p.duration <= 180) setAsShort(true);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) choose(f);
  };

  const publish = async () => {
    if (!file || !probe) return;
    setSaving(true);
    try {
      const src = await putFile(file);
      const thumbBlob = custom?.blob ?? probe.frames[thumbIdx] ?? probe.frames[0];
      const thumbnail = thumbBlob ? await putFile(thumbBlob) : '';
      const captionsRef = captions ? await putFile(captions) : undefined;
      const publishedAt = schedule ? new Date(schedule).getTime() : Date.now();
      const v: Video = {
        id: uid('v'), channelId: 'me', type: asShort ? 'short' : 'video', title: title.trim(), description: desc,
        duration: Math.round(probe.duration), views: 0, likes: 0, publishedAt, src, thumbnail, captions: captionsRef,
        visibility, topic, madeForKids: !!kids,
      };
      update((db) => {
        db.videos.unshift(v);
        if (playlist) {
          const p = db.playlists.find((x) => x.id === playlist);
          if (p) { p.videoIds.unshift(v.id); p.updatedAt = Date.now(); }
        }
        if (toStory && visibility === 'public') {
          db.stories.push({ id: uid('st'), channelId: 'me', createdAt: Date.now(), image: thumbnail, background: '#000', text: `New: ${v.title}`, textColor: '#ffffff', videoId: v.id });
        }
      });
      setDone(v);
    } catch (err) {
      console.error(err);
      toast('Upload failed: your browser storage may be full.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const href = done.type === 'short' ? `/shorts/${done.id}` : `/watch?v=${done.id}`;
    const scheduled = done.publishedAt > now;
    return (
      <Dialog title={scheduled ? 'Video scheduled' : done.visibility === 'private' ? 'Video saved as private' : 'Video published'} onClose={onClose} width={440}
        footer={<><Link className="btn btn-text btn-md" href="/studio/content" onClick={onClose}>Go to content</Link><Link className="btn btn-blue btn-md" href={href} onClick={onClose}>Watch</Link></>}>
        <div className="thumb done-thumb"><MediaImg src={done.thumbnail} /><span className="duration">{formatDuration(done.duration)}</span></div>
        <p className="muted">{scheduled ? `It will go public on ${new Date(done.publishedAt).toLocaleString()}.` : done.visibility === 'unlisted' ? 'Only people with the link can watch it.' : done.visibility === 'private' ? 'Only you can see it.' : 'It now shows up on your channel and in your subscribers’ feeds.'}</p>
        <CopyLink path={href} />
      </Dialog>
    );
  }

  if (!file) {
    return (
      <Dialog title={short ? 'Upload a Short' : 'Upload videos'} onClose={onClose} width={960} className="upload-dialog">
        <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          <span className="drop-circle"><Icon name="upload" size={64} /></span>
          <p className="drop-title">Drag and drop {short ? 'a vertical video' : 'video files'} to upload</p>
          <p className="muted">Your videos will be private until you publish them.</p>
          <label className="btn btn-filled btn-md">Select files<input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} /></label>
          <p className="muted small drop-note">Files are stored in this browser (IndexedDB). Nothing is sent to a server.</p>
        </div>
      </Dialog>
    );
  }

  const thumbs = [...(custom ? [custom.url] : []), ...frameUrls];
  const selectedThumb = custom ? (thumbIdx === -1 ? custom.url : frameUrls[thumbIdx]) : frameUrls[thumbIdx];
  const chapters = parseChapters(desc, probe?.duration ?? 0);
  const eligible = me.subscribers >= STORY_MIN_SUBS;

  return (
    <Dialog title={title || 'Untitled'} onClose={onClose} width={960} className="upload-dialog" dismissable={false}
      footer={
        <>
          <span className="upload-status"><Icon name={probe ? 'check_circle' : 'progress_activity'} size={20} />{probe ? `Ready · ${formatDuration(probe.duration)}` : 'Processing…'}</span>
          <span className="grow" />
          {step > 0 && <Button variant="text" onClick={() => setStep(0)}>Back</Button>}
          {step === 0
            ? <Button variant="filled" disabled={!title.trim() || kids === null || !probe} onClick={() => setStep(1)}>Next</Button>
            : <Button variant="filled" disabled={saving} onClick={publish}>{saving ? 'Saving…' : schedule ? 'Schedule' : visibility === 'private' ? 'Save' : 'Publish'}</Button>}
        </>
      }>
      <ol className="steps">
        {['Details', 'Visibility'].map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><span className="step-dot">{i < step && <Icon name="check" size={16} />}</span>{s}</li>)}
      </ol>
      <div className="upload-grid">
        <div>
          {step === 0 ? (
            <>
              <h3>Details</h3>
              <Field label="Title (required)" count={`${title.length}/100`}><input maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title that describes your video" /></Field>
              <Field label="Description" count={`${desc.length}/5000`} hint={chapters.length ? `${chapters.length} chapters detected from timestamps` : 'Add timestamps like “0:00 Intro” on separate lines to create chapters.'}>
                <textarea rows={6} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell viewers about your video" />
              </Field>
              <h4>Thumbnail</h4>
              <p className="muted small">Pick a frame from your video or upload an image.</p>
              <div className="thumb-picks">
                <label className="thumb-upload"><Icon name="add_photo_alternate" />Upload file
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCustom({ blob: f, url: URL.createObjectURL(f) }); setThumbIdx(-1); } }} />
                </label>
                {custom && <button type="button" className={`thumb-pick ${thumbIdx === -1 ? 'on' : ''}`} onClick={() => setThumbIdx(-1)}><img src={custom.url} alt="Custom thumbnail" /></button>}
                {frameUrls.length ? frameUrls.map((u, i) => <button type="button" key={u} className={`thumb-pick ${thumbIdx === i ? 'on' : ''}`} onClick={() => { setThumbIdx(i); setCustom(custom && null); }}><img src={u} alt={`Frame ${i + 1}`} /></button>)
                  : <span className="thumb-pick loading">Reading frames…</span>}
              </div>
              <h4>Playlists</h4>
              <Field label="Add to playlist">
                <select value={playlist} onChange={(e) => setPlaylist(e.target.value)}>
                  <option value="">None</option>
                  {d.playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </Field>
              <h4>Audience</h4>
              <p className="muted small">Is this video made for kids? (required)</p>
              <label className="radio-row"><input type="radio" name="kids" checked={kids === true} onChange={() => setKids(true)} />Yes, it’s made for kids</label>
              <label className="radio-row"><input type="radio" name="kids" checked={kids === false} onChange={() => setKids(false)} />No, it’s not made for kids</label>
              <h4>Format and topic</h4>
              <label className="check-row"><input type="checkbox" checked={asShort} onChange={(e) => setAsShort(e.target.checked)} />Publish as a Short (shown in the vertical Shorts feed)</label>
              <Field label="Category"><select value={topic} onChange={(e) => setTopic(e.target.value)}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <h4>Subtitles</h4>
              <label className="btn btn-tonal btn-sm upload-vtt"><Icon name="closed_caption" size={20} />{captions ? captions.name : 'Upload a .vtt file'}
                <input type="file" accept=".vtt,text/vtt" hidden onChange={(e) => setCaptions(e.target.files?.[0] ?? null)} />
              </label>
            </>
          ) : (
            <>
              <h3>Visibility</h3>
              <p className="muted">Choose when to publish and who can see your video</p>
              <div className="radio-card">
                <b>Save or publish</b>
                {([['private', 'Private', 'Only you can watch your video'], ['unlisted', 'Unlisted', 'Anyone with the video link can watch your video'], ['public', 'Public', 'Everyone can watch your video']] as const).map(([k, l, s]) => (
                  <label key={k} className="radio-row"><input type="radio" name="vis" checked={visibility === k && !schedule} onChange={() => { setVisibility(k); setSchedule(''); }} /><span><b>{l}</b><small>{s}</small></span></label>
                ))}
              </div>
              <div className="radio-card">
                <b>Schedule</b>
                <small className="muted">Select a date to make your video public.</small>
                <input type="datetime-local" className="input" value={schedule} min={new Date(now + 60_000).toISOString().slice(0, 16)}
                  onChange={(e) => { setSchedule(e.target.value); setVisibility('public'); }} />
              </div>
              <div className="radio-card">
                <b>Share to your story</b>
                <label className="check-row">
                  <input type="checkbox" disabled={!eligible || visibility !== 'public' || !!schedule} checked={toStory} onChange={(e) => setToStory(e.target.checked)} />
                  <span>{eligible ? 'Post a story slide that links to this video (visible for 7 days)' : `Stories unlock at ${STORY_MIN_SUBS.toLocaleString()} subscribers`}</span>
                </label>
              </div>
            </>
          )}
        </div>
        <aside className="upload-preview">
          {fileUrl && <video src={fileUrl} controls playsInline poster={selectedThumb ?? thumbs[0]} />}
          <dl>
            <dt>Filename</dt><dd>{file.name}</dd>
            <dt>Size</dt><dd>{(file.size / 1e6).toFixed(1)} MB</dd>
            {probe && <><dt>Length</dt><dd>{formatDuration(probe.duration)} · {probe.width}×{probe.height}</dd></>}
            <dt>Format</dt><dd>{asShort ? 'Short' : 'Video'}</dd>
          </dl>
        </aside>
      </div>
    </Dialog>
  );
}

function CopyLink({ path }: { path: string }) {
  const toast = useToast();
  const url = typeof window !== 'undefined' ? new URL(path, window.location.origin).toString() : path;
  return (
    <div className="copy-row">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Video link" />
      <Button variant="blue" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied to clipboard'), () => toast('Couldn’t copy'))}>Copy</Button>
    </div>
  );
}

/* ---------------- Post composer ---------------- */
export function PostComposer({ onClose }: { onClose: () => void }) {
  const d = useDB();
  const toast = useToast();
  const router = useRouter();
  const me = myChannel(d);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'text' | 'image' | 'poll' | 'video'>('text');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [options, setOptions] = useState(['', '']);
  const [videoId, setVideoId] = useState('');
  const mine = d.videos.filter((v) => v.channelId === 'me');
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ta.current?.focus(), []);

  const valid = kind === 'poll' ? text.trim() && options.filter((o) => o.trim()).length >= 2
    : kind === 'image' ? !!image : kind === 'video' ? !!videoId : !!text.trim();

  const post = async () => {
    const img = image ? await putFile(image.blob) : undefined;
    const id = uid('p');
    update((db) => {
      db.posts.unshift({
        id, channelId: 'me', text: text.trim(), createdAt: Date.now(), likes: 0,
        image: kind === 'image' ? img : undefined,
        poll: kind === 'poll' ? options.map((o) => o.trim()).filter(Boolean).map((o) => ({ text: o, votes: 0 })) : undefined,
        videoId: kind === 'video' ? videoId : undefined,
      });
    });
    toast('Post published', { label: 'View', run: () => router.push(`/post/${id}`) });
    onClose();
  };

  return (
    <Dialog title="Create post" onClose={onClose} width={600}
      footer={<><Button variant="text" onClick={onClose}>Cancel</Button><Button variant="blue" disabled={!valid} onClick={post}>Post</Button></>}>
      <div className="composer-head"><span className="avatar-sm"><MediaImg src={me.avatar} /></span><b>{me.name}</b><span className="muted small">Visibility: Public</span></div>
      <textarea ref={ta} className="composer-text" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'poll' ? 'Ask a question' : 'Share a sneak peek, an update, or a question with your audience'} />
      {kind === 'image' && (
        image ? (
          <div className="composer-image"><img src={image.url} alt="" /><button type="button" className="icon-btn on-media" aria-label="Remove image" onClick={() => setImage(null)}><Icon name="close" /></button></div>
        ) : (
          <label className="dropzone small"><Icon name="add_photo_alternate" size={40} /><span>Choose an image</span>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setImage({ blob: f, url: URL.createObjectURL(f) }); }} />
          </label>
        )
      )}
      {kind === 'poll' && (
        <div className="poll-edit">
          {options.map((o, i) => (
            <div key={i} className="poll-edit-row">
              <Field label={`Option ${i + 1}`} count={`${o.length}/65`}><input maxLength={65} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
              {options.length > 2 && <button type="button" className="icon-btn" aria-label="Remove option" onClick={() => setOptions(options.filter((_, j) => j !== i))}><Icon name="close" /></button>}
            </div>
          ))}
          {options.length < 5 && <Button variant="text" icon="add" onClick={() => setOptions([...options, ''])}>Add option</Button>}
        </div>
      )}
      {kind === 'video' && (
        mine.length ? (
          <Field label="Your video"><select value={videoId} onChange={(e) => setVideoId(e.target.value)}><option value="">Choose a video</option>{mine.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}</select></Field>
        ) : <p className="muted">Upload a video first to attach it to a post.</p>
      )}
      <div className="composer-kinds">
        {([['image', 'image', 'Image'], ['poll', 'ballot', 'Poll'], ['video', 'smart_display', 'Video']] as const).map(([k, icon, label]) => (
          <Button key={k} size="sm" variant={kind === k ? 'filled' : 'tonal'} icon={icon} onClick={() => setKind(kind === k ? 'text' : k)}>{label}</Button>
        ))}
      </div>
    </Dialog>
  );
}
