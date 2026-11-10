'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { timeAgo, uid } from '@/lib/format';
import { deleteFile, putFile } from '@/lib/media';
import { activeStories, hasUnseenStory, myChannel, STORY_MIN_SUBS, update, useDB } from '@/lib/store';
import { useApp } from './app-context';
import { Avatar, Button, ConfirmDialog, Dialog, Field, Icon, IconButton, MediaImg, useIsMobile, useToast } from './ui';

const SLIDE_MS = 6000;
const BACKGROUNDS = ['#0f0f0f', '#1a237e', '#004d40', '#b71c1c', '#4a148c', '#e65100', '#37474f', '#f5f5f5'];

/* ---------- Row of story avatars (Home on phones, Subscriptions, channel pages) ---------- */
export function StoriesRow({ only }: { only?: string[] }) {
  const d = useDB();
  const app = useApp();
  const me = myChannel(d);
  const groups = activeStories(d).filter((g) => (only ? only.includes(g.channelId) : g.channelId === 'me' || d.user.subscriptions.includes(g.channelId)));
  const mine = groups.find((g) => g.channelId === 'me');
  const others = groups.filter((g) => g.channelId !== 'me').sort((a, b) => Number(hasUnseenStory(d, b.channelId)) - Number(hasUnseenStory(d, a.channelId)));
  const eligible = me.subscribers >= STORY_MIN_SUBS;
  if (!others.length && !eligible) return null;
  return (
    <section className="stories" aria-label="Stories">
      <h2 className="shelf-title">Stories</h2>
      <div className="stories-row">
        {eligible && (
          <div className="story-bubble">
            <button type="button" className="story-avatar" onClick={() => (mine ? app.openStory('me') : app.open({ kind: 'story' }))} aria-label={mine ? 'Your story' : 'Create a story'}>
              <Avatar channel={me} size={64} ring={mine ? (hasUnseenStory(d, 'me') ? 'unseen' : 'seen') : null} />
              <span className="story-add" onClick={(e) => { e.stopPropagation(); app.open({ kind: 'story' }); }} role="button" aria-label="Add to story"><Icon name="add" size={16} /></span>
            </button>
            <span className="story-name">Your story</span>
          </div>
        )}
        {others.map((g) => {
          const c = d.channels[g.channelId];
          return (
            <button type="button" key={g.channelId} className="story-bubble" onClick={() => app.openStory(g.channelId)}>
              <span className="story-avatar"><Avatar channel={c} size={64} ring={hasUnseenStory(d, g.channelId) ? 'unseen' : 'seen'} /></span>
              <span className="story-name">{c.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Full-screen viewer ---------- */
export function StoryViewer({ startChannel, onClose }: { startChannel: string; onClose: () => void }) {
  const d = useDB();
  const app = useApp();
  const toast = useToast();
  const mobile = useIsMobile();
  const groups = useMemo(() => {
    const all = activeStories(d).filter((g) => g.channelId === startChannel || g.channelId === 'me' || d.user.subscriptions.includes(g.channelId));
    const first = all.filter((g) => g.channelId === startChannel);
    return [...first, ...all.filter((g) => g.channelId !== startChannel)];
    // Order is fixed when the viewer opens so it doesn't reshuffle as slides are marked seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startChannel]);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(() => {
    const g = groups[0];
    const i = g ? g.slides.findIndex((s) => !d.user.seenStories.includes(s.id)) : 0;
    return Math.max(0, i);
  });
  const [paused, setPaused] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const elapsed = useRef(0);
  const bar = useRef<HTMLElement | null>(null);
  const touchX = useRef(0);
  const holding = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const group = groups[gi];
  const live = group ? d.stories.filter((s) => s.channelId === group.channelId && group.slides.some((x) => x.id === s.id)) : [];
  const slide = live[si];
  const channel = group ? d.channels[group.channelId] : undefined;

  const go = useCallback((delta: number) => {
    elapsed.current = 0;
    if (!group) return onClose();
    const next = si + delta;
    if (next >= live.length) {
      if (gi + 1 < groups.length) { setGi(gi + 1); setSi(0); } else onClose();
    } else if (next < 0) {
      if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].slides.length - 1); } else setSi(0);
    } else setSi(next);
  }, [si, gi, group, groups, live.length, onClose]);

  useEffect(() => {
    if (slide && !d.user.seenStories.includes(slide.id)) update((db) => { db.user.seenStories.push(slide.id); });
  }, [slide, d.user.seenStories]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      if (paused || confirm) return;
      elapsed.current += dt;
      if (bar.current) bar.current.style.width = `${Math.min(100, (elapsed.current / SLIDE_MS) * 100)}%`;
      if (elapsed.current >= SLIDE_MS) go(1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, paused, confirm]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (confirm) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    document.addEventListener('keydown', key);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', key);
      document.body.classList.remove('no-scroll');
    };
  }, [go, onClose, confirm]);

  if (!group || !slide || !channel) return null;
  const liked = d.user.likedStories.includes(slide.id);
  const linked = slide.videoId ? d.videos.find((v) => v.id === slide.videoId) : undefined;
  const isMine = channel.id === 'me';

  return (
    <div className="story-viewer" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {!mobile && (gi > 0 || si > 0) && <button type="button" className="story-nav prev" aria-label="Previous" onClick={() => go(-1)}><Icon name="chevron_left" /></button>}
      {!mobile && <button type="button" className="story-nav next" aria-label="Next" onClick={() => go(1)}><Icon name="chevron_right" /></button>}
      {!mobile && <IconButton icon="close" label="Close" className="story-close" onClick={onClose} />}
      <div className="story-frame" style={{ background: slide.background }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 60) { elapsed.current = 0; if (dx < 0 && gi + 1 < groups.length) { setGi(gi + 1); setSi(0); } else if (dx > 0 && gi > 0) { setGi(gi - 1); setSi(0); } }
        }}>
        {slide.image && <MediaImg src={slide.image} className="story-img" />}
        <div className="story-bars">
          {live.map((s, i) => (
            <span key={s.id}><i ref={i === si ? (el) => { bar.current = el; } : undefined} style={{ width: i < si ? '100%' : '0%' }} /></span>
          ))}
        </div>
        <div className="story-head">
          <Link href={`/${channel.handle}`} onClick={onClose}><Avatar channel={channel} size={32} /></Link>
          <Link href={`/${channel.handle}`} onClick={onClose} className="story-who">{channel.name}</Link>
          <span className="story-when">{timeAgo(slide.createdAt)}</span>
          <span className="grow" />
          <IconButton icon={paused ? 'play_arrow' : 'pause'} filled label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)} />
          {mobile && <IconButton icon="close" label="Close" onClick={onClose} />}
        </div>
        <div className="story-tap left" onClick={() => go(-1)}
          onPointerDown={() => { holding.current = setTimeout(() => setPaused(true), 200); }} onPointerUp={() => { clearTimeout(holding.current); }} />
        <div className="story-tap right" onClick={() => { if (!paused) go(1); else setPaused(false); }}
          onPointerDown={() => { holding.current = setTimeout(() => setPaused(true), 200); }} onPointerUp={() => { clearTimeout(holding.current); }} />
        {slide.text && <p className="story-text" style={{ color: slide.textColor }}>{slide.text}</p>}
        <div className="story-foot">
          {linked && (
            <Link className="story-link" href={linked.type === 'short' ? `/shorts/${linked.id}` : `/watch?v=${linked.id}`} onClick={onClose}>
              <Icon name="play_arrow" filled size={20} />Watch: {linked.title}
            </Link>
          )}
          <span className="grow" />
          {isMine ? (
            <>
              <Button size="sm" variant="tonal" className="on-media" icon="delete" onClick={() => setConfirm(true)}>Delete</Button>
              <Button size="sm" variant="filled" className="on-media-light" icon="add" onClick={() => { onClose(); app.open({ kind: 'story' }); }}>Add</Button>
            </>
          ) : (
            <>
              <IconButton icon="favorite" filled={liked} label={liked ? 'Unlike' : 'Like'} className={liked ? 'liked' : ''}
                onClick={() => update((db) => { db.user.likedStories = liked ? db.user.likedStories.filter((x) => x !== slide.id) : [...db.user.likedStories, slide.id]; })} />
              <IconButton icon="share" label="Share" onClick={() => { setPaused(true); app.open({ kind: 'share', title: `${channel.name} on Vidora`, path: `/${channel.handle}/stories` }); }} />
            </>
          )}
        </div>
      </div>
      {confirm && (
        <ConfirmDialog title="Delete this story?" text="It will be removed from your channel and your subscribers’ feeds." onClose={() => setConfirm(false)}
          onConfirm={() => {
            update((db) => { db.stories = db.stories.filter((s) => s.id !== slide.id); });
            deleteFile(slide.image);
            toast('Story deleted');
            if (live.length <= 1) onClose(); else setSi(Math.max(0, si - 1));
          }} />
      )}
    </div>
  );
}

/* ---------- Composer ---------- */
export function StoryComposer({ onClose }: { onClose: () => void }) {
  const d = useDB();
  const toast = useToast();
  const app = useApp();
  const me = myChannel(d);
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[1]);
  const [color, setColor] = useState('#ffffff');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [videoId, setVideoId] = useState('');
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const camVideo = useRef<HTMLVideoElement>(null);
  const mine = d.videos.filter((v) => v.channelId === 'me' && v.visibility === 'public');

  useEffect(() => () => camera?.getTracks().forEach((t) => t.stop()), [camera]);
  useEffect(() => { if (camVideo.current && camera) { camVideo.current.srcObject = camera; camVideo.current.play().catch(() => {}); } }, [camera]);

  if (me.subscribers < STORY_MIN_SUBS) {
    const pct = Math.min(100, (me.subscribers / STORY_MIN_SUBS) * 100);
    return (
      <Dialog title="Stories" onClose={onClose} width={460}
        footer={<><Link className="btn btn-text btn-md" href="/studio/customization" onClick={onClose}>Change subscriber count</Link><Button variant="blue" onClick={onClose}>Got it</Button></>}>
        <p>Stories are available to channels with <b>{STORY_MIN_SUBS.toLocaleString()} or more subscribers</b>.</p>
        <div className="gate"><div className="gate-bar"><i style={{ width: `${pct}%` }} /></div><span>{me.subscribers.toLocaleString()} / {STORY_MIN_SUBS.toLocaleString()}</span></div>
        <p className="muted small">This demo lets you edit your own subscriber count in Studio → Customization to try the feature.</p>
      </Dialog>
    );
  }

  const startCamera = async () => {
    try {
      setCamera(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }));
    } catch {
      toast('Camera unavailable. You can upload a photo instead.');
    }
  };
  const snap = () => {
    const v = camVideo.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) setPhoto({ blob: b, url: URL.createObjectURL(b) }); }, 'image/jpeg', 0.88);
    camera?.getTracks().forEach((t) => t.stop());
    setCamera(null);
  };
  const post = async () => {
    const image = photo ? await putFile(photo.blob) : undefined;
    update((db) => {
      db.stories.push({ id: uid('st'), channelId: 'me', createdAt: Date.now(), image, background: bg, text: text.trim(), textColor: color, videoId: videoId || undefined });
    });
    onClose();
    toast('Story posted. It will be visible for 7 days.', { label: 'View', run: () => app.openStory('me') });
  };

  return (
    <Dialog title="Create story" onClose={onClose} width={760}
      footer={<><Button variant="text" onClick={onClose}>Cancel</Button><Button variant="blue" disabled={!text.trim() && !photo} onClick={post}>Post story</Button></>}>
      <div className="story-editor">
        <div className="story-preview" style={{ background: bg }}>
          {camera ? <video ref={camVideo} muted playsInline className="story-img" /> : photo && <img src={photo.url} alt="" className="story-img" />}
          {text && <p className="story-text" style={{ color }}>{text}</p>}
          {videoId && <span className="story-link"><Icon name="play_arrow" filled size={18} />Watch video</span>}
          {camera && <Button variant="filled" className="snap on-media-light" icon="photo_camera" onClick={snap}>Take photo</Button>}
        </div>
        <div className="story-controls">
          <div className="row-wrap">
            <label className="btn btn-tonal btn-sm"><Icon name="add_photo_alternate" size={20} />Photo<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ blob: f, url: URL.createObjectURL(f) }); }} /></label>
            <Button size="sm" icon="photo_camera" onClick={startCamera}>Camera</Button>
            {photo && <Button size="sm" variant="text" icon="close" onClick={() => setPhoto(null)}>Remove photo</Button>}
          </div>
          <Field label="Text" count={`${text.length}/120`}><textarea rows={2} maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something" /></Field>
          <p className="label">Background</p>
          <div className="swatches">{BACKGROUNDS.map((b) => <button type="button" key={b} aria-label={`Background ${b}`} className={bg === b ? 'on' : ''} style={{ background: b }} onClick={() => { setBg(b); setColor(b === '#f5f5f5' ? '#0f0f0f' : '#ffffff'); }} />)}</div>
          <p className="label">Text color</p>
          <div className="swatches">{['#ffffff', '#0f0f0f', '#ffd54f', '#80deea'].map((c) => <button type="button" key={c} aria-label={`Text ${c}`} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
          <Field label="Link a video (optional)">
            <select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
              <option value="">None</option>
              {mine.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
            </select>
          </Field>
          {!mine.length && <p className="muted small">Public videos you upload can be linked from a story.</p>}
        </div>
      </div>
    </Dialog>
  );
}
