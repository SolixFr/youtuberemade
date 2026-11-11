import type { postAnalytics } from '@/lib/server/queries';
import { formatCount } from '@/lib/format';
import { Icon } from '@/components/ui';

/** Creator-only panel on the post page — reach, subscribers gained, and how the poll split. */
export function PostAnalyticsPanel({ a }: { a: NonNullable<ReturnType<typeof postAnalytics>> }) {
  const stats: [string, string, string][] = [
    [formatCount(a.views), 'Views', 'visibility'],
    [formatCount(a.subscribers), 'Subs gained', 'person_add'],
    [formatCount(a.likes), 'Likes', 'thumb_up'],
    [formatCount(a.comments), 'Comments', 'comment'],
  ];
  const winner = a.poll.reduce((w, o) => (o.votes > (w?.votes ?? -1) ? o : w), null as (typeof a.poll)[number] | null);
  return (
    <section className="post-analytics" aria-label="Post analytics">
      <h2 className="pa-title">Post analytics</h2>
      <div className="pa-stats">
        {stats.map(([value, label, icon]) => (
          <div key={label} className="pa-stat">
            <span className="pa-stat-icon"><Icon name={icon} size={18} /></span>
            <b className="pa-stat-value">{value}</b>
            <span className="pa-stat-label">{label}</span>
          </div>
        ))}
      </div>
      {a.poll.length > 1 && (
        <div className="pa-poll">
          <div className="pa-poll-head"><h3>Poll — {a.pollTotal.toLocaleString()} votes</h3>{winner && <span className="pa-winner">{winner.text} · {winner.pct}%</span>}</div>
          <div className="pa-split" role="img" aria-label={`Poll split: ${a.poll.map((o) => `${o.text} ${o.pct}%`).join(', ')}`}>
            {a.poll.map((o) => <span key={o.idx} className={`pa-seg ${o === winner ? 'win' : ''}`} style={{ width: `${o.pct}%` }} />)}
          </div>
          <ul className="pa-legend">
            {a.poll.map((o) => (
              <li key={o.idx}>
                <span className={`pa-dot ${o === winner ? 'win' : ''}`} aria-hidden="true" />
                <span className="pa-legend-text">{o.text}</span>
                <span className="pa-legend-nums"><b>{o.votes.toLocaleString()}</b> · {o.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
