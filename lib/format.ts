const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** 1234 -> "1.2K", 2_050_000 -> "2.1M" (the format used on view and subscriber counts). */
export function formatCount(n: number): string {
  return n < 1000 ? String(n) : compact.format(n);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const UNITS: [number, string][] = [
  [31_536_000, 'year'],
  [2_592_000, 'month'],
  [604_800, 'week'],
  [86_400, 'day'],
  [3_600, 'hour'],
  [60, 'minute'],
  [1, 'second'],
];

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, (now - ts) / 1000);
  for (const [size, unit] of UNITS) {
    const v = Math.floor(diff / size);
    if (v >= 1) return `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function plural(n: number, word: string): string {
  return `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;
}

/** Parses "0:00 Intro" style lines from a description into chapters (needs a 0:00 entry, like the real feature). */
export function parseChapters(description: string, duration: number): { t: number; title: string }[] {
  const found: { t: number; title: string }[] = [];
  for (const line of description.split('\n')) {
    const m = line.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\s+[-–—]?\s*(.+)$/);
    if (!m) continue;
    const t = (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
    if (t < duration) found.push({ t, title: m[4] });
  }
  if (!found.length || found[0].t !== 0 || found.length < 2) return [];
  return found.sort((a, b) => a.t - b.t);
}

export function uid(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}
