import { timeAgo } from '@/lib/format';

/** Relative time ("3 hours ago"). The server and the browser can disagree by a few seconds, so hydration tolerates the difference. */
export function Ago({ ts }: { ts: number }) {
  return <time dateTime={new Date(ts).toISOString()} suppressHydrationWarning>{timeAgo(ts)}</time>;
}
