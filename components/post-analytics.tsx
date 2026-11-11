import type { postAnalytics } from '@/lib/server/queries';
import { formatCount } from '@/lib/format';

/** Creator-only panel on the post page — reach, subscribers gained, poll breakdown. */
export function PostAnalyticsPanel({ a }: { a: NonNullable<ReturnType<typeof postAnalytics>> }) {
  const stats: [string, string][] = [
    [formatCount(a.views), 'Views'],
    [formatCount(a.subscribers), 'Subscribers gained'],
    [formatCount(a.likes), 'Likes'],
    [formatCount(a.comments), 'Comments'],
  ];
  return (
    <section className="post-analytics" aria-label="Post analytics">
      <h2>Post analytics</h2>
      <div className="pa-stats">
        {stats.map(([value, label]) => (
          <div key={label} className="pa-stat"><b>{value}</b><span>{label}</span></div>
        ))}
      </div>
      {a.poll.length > 0 && (
        <div className="pa-poll">
          <h3>Poll results <span className="muted">· {a.pollTotal.toLocaleString()} votes</span></h3>
          {a.poll.map((o) => (
            <div key={o.idx} className="pa-option">
              <div className="pa-option-head"><span>{o.text}</span><b>{o.votes.toLocaleString()} · {o.pct}%</b></div>
              <div className="pa-bar"><div className="pa-fill" style={{ width: `${o.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
