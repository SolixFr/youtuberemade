// Truncated, not rounded (like YouTube), so 1,050 never shows as "1.1K".
const trim0 = (s: string) => s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/** 1234 -> "1.23K", 20_500_000 -> "20.5M" (the format used on view and subscriber counts). */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const units: [number, string][] = [[1_000_000_000, 'B'], [1_000_000, 'M'], [1_000, 'K']];
  for (const [size, suffix] of units) {
    const v = n / size;
    if (v < 1) continue;
    if (v >= 100) return `${Math.floor(v)}${suffix}`;
    if (v >= 10) return `${trim0((Math.floor(v * 10 + 1e-6) / 10).toFixed(1))}${suffix}`;
    return `${trim0((Math.floor(v * 100 + 1e-6) / 100).toFixed(2))}${suffix}`;
  }
  return String(n);
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


/** Link to a video: Shorts open in the vertical player, everything else on the watch page. */
export const watchHref = (v: { id: string; type: 'video' | 'short' }, extra = '') => (v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}${extra}`);
/** Server-side timestamp for render-time use (plain helper, not a component). */
export const nowMs = () => Date.now();
