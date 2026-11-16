'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { Chips, IconButton, Spinner } from './ui';

/** "In this video" panel for the watch page recommendations column: the reference
    shell (title, close, Chapters / Transcript tabs, chapter rows with thumbnail
    and timestamp). Transcript cues are parsed from the .vtt file on first open. */
export function ChapterPanel({ thumbnail, chapters, currentTime, seek, captionsUrl, initialTab = 'chapters', onClose }: {
  thumbnail?: string | null;
  chapters: { t: number; title: string }[];
  currentTime: number;
  seek: (t: number) => void;
  captionsUrl?: string | null;
  initialTab?: 'chapters' | 'transcript';
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'chapters' | 'transcript'>(initialTab);
  const [cues, setCues] = useState<{ t: number; text: string }[] | null>(null);
  const [cuesLoading, setCuesLoading] = useState(() => initialTab === 'transcript' && !!captionsUrl);
  const activeRef = useRef<HTMLElement>(null);
  const lastActive = useRef<number | null>(null);

  const changeTab = (id: 'chapters' | 'transcript') => {
    setTab(id);
    if (id === 'transcript' && captionsUrl && cues === null) setCuesLoading(true);
  };

  useEffect(() => {
    if (tab !== 'transcript' || !captionsUrl || cues !== null) return;
    let alive = true;
    fetch(captionsUrl).then((r) => r.text()).then((txt) => {
      if (!alive) return;
      const out: { t: number; text: string }[] = [];
      for (const block of txt.replace(/\r/g, '').split(/\n{2,}/)) {
        const lines = block.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('WEBVTT') && !l.startsWith('NOTE'));
        if (!lines.length) continue;
        const m = lines[0].match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
        if (!m) continue;
        const t = (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
        const text = lines.slice(1).join(' ').replace(/<[^>]*>/g, '').trim();
        if (text) out.push({ t, text });
      }
      setCues(out);
      setCuesLoading(false);
    }).catch(() => { if (alive) { setCues([]); setCuesLoading(false); } });
    return () => { alive = false; };
  }, [tab, captionsUrl, cues]);

  const activeT = [...chapters].reverse().find((c) => c.t <= currentTime)?.t;
  const activeCue = cues ? [...cues].reverse().find((c) => c.t <= currentTime) : undefined;

  // Follow playback inside the panel list only — never scrolls the page.
  useEffect(() => {
    const key = tab === 'chapters' ? activeT : activeCue?.t;
    if (key === lastActive.current) return;
    lastActive.current = key ?? null;
    const el = activeRef.current;
    const box = el?.closest('.rec-panel-body');
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 2 + r.height / 2;
  });
  const setRowRef = (active: boolean) => (node: HTMLElement | null) => { if (active) activeRef.current = node; };

  return (
    <section className="rec-panel" aria-label="In this video">
      <div className="rec-panel-head">
        <h2>In this video</h2>
        <IconButton icon="close" label="Close" size={36} onClick={onClose} />
      </div>
      <div className="rec-panel-chips">
        <Chips items={[{ id: 'chapters', label: 'Chapters' }, { id: 'transcript', label: 'Transcript' }]} value={tab} onChange={(id) => changeTab(id)} />
      </div>
      <div className="rec-panel-body">
        {tab === 'chapters' ? chapters.map((c) => {
          const active = activeT === c.t;
          return (
            <button type="button" key={c.t} ref={setRowRef(active) as React.Ref<HTMLButtonElement>} className={`rec-ch-row ${active ? 'active' : ''}`} aria-current={active} onClick={() => seek(c.t)}>
              {thumbnail ? <img src={thumbnail} alt="" loading="lazy" draggable={false} /> : <span className="rec-ch-thumb" />}
              <b>{c.title}</b>
              <span className="rec-ch-time">{formatDuration(c.t)}</span>
            </button>
          );
        }) : cuesLoading ? <div className="center-pad"><Spinner /></div>
          : !captionsUrl ? <p className="rec-panel-note">Transcript isn’t available for this video.</p>
          : !cues?.length ? <p className="rec-panel-note">No transcript lines found.</p>
          : cues.map((c, i) => {
            const active = activeCue === c;
            return (
              <button type="button" key={`${c.t}-${i}`} ref={setRowRef(active) as React.Ref<HTMLButtonElement>} className={`rec-cue ${active ? 'active' : ''}`} aria-current={active} onClick={() => seek(c.t)}>
                <span className="link">{formatDuration(c.t)}</span><span>{c.text}</span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
