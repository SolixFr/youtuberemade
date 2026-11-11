'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createStory, deleteStory, likeStory, loadStories, markStorySeen } from '@/lib/actions/social';
import type { StoryGroup, StorySlide } from '@/lib/types';
import { uploadFile } from '@/lib/upload-client';
import { formatCount } from '@/lib/format';
import { Ago } from './ago';
import { useApp } from './app-context';
import { VerifiedBadge } from './cards';
import { Avatar, Button, ConfirmDialog, Dialog, EmptyState, Field, Icon, IconButton, Spinner, useIsMobile, useToast } from './ui';

const SLIDE_MS = 6000;
const MIN_SUBS = 10_000;
const BACKGROUNDS = ['#0f0f0f', '#1a237e', '#004d40', '#b71c1c', '#4a148c', '#e65100', '#37474f', '#f5f5f5'];

/* ---------- Shelf of story avatars ---------- */
export function StoriesRow({ groups }: { groups: StoryGroup[] }) {
  const app = useApp();
  const me = app.me;
  const eligible = (me?.subscribers ?? 0) >= MIN_SUBS;
  const mine = groups.find((g) => g.channel.id === me?.id);
  const others = groups.filter((g) => g.channel.id !== me?.id);
  if (!others.length && !eligible) return null;
  return (
    <section className="stories" aria-label="Stories">
      <h2 className="shelf-title">Stories</h2>
      <div className="stories-row">
        {me && eligible && (
          <div className="story-bubble">
            <button type="button" className="story-avatar" onClick={() => (mine ? app.openStory(me.id) : app.open({ kind: 'story' }))} aria-label={mine ? 'Your story' : 'Create a story'}>
              <Avatar channel={me} size={64} ring={mine ? mine.channel.story : null} />
              <span className="story-add" onClick={(e) => { e.stopPropagation(); app.open({ kind: 'story' }); }} role="button" aria-label="Add to story"><Icon name="add" size={16} /></span>
            </button>
            <span className="story-name">Your story</span>
          </div>
        )}
        {others.map((g) => (
          <button type="button" key={g.channel.id} className="story-bubble" onClick={() => app.openStory(g.channel.id)}>
            <span className="story-avatar"><Avatar channel={g.channel} size={64} ring={g.channel.story ?? 'seen'} /></span>
            <span className="story-name">{g.channel.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Full-screen viewer ---------- */
export function StoryViewer({ startChannel, onClose }: { startChannel: string; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const mobile = useIsMobile();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const elapsed = useRef(0);
  const bar = useRef<HTMLElement | null>(null);
  const touchX = useRef(0);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { onClose(); router.refresh(); }, 150);
  }, [onClose, router]);

  useEffect(() => {
    loadStories(startChannel).then((r) => {
      if (!r.ok || !r.data.length) { toast('No active stories'); onClose(); return; }
      setGroups(r.data);
      setSi(Math.max(0, r.data[0].slides.findIndex((s) => !s.seen)));
    });
  }, [startChannel, onClose, toast]);

  const group = groups?.[gi];
  const slide = group?.slides[si];

  const go = useCallback((delta: number) => {
    if (!groups || !group) return;
    elapsed.current = 0;
    const next = si + delta;
    if (next >= group.slides.length) {
      if (gi + 1 < groups.length) { setGi(gi + 1); setSi(0); } else close();
    } else if (next < 0) {
      if (gi > 0) { setGi(gi - 1); setSi(groups[gi - 1].slides.length - 1); } else setSi(0);
    } else setSi(next);
  }, [si, gi, group, groups, close]);

  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (slide && !slide.seen && !marked.current.has(slide.id)) {
      marked.current.add(slide.id);
      void markStorySeen(slide.id);
    }
  }, [slide]);

  useEffect(() => {
    if (!slide) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      if (paused || confirm || document.hidden) return;
      elapsed.current += dt;
      if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, elapsed.current / SLIDE_MS)})`;
      if (elapsed.current >= SLIDE_MS) go(1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, paused, confirm, slide]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (confirm) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    document.addEventListener('keydown', key);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', key); document.body.classList.remove('no-scroll'); };
  }, [go, close, confirm]);

  const isMine = group?.channel.id === app.me?.id;
  return (
    <div className={`story-viewer ${closing ? 'closing' : ''}`} onClick={(e) => e.target === e.currentTarget && close()}>
      {!groups || !group || !slide ? <Spinner size={40} /> : (
        <>
          {!mobile && (gi > 0 || si > 0) && <button type="button" className="story-nav prev" aria-label="Previous" onClick={() => go(-1)}><Icon name="chevron_left" /></button>}
          {!mobile && <button type="button" className="story-nav next" aria-label="Next" onClick={() => go(1)}><Icon name="chevron_right" /></button>}
          {!mobile && <IconButton icon="close" label="Close" className="story-close" onClick={close} />}
          <div key={slide.id} className="story-frame" style={{ background: slide.background }}
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) < 60) return;
              elapsed.current = 0;
              if (dx < 0 && gi + 1 < groups.length) { setGi(gi + 1); setSi(0); } else if (dx > 0 && gi > 0) { setGi(gi - 1); setSi(0); }
            }}>
            {slide.image && <img src={slide.image} alt="" className="story-img" />}
            <div className="story-bars">
              {group.slides.map((s, i) => <span key={s.id}><i ref={i === si ? (el) => { bar.current = el; } : undefined} style={{ transform: `scaleX(${i < si ? 1 : 0})` }} /></span>)}
            </div>
            <div className="story-head">
              <Link href={`/${group.channel.handle}`} onClick={close} className="story-who"><Avatar channel={group.channel} size={32} />{group.channel.name}</Link>
              <span className="story-when"><Ago ts={slide.createdAt} /></span>
              {isMine && <span className="story-when">{formatCount(slide.views)} views · {formatCount(slide.likes)} likes</span>}
              <span className="grow" />
              <IconButton icon={paused ? 'play_arrow' : 'pause'} filled label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)} />
              {mobile && <IconButton icon="close" label="Close" onClick={close} />}
            </div>
            <div className="story-tap left" onClick={() => go(-1)} />
            <div className="story-tap right" onClick={() => (paused ? setPaused(false) : go(1))}
              onPointerDown={(e) => { const t = setTimeout(() => setPaused(true), 250); e.currentTarget.addEventListener('pointerup', () => clearTimeout(t), { once: true }); }} />
            {slide.text && <p className={`story-text ${posClasses(slide.textPos)}`} style={{ color: slide.textColor }}>{slide.text}</p>}
            <div className="story-foot">
              {slide.video && (
                <Link className="story-link" href={slide.video.type === 'short' ? `/shorts/${slide.video.id}` : `/watch?v=${slide.video.id}`} onClick={close}>
                  <Icon name="play_arrow" filled size={20} /><MarqueeText text={slide.video.title} />
                </Link>
              )}
              <span className="grow" />
              {isMine ? (
                <>
                  <Button size="sm" className="on-media" icon="delete" onClick={() => setConfirm(true)}>Delete</Button>
                  <Button size="sm" variant="filled" className="on-media-light" icon="add" onClick={() => { close(); app.open({ kind: 'story' }); }}>Add</Button>
                </>
              ) : (
                <>
                  <IconButton icon="favorite" filled={slide.liked} label={slide.liked ? 'Unlike' : 'Like'} className={slide.liked ? 'liked' : ''}
                    onClick={() => app.requireAuth('Sign in to like stories', () => {
                      const on = !slide.liked;
                      setGroups((gs) => gs?.map((g, i) => (i === gi ? { ...g, slides: g.slides.map((s) => (s.id === slide.id ? { ...s, liked: on } : s)) } : g)) ?? null);
                      void likeStory(slide.id, on);
                    })} />
                  <IconButton icon="share" label="Share" onClick={() => { setPaused(true); app.open({ kind: 'share', title: `${group.channel.name} on Vidora`, path: `/${group.channel.handle}/stories` }); }} />
                </>
              )}
            </div>
          </div>
        </>
      )}
      {confirm && slide && (
        <ConfirmDialog title="Delete this story?" text="It will be removed from your channel and your subscribers’ feeds." onClose={() => setConfirm(false)} onConfirm={async () => {
          const r = await deleteStory(slide.id);
          if (!r.ok) return toast(r.error);
          toast('Story deleted');
          if (group!.slides.length <= 1) close();
          else {
            setGroups((gs) => gs?.map((g, i) => (i === gi ? { ...g, slides: g.slides.filter((s) => s.id !== slide.id) } : g)) ?? null);
            setSi(Math.max(0, si - 1));
          }
        }} />
      )}
    </div>
  );
}

/* ---------- Composer ---------- */
const TEXT_COLORS = ['#ffffff', '#0f0f0f', '#ffd54f', '#80deea'];
const POSITIONS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const POS_LABELS: Record<string, string> = {
  'top-left': 'Top left', 'top-center': 'Top center', 'top-right': 'Top right',
  'middle-left': 'Middle left', 'middle-center': 'Middle center', 'middle-right': 'Middle right',
  'bottom-left': 'Bottom left', 'bottom-center': 'Bottom center', 'bottom-right': 'Bottom right',
};
export const posClasses = (pos?: string) => {
  const [v = 'middle', h = 'center'] = (pos || 'middle-center').split('-');
  return `pos-${v} pos-${h}`;
};
const contrast = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 128 ? '#0f0f0f' : '#ffffff';
};

export function StoryComposer({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const me = app.me!;
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BACKGROUNDS[1]);
  const [color, setColor] = useState('#ffffff');
  const [pos, setPos] = useState('middle-center');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const camVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => () => camera?.getTracks().forEach((t) => t.stop()), [camera]);
  useEffect(() => { if (camVideo.current && camera) { camVideo.current.srcObject = camera; void camVideo.current.play().catch(() => {}); } }, [camera]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  if (me.subscribers < MIN_SUBS) {
    return (
      <Dialog title="Stories" onClose={onClose} width={460} footer={(close) => <Button variant="blue" onClick={close}>Got it</Button>}>
        <p>Stories are available to channels with <b>{MIN_SUBS.toLocaleString()} or more subscribers</b>.</p>
        <div className="gate"><div className="gate-bar"><i style={{ width: `${Math.min(100, (me.subscribers / MIN_SUBS) * 100)}%` }} /></div><span>{me.subscribers.toLocaleString()} / {MIN_SUBS.toLocaleString()}</span></div>
      </Dialog>
    );
  }

  const startCamera = async () => {
    try { setCamera(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })); }
    catch { toast('Camera unavailable. You can upload a photo instead.'); }
  };
  const snap = () => {
    const v = camVideo.current;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => b && setPhoto({ blob: b, url: URL.createObjectURL(b) }), 'image/jpeg', 0.88);
    camera?.getTracks().forEach((t) => t.stop());
    setCamera(null);
  };
  const post = async (close: () => void) => {
    setBusy(true);
    try {
      const image = photo ? await uploadFile(photo.blob, 'image').promise : null;
      const r = await createStory({ image, text, background: bg, textColor: color, textPos: pos });
      if (!r.ok) return toast(r.error);
      close();
      router.refresh();
      toast('Story posted. It stays up for 7 days.', { label: 'View', run: () => app.openStory(me.id) });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Create story" onClose={onClose} width={760}
      footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="blue" disabled={(!text.trim() && !photo) || busy} onClick={() => post(close)}>{busy ? 'Posting…' : 'Post story'}</Button></>}>
      <div className="story-editor">
        <div className="story-preview" style={{ background: bg }}>
          {camera ? <video ref={camVideo} muted playsInline className="story-img mirror" /> : photo && <img src={photo.url} alt="" className="story-img" />}
          {text && <p className={`story-text ${posClasses(pos)}`} style={{ color }}>{text}</p>}
          {camera && <Button variant="filled" className="snap on-media-light" icon="photo_camera" onClick={snap}>Take photo</Button>}
        </div>
        <div className="story-controls">
          <div className="btn-row">
            <label className="btn btn-tonal btn-sm"><Icon name="add_photo_alternate" size={20} />Photo
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ blob: f, url: URL.createObjectURL(f) }); }} />
            </label>
            <Button size="sm" icon="photo_camera" onClick={startCamera}>Camera</Button>
            {photo && <Button size="sm" variant="text" icon="close" onClick={() => setPhoto(null)}>Remove photo</Button>}
          </div>
          <Field label="Text" count={`${text.length}/120`}><textarea rows={2} maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something" /></Field>
          <p className="label">Background</p>
          <div className="swatches">
            {BACKGROUNDS.map((b) => <button type="button" key={b} aria-label={`Background ${b}`} className={bg === b ? 'on' : ''} style={{ background: b }} onClick={() => { setBg(b); setColor(contrast(b)); }} />)}
            <label className={`swatch ${BACKGROUNDS.includes(bg) ? '' : 'on'}`} style={BACKGROUNDS.includes(bg) ? undefined : { background: bg }} title="Custom color">
              {BACKGROUNDS.includes(bg) && <Icon name="add" size={14} />}
              <input type="color" value={bg} onChange={(e) => { setBg(e.target.value); setColor(contrast(e.target.value)); }} aria-label="Pick a custom background color" />
            </label>
          </div>
          <p className="label">Text color</p>
          <div className="swatches">
            {TEXT_COLORS.map((c) => <button type="button" key={c} aria-label={`Text color ${c}`} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} />)}
            <label className={`swatch ${TEXT_COLORS.includes(color) ? '' : 'on'}`} style={TEXT_COLORS.includes(color) ? undefined : { background: color }} title="Custom color">
              {TEXT_COLORS.includes(color) && <Icon name="add" size={14} />}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Pick a custom text color" />
            </label>
          </div>
          <p className="label">Text position</p>
          <div className="pos-grid" role="group" aria-label="Text position">
            {POSITIONS.map((p) => <button type="button" key={p} className={pos === p ? 'on' : ''} aria-label={POS_LABELS[p]} aria-pressed={pos === p} title={POS_LABELS[p]} onClick={() => setPos(p)} />)}
          </div>
          <p className="muted small">Stories are visible for 7 days on your channel and in your subscribers’ feeds.</p>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Marquee: slides one-line text left to its end, then back ---------- */
function MarqueeText({ text }: { text: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const measure = () => {
      const b = box.current, i = inner.current;
      if (b && i) setShift(Math.min(0, b.clientWidth - i.offsetWidth));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text]);
  return (
    <span ref={box} className="marquee">
      <span ref={inner} className="marquee-inner" style={{ '--shift': `${shift}px`, animation: shift < 0 ? undefined : 'none' } as CSSProperties}>{text}</span>
    </span>
  );
}

/* ---------- Stories page ---------- */
function SlideFrame({ s }: { s: StorySlide }) {
  return (
    <div className={`story-tile-frame ${s.image ? 'has-image' : ''}`} style={{ background: s.background, color: s.textColor }}>
      {s.image && <img src={s.image} alt="" loading="lazy" />}
      <p className={posClasses(s.textPos)}>{s.text}</p>
    </div>
  );
}

function SlideTile({ channelId, s, showViews }: { channelId: string; s: StorySlide; showViews?: boolean }) {
  const app = useApp();
  return (
    <button type="button" className={`story-tile ${s.seen ? 'seen' : ''}`} onClick={() => app.openStory(channelId)} aria-label={s.text ? `Story: ${s.text}` : 'Story'}>
      <SlideFrame s={s} />
      <span className="story-tile-cap"><Ago ts={s.createdAt} />{showViews && <> · {formatCount(s.views)} views</>}{s.seen && <span className="seen-tag"><Icon name="check" size={14} />Seen</span>}</span>
    </button>
  );
}

function AddStoryTile() {
  const app = useApp();
  return (
    <button type="button" className="story-tile" onClick={() => app.open({ kind: 'story' })}>
      <div className="story-tile-frame add"><Icon name="add" size={40} /></div>
      <div className="small">Add to story</div>
    </button>
  );
}

/** The /stories page: your story first, then one section per channel with an active story. */
export function StoriesView({ groups, meId, canPost }: { groups: StoryGroup[]; meId: string | null; canPost: boolean }) {
  const app = useApp();
  const mine = meId ? groups.find((g) => g.channel.id === meId) : undefined;
  const others = groups.filter((g) => g.channel.id !== meId);
  return (
    <>
      {(mine || canPost) && (
        <section aria-labelledby="your-story">
          <h2 className="stories-sec" id="your-story">Your story</h2>
          <div className="story-tiles">
            {mine?.slides.map((s) => <SlideTile key={s.id} channelId={mine.channel.id} s={s} showViews />)}
            {canPost && <AddStoryTile />}
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="all-stories">
          <h2 className="stories-sec" id="all-stories">{meId ? 'From your subscriptions' : 'All stories'}</h2>
          {others.map((g) => {
            const last = g.slides[g.slides.length - 1];
            return (
              <section key={g.channel.id} className="story-group" aria-label={`${g.channel.name}’s stories`}>
                <button type="button" className="story-group-head" onClick={() => app.openStory(g.channel.id)} aria-label={`Open ${g.channel.name}’s stories`}>
                  <Avatar channel={g.channel} size={40} ring={g.channel.story ?? 'seen'} />
                  <span className="story-group-text">
                    <span className="story-group-name">{g.channel.name}{g.channel.verified && <VerifiedBadge />}</span>
                    <span className="muted small">{g.slides.length} {g.slides.length === 1 ? 'story' : 'stories'} · latest <Ago ts={last.createdAt} /></span>
                  </span>
                  <Icon name="chevron_right" className="story-group-chev" />
                </button>
                <div className="story-tiles">{g.slides.map((s) => <SlideTile key={s.id} channelId={g.channel.id} s={s} />)}</div>
              </section>
            );
          })}
        </section>
      )}
      {!mine && others.length === 0 && (
        <EmptyState icon="auto_stories" title="No active stories"
          text={meId ? 'Stories from the channels you subscribe to show up here. They disappear 7 days after they’re posted.' : 'Stories from channels show up here. Sign in to follow your favorite channels.'}
          action={!meId ? <Link href="/signin?next=/stories" className="btn btn-tonal btn-md">Sign in</Link> : undefined} />
      )}
    </>
  );
}
