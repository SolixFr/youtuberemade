'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { saveProgress } from '@/lib/actions/videos';
import { formatDuration, parseChapters } from '@/lib/format';
import { Icon, Switch } from './ui';

/** The few fields the player needs; the miniplayer and Studio preview pass the same shape. */
export interface PlayerVideo {
  id: string;
  src: string;
  captions: string | null;
  duration: number;
  description: string;
}

export interface PlayerHandle {
  video: HTMLVideoElement | null;
  seek: (t: number) => void;
  play: () => void;
}

interface Props {
  video: PlayerVideo;
  autoplayNext?: boolean;
  onAutoplayNext?: (on: boolean) => void;
  autoplay?: boolean;
  startAt?: number;
  clip?: { start: number; end: number };
  hotkeys?: boolean;
  compact?: boolean;
  theater?: boolean;
  onTheater?: () => void;
  onMini?: (t: number, playing: boolean) => void;
  onNext?: () => void;
  onEnded?: () => void;
  onTime?: (t: number) => void;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const prefs = { volume: 1, muted: false, rate: 1, captions: false, ambient: true };

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { video: v, autoplay = true, autoplayNext, onAutoplayNext, startAt, clip, hotkeys, compact, theater, onTheater, onMini, onNext, onEnded, onTime }, ref,
) {
  const src = v.src;
  const captionsUrl = v.captions;
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const ambient = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(v.duration);
  const [buffered, setBuffered] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(prefs.muted);
  const [volume, setVolume] = useState(prefs.volume);
  const [rate, setRate] = useState(prefs.rate);
  const [captions, setCaptions] = useState(prefs.captions);
  const [ambientOn, setAmbientOn] = useState(prefs.ambient);
  const [loop, setLoop] = useState(!!clip);
  const [settings, setSettings] = useState<null | 'main' | 'speed' | 'sleep'>(null);
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [ui, setUi] = useState(true);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wantPreview, setWantPreview] = useState(false);
  const [flash, setFlash] = useState<{ icon: string; key: number } | null>(null);
  const [seekHint, setSeekHint] = useState<{ side: 'l' | 'r'; key: number } | null>(null);
  const [fast, setFast] = useState(false);
  const [fs, setFs] = useState(false);
  const watched = useRef(0);
  const lastFlush = useRef(0);
  const lastTick = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTap = useRef(0);
  const lastPointer = useRef('mouse');
  const chapters = parseChapters(v.description, dur || v.duration);

  useImperativeHandle(ref, () => ({
    video: video.current,
    seek: (s) => { if (video.current) video.current.currentTime = s; },
    play: () => { video.current?.play().catch(() => {}); },
  }), []);

  /* ---- lifecycle ---- */
  useEffect(() => {
    const el = video.current;
    if (!el || !src) return;
    el.volume = prefs.volume;
    el.muted = prefs.muted;
    el.playbackRate = prefs.rate;
    const begin = clip?.start ?? (startAt && startAt < v.duration - 5 ? startAt : 0);
    const onMeta = () => {
      if (begin) el.currentTime = begin;
      setDur(el.duration || v.duration);
      if (autoplay) el.play().catch(() => { el.muted = true; setMuted(true); el.play().catch(() => {}); });
    };
    el.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      flushWatch(el.ended ? 0 : el.currentTime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, v.id]);

  /** Sends the resume point and the seconds watched since the last flush. */
  const flushWatch = (position: number) => {
    const secs = watched.current;
    watched.current = 0;
    lastFlush.current = Date.now();
    if (secs >= 1 || position > 3) void saveProgress(v.id, position, secs);
  };

  const onTimeUpdate = () => {
    const el = video.current!;
    const now = performance.now();
    if (!el.paused && lastTick.current !== null) watched.current += Math.min(1, (now - lastTick.current) / 1000) * el.playbackRate;
    lastTick.current = now;
    setT(el.currentTime);
    onTime?.(el.currentTime);
    if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1));
    if (clip && el.currentTime >= clip.end) {
      if (loop) el.currentTime = clip.start; else el.pause();
    }
    if (sleepAt && Date.now() >= sleepAt) {
      el.pause();
      setSleepAt(null);
    }
    if (Date.now() - lastFlush.current > 10_000) flushWatch(el.currentTime);
  };

  /* ---- ambient mode: a blurred copy of the current frame behind the player ---- */
  useEffect(() => {
    if (!ambientOn || compact) return;
    const c = ambient.current;
    const el = video.current;
    if (!c || !el) return;
    const ctx = c.getContext('2d');
    const draw = () => {
      if (el.readyState >= 2 && ctx) ctx.drawImage(el, 0, 0, c.width, c.height);
    };
    const id = setInterval(draw, 250);
    el.addEventListener('seeked', draw);
    return () => {
      clearInterval(id);
      el.removeEventListener('seeked', draw);
    };
  }, [ambientOn, compact, src]);

  /* ---- controls visibility ---- */
  const poke = useCallback(() => {
    setUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setUi(false), 2600);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /* ---- actions ---- */
  const toggle = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
    setFlash({ icon: el.paused ? 'pause' : 'play_arrow', key: Date.now() });
  }, []);
  const seekBy = useCallback((s: number) => {
    const el = video.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + s));
    setSeekHint({ side: s < 0 ? 'l' : 'r', key: Date.now() });
    poke();
  }, [poke]);
  const setMute = (m: boolean) => {
    const el = video.current!;
    el.muted = m;
    if (!m && el.volume === 0) el.volume = 0.5;
    prefs.muted = m;
    setMuted(m);
    setVolume(el.volume);
  };
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.current?.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const f = () => setFs(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const toggleCaptions = useCallback(() => {
    if (!captionsUrl) return;
    setCaptions((c) => { prefs.captions = !c; return !c; });
  }, [captionsUrl]);
  useEffect(() => {
    const track = video.current?.textTracks[0];
    if (track) track.mode = captions ? 'showing' : 'hidden';
  }, [captions, captionsUrl]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    if (!hotkeys) return;
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.dialog-scrim, .story-viewer')) return;
      const el = video.current;
      if (!el) return;
      const k = e.key.toLowerCase();
      if (k === 'k' || e.key === ' ') { e.preventDefault(); toggle(); }
      else if (k === 'j') seekBy(-10);
      else if (k === 'l') seekBy(10);
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(5); }
      else if (e.key === 'ArrowUp' && document.activeElement === root.current) { e.preventDefault(); el.volume = Math.min(1, el.volume + 0.05); setVolume(el.volume); }
      else if (e.key === 'ArrowDown' && document.activeElement === root.current) { e.preventDefault(); el.volume = Math.max(0, el.volume - 0.05); setVolume(el.volume); }
      else if (k === 'm') setMute(!el.muted);
      else if (k === 'f') toggleFs();
      else if (k === 'c') toggleCaptions();
      else if (k === 't') onTheater?.();
      else if (k === 'i') onMini?.(el.currentTime, !el.paused);
      else if (e.key === 'N' && e.shiftKey) onNext?.();
      else if (e.key === '>' || e.key === '<') {
        const i = RATES.indexOf(el.playbackRate);
        const next = RATES[Math.max(0, Math.min(RATES.length - 1, (i < 0 ? 3 : i) + (e.key === '>' ? 1 : -1)))];
        el.playbackRate = next; prefs.rate = next; setRate(next);
      } else if (/^[0-9]$/.test(e.key)) el.currentTime = (el.duration || 0) * (Number(e.key) / 10);
      else return;
      poke();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [hotkeys, toggle, seekBy, toggleFs, toggleCaptions, onTheater, onMini, onNext, poke]);

  /* ---- scrubbing ---- */
  const fracAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const scrub = (e: RPointerEvent<HTMLDivElement>) => {
    const el = video.current;
    if (!el || !dur) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (x: number) => { el.currentTime = fracAt(x) * dur; setT(el.currentTime); };
    move(e.clientX);
    const target = e.currentTarget;
    const onMove = (ev: PointerEvent) => move(ev.clientX);
    const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };
  const hoverPreview = (clientX: number) => {
    if (!wantPreview) setWantPreview(true);
    const f = fracAt(clientX);
    setHoverX(f);
    const pv = previewVideo.current;
    if (pv && pv.readyState >= 1 && Math.abs(pv.currentTime - f * dur) > 0.4) pv.currentTime = f * dur;
  };
  const drawPreview = () => {
    const c = previewCanvas.current;
    const pv = previewVideo.current;
    if (c && pv) c.getContext('2d')?.drawImage(pv, 0, 0, c.width, c.height);
  };

  /* ---- touch gestures: double-tap seek, press-and-hold 2x ---- */
  const onSurfaceDown = (e: RPointerEvent) => {
    lastPointer.current = e.pointerType;
    if (e.button !== 0) return;
    holdTimer.current = setTimeout(() => {
      const el = video.current;
      if (!el || el.paused) return;
      el.playbackRate = 2;
      setFast(true);
    }, 450);
  };
  const onSurfaceUp = (e: RPointerEvent) => {
    clearTimeout(holdTimer.current);
    const el = video.current;
    if (fast && el) {
      el.playbackRate = rate;
      setFast(false);
      return;
    }
    if (settings) { setSettings(null); return; }
    const now = Date.now();
    const touch = e.pointerType === 'touch';
    if (touch) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (now - lastTap.current < 300) {
        seekBy(e.clientX - r.left < r.width / 2 ? -10 : 10);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      if (!ui) { poke(); return; }
      setTimeout(() => { if (lastTap.current === now) toggle(); }, 300);
      return;
    }
    toggle();
  };

  const chapterNow = [...chapters].reverse().find((c) => c.t <= t);
  const hoverTime = hoverX !== null ? hoverX * dur : 0;
  const hoverChapter = [...chapters].reverse().find((c) => c.t <= hoverTime);
  const segments = chapters.length ? chapters.map((c, i) => ({ start: c.t, end: chapters[i + 1]?.t ?? dur })) : [{ start: 0, end: dur }];
  const showUi = ui || paused || settings !== null;

  return (
    <div className="player-wrap">
      {ambientOn && !compact && <canvas ref={ambient} className="ambient" width={32} height={18} aria-hidden="true" />}
      <div ref={root} tabIndex={0} className={`player ${showUi ? 'show-ui' : ''} ${compact ? 'compact' : ''} ${fs ? 'fs' : ''}`}
        onMouseMove={poke} onMouseLeave={() => !paused && setUi(false)}>
        {src && (
          <video ref={video} src={src} playsInline preload="auto" loop={loop && !clip}
            onPlay={() => { setPaused(false); lastTick.current = performance.now(); poke(); }}
            onPause={(e) => { setPaused(true); flushWatch(e.currentTarget.currentTime); lastTick.current = null; }}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={(e) => setDur(e.currentTarget.duration)}
            onEnded={() => { flushWatch(0); onEnded?.(); }}
            onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}>
            {captionsUrl && <track kind="subtitles" src={captionsUrl} srcLang="en" label="English" default={captions} />}
          </video>
        )}
        {src && wantPreview && <video ref={previewVideo} src={src} muted preload="metadata" className="preview-src" onSeeked={drawPreview} aria-hidden="true" />}
        <div className="p-surface" onPointerDown={onSurfaceDown} onPointerUp={onSurfaceUp} onDoubleClick={() => lastPointer.current !== 'touch' && !compact && toggleFs()} />
        {fast && <div className="p-fast">2x <Icon name="fast_forward" filled size={18} /></div>}
        {flash && <div key={flash.key} className="p-flash"><Icon name={flash.icon} filled size={36} /></div>}
        {seekHint && <div key={seekHint.key} className={`p-seek ${seekHint.side}`}><Icon name={seekHint.side === 'l' ? 'fast_rewind' : 'fast_forward'} filled />10 seconds</div>}
        <div className="p-gradient" />

        {settings && (
          <div className="p-menu" onPointerUp={(e) => e.stopPropagation()}>
            {settings === 'main' && (
              <>
                <div className="p-menu-row"><Icon name="motion_photos_auto" /><span>Ambient mode</span><Switch label="Ambient mode" on={ambientOn} onChange={(x) => { prefs.ambient = x; setAmbientOn(x); }} /></div>
                <div className="p-menu-row"><Icon name="repeat" /><span>Loop</span><Switch label="Loop" on={loop} onChange={setLoop} /></div>
                {captionsUrl && <button type="button" className="p-menu-row" onClick={() => { toggleCaptions(); }}><Icon name="closed_caption" /><span>Subtitles/CC</span><span className="p-val">{captions ? 'English' : 'Off'}</span></button>}
                <button type="button" className="p-menu-row" onClick={() => setSettings('sleep')}><Icon name="bedtime" /><span>Sleep timer</span><span className="p-val">{sleepAt ? `${Math.ceil((sleepAt - Date.now()) / 60000)} min` : 'Off'}</span><Icon name="chevron_right" /></button>
                <button type="button" className="p-menu-row" onClick={() => setSettings('speed')}><Icon name="slow_motion_video" /><span>Playback speed</span><span className="p-val">{rate === 1 ? 'Normal' : rate}</span><Icon name="chevron_right" /></button>
              </>
            )}
            {settings === 'speed' && (
              <>
                <button type="button" className="p-menu-head" onClick={() => setSettings('main')}><Icon name="chevron_left" />Playback speed</button>
                {RATES.map((r) => (
                  <button type="button" key={r} className="p-menu-row" onClick={() => { video.current!.playbackRate = r; prefs.rate = r; setRate(r); setSettings(null); }}>
                    <span className="p-check">{rate === r && <Icon name="check" />}</span><span>{r === 1 ? 'Normal' : r}</span>
                  </button>
                ))}
              </>
            )}
            {settings === 'sleep' && (
              <>
                <button type="button" className="p-menu-head" onClick={() => setSettings('main')}><Icon name="chevron_left" />Sleep timer</button>
                {[0, 10, 15, 20, 30, 45, 60].map((m) => (
                  <button type="button" key={m} className="p-menu-row" onClick={() => { setSleepAt(m ? Date.now() + m * 60000 : null); setSettings(null); }}>
                    <span className="p-check">{(m === 0 ? !sleepAt : false) && <Icon name="check" />}</span><span>{m ? `${m} minutes` : 'Off'}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="p-controls">
          <div className="p-bar" ref={bar} onPointerDown={scrub} onPointerMove={(e) => hoverPreview(e.clientX)} onPointerLeave={() => setHoverX(null)}>
            {hoverX !== null && (
              <div className="p-preview" style={{ left: `clamp(84px, ${hoverX * 100}%, calc(100% - 84px))` }}>
                <canvas ref={previewCanvas} width={160} height={90} />
                {hoverChapter && <div className="p-preview-chapter">{hoverChapter.title}</div>}
                <div className="p-preview-time">{formatDuration(hoverTime)}</div>
              </div>
            )}
            <div className="p-segments">
              {segments.map((s) => {
                const len = Math.max(0.0001, s.end - s.start);
                const fill = Math.max(0, Math.min(1, (t - s.start) / len));
                const buf = Math.max(0, Math.min(1, (buffered - s.start) / len));
                const hov = hoverX !== null ? Math.max(0, Math.min(1, (hoverTime - s.start) / len)) : 0;
                return (
                  <div key={s.start} className="p-seg" style={{ flexGrow: len }}>
                    <div className="p-buffer" style={{ width: `${buf * 100}%` }} />
                    <div className="p-hover" style={{ width: `${hov * 100}%` }} />
                    <div className="p-fill" style={{ width: `${fill * 100}%` }} />
                  </div>
                );
              })}
            </div>
            {clip && dur > 0 && <div className="p-clip" style={{ left: `${(clip.start / dur) * 100}%`, width: `${((clip.end - clip.start) / dur) * 100}%` }} />}
            <div className="p-knob" style={{ left: `${dur ? (t / dur) * 100 : 0}%` }} />
          </div>
          <div className="p-row">
            <button type="button" className="p-btn" onClick={toggle} aria-label={paused ? 'Play (k)' : 'Pause (k)'} data-tip={paused ? 'Play (k)' : 'Pause (k)'}><Icon name={paused ? 'play_arrow' : 'pause'} filled size={32} /></button>
            {onNext && <button type="button" className="p-btn hide-compact" onClick={onNext} aria-label="Next (SHIFT+n)" data-tip="Next (SHIFT+n)"><Icon name="skip_next" filled size={30} /></button>}
            <div className="p-volume">
              <button type="button" className="p-btn" onClick={() => setMute(!muted)} aria-label={muted ? 'Unmute (m)' : 'Mute (m)'} data-tip={muted ? 'Unmute (m)' : 'Mute (m)'}>
                <Icon name={muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'} filled size={28} />
              </button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume"
                style={{ '--vol': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                onChange={(e) => { const el = video.current!; el.volume = Number(e.target.value); el.muted = el.volume === 0; prefs.volume = el.volume; prefs.muted = el.muted; }} />
            </div>
            <span className="p-time">{formatDuration(t)} <span className="p-time-sep">/</span> {formatDuration(dur)}</span>
            {chapterNow && <span className="p-chapter hide-compact">· {chapterNow.title} <Icon name="chevron_right" size={18} /></span>}
            <span className="grow" />
            {!compact && onAutoplayNext && (
              <span className="p-autoplay hide-mobile" data-tip={`Autoplay is ${autoplayNext ? 'on' : 'off'}`}>
                <Switch label="Autoplay" on={!!autoplayNext} onChange={onAutoplayNext} />
              </span>
            )}
            <button type="button" className={`p-btn ${captions ? 'cc-on' : ''}`} disabled={!captionsUrl} onClick={toggleCaptions}
              aria-label="Subtitles/closed captions (c)" data-tip={captionsUrl ? 'Subtitles/closed captions (c)' : 'Subtitles/CC unavailable'}>
              <Icon name="closed_caption" filled={captions} size={28} />
            </button>
            <button type="button" className={`p-btn p-settings ${settings ? 'open' : ''}`} onClick={() => setSettings(settings ? null : 'main')} aria-label="Settings" data-tip="Settings"><Icon name="settings" size={26} /></button>
            {onMini && <button type="button" className="p-btn hide-mobile" onClick={() => onMini(video.current?.currentTime ?? 0, !paused)} aria-label="Miniplayer (i)" data-tip="Miniplayer (i)"><Icon name="picture_in_picture_alt" size={26} /></button>}
            {onTheater && <button type="button" className="p-btn hide-mobile" onClick={onTheater} aria-label={theater ? 'Default view (t)' : 'Theater mode (t)'} data-tip={theater ? 'Default view (t)' : 'Theater mode (t)'}><Icon name={theater ? 'crop_landscape' : 'crop_16_9'} size={28} /></button>}
            <button type="button" className="p-btn" onClick={toggleFs} aria-label={fs ? 'Exit full screen (f)' : 'Full screen (f)'} data-tip={fs ? 'Exit full screen (f)' : 'Full screen (f)'}><Icon name={fs ? 'fullscreen_exit' : 'fullscreen'} size={30} /></button>
          </div>
        </div>
      </div>
    </div>
  );
});
