'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

export interface StudioAnalyticsData {
  days: number;
  viewsNow: number; hoursNow: number; subsNow: number; earnings: number; partner: boolean;
  vTyp: { lo: number; hi: number; delta: number };
  hTyp: { lo: number; hi: number; delta: number };
  sTyp: { lo: number; hi: number; delta: number };
  trendViews: number[]; trendHours: number[];
  markers: { at: number; n: number; shortOnly: boolean }[];
  top: { id: string; title: string; thumbnail: string; publishedAt: number; views: number; avgSec: number; pct: number }[];
  rtBars: number[]; views48: number; mySubs: number;
  rtTop: { id: string; title: string; thumbnail: string; views: number }[];
  snapshots: { id: string; title: string; thumbnail: string; publishedAt: number; likes: number; views: number; avgPct: number; ageMs: number }[];
  since: number;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtViews = (n: number) => n >= 100_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString('en-US');
const fmtHours = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const fmtTime = (s: number) => { const d = Math.floor(s / 60), r = Math.floor(s % 60); return `${d}:${String(r).padStart(2, '0')}`; };
const DAY = 86_400_000;
const daysUnit = (ms: number) => { const d = Math.floor(ms / DAY); const h = Math.floor((ms % DAY) / 3_600_000); return d > 0 ? `First ${d} days${h ? ` ${h} hours` : ''}` : h > 0 ? `First ${h} hours` : 'Just published'; };

function MetricBlock({ data, tab }: { data: StudioAnalyticsData; tab: 'views' | 'hours' | 'subs' | 'revenue' }) {
  if (tab === 'views') return <MetricRow total={fmtViews(data.viewsNow)} delta={data.vTyp.delta} deltaText={`${fmtViews(Math.abs(data.vTyp.delta))} ${data.vTyp.delta >= 0 ? 'more' : 'less'} than usual`} lo={fmtInt(data.vTyp.lo)} hi={fmtInt(data.vTyp.hi)} />;
  if (tab === 'hours') return <MetricRow total={fmtHours(data.hoursNow)} delta={data.hTyp.delta} deltaText={`${fmtHours(Math.abs(data.hTyp.delta))} hours ${data.hTyp.delta >= 0 ? 'more' : 'less'} than usual`} lo={fmtHours(data.hTyp.lo)} hi={fmtHours(data.hTyp.hi)} />;
  if (tab === 'subs') return <MetricRow total={`+${data.subsNow.toLocaleString('en-US')}`} delta={data.sTyp.delta} deltaText={`${Math.abs(data.sTyp.delta)} ${data.sTyp.delta >= 0 ? 'more' : 'less'} than usual`} lo={String(data.sTyp.lo)} hi={String(data.sTyp.hi)} />;
  return <div className="am-metric-block"><div className="am-metric-row"><span className="am-metric-total">{data.partner ? `$${(data.earnings / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span></div><div className="am-metric-sub">{data.partner ? 'Lifetime estimated earnings' : 'Reach 1,000 subs and 250 watch hours to unlock earnings'}</div></div>;
}

function MetricRow({ total, delta, deltaText, lo, hi }: { total: string; delta: number; deltaText: string; lo: string; hi: string }) {
  const up = delta >= 0;
  return (
    <div className="am-metric-block">
      <div className="am-metric-row"><span className="am-metric-total">{total}</span><span className={`am-trend ${up ? 'up' : 'down'}`} aria-hidden="true">{up ? '↑' : '↓'}</span></div>
      <div className="am-metric-sub">{deltaText} <span className="am-typical">Typical: {lo}–{hi}</span></div>
    </div>
  );
}

/** The whole Channel analytics screen — mirrors YouTube Studio's overview. */
export function AnalyticsView({ data }: { data: StudioAnalyticsData }) {
  const [metricTab, setMetricTab] = useState<'views' | 'hours' | 'subs' | 'revenue'>('views');
  const [snapIndex, setSnapIndex] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const W = 800, H = 190;
  const maxViews = Math.max(1, ...data.trendViews), maxHours = Math.max(1, ...data.trendHours);
  const chartLine = (vals: number[], max: number) => `M${vals.map((y, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 14 - (y / max) * (H - 36)).toFixed(1)}`).join(' L')}`;
  const activeLine = metricTab === 'hours' ? chartLine(data.trendHours, maxHours) : chartLine(data.trendViews, maxViews);
  const snap = data.snapshots[snapIndex];

  return (
    <>
      <p className="am-hero">Your channel got {fmtViews(data.viewsNow)} views in the last {data.days} days</p>

      <div className="am-layout">
        <div className="am-col">
          <section className="am-card am-key-card" aria-label="Key metric">
            <div className="am-key-tabs" role="tablist">
              {([['views', 'Views'], ['hours', 'Watch time (hours)'], ['subs', 'Subscribers'], ['revenue', 'Estimated revenue']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={metricTab === id} className={`am-key-tab ${metricTab === id ? 'on' : ''}`} onClick={() => setMetricTab(id)}>{label}</button>
              ))}
            </div>
            <div className="am-key-body"><MetricBlock data={data} tab={metricTab} /></div>
            {data.trendViews.some((v) => v > 0) || data.trendHours.some((v) => v > 0) ? (
              <>
                <svg className="am-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={metricTab === 'hours' ? 'Watch time (hours) per day' : 'Views per day'}>
                  {[0.25, 0.5, 0.75].map((f) => <line key={f} className="grid-line" x1="0" x2={W} y1={14 + (1 - f) * (H - 28)} y2={14 + (1 - f) * (H - 28)} />)}
                  <path className="area" d={`${activeLine} L${W},${H - 14} L0,${H - 14} Z`} />
                  <path className="line" d={activeLine} />
                </svg>
                <div className="am-chart-x axis-fade"><span>{new Date(data.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><span>{new Date(data.since + ((data.days / 2) * DAY)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span><span>Today</span></div>
                {data.markers.length > 0 && (
                  <div className="am-markers" aria-label="Uploads">{data.markers.map((mk, i) => {
                    const left = `${((mk.at - data.since) / ((data.days - 1) * DAY)) * 100}%`;
                    return <span key={i} className={`am-marker ${mk.n > 1 ? 'multi' : ''} ${mk.shortOnly ? 'short' : ''}`} style={{ left }} title={`${mk.n} upload${mk.n > 1 ? 's' : ''} — ${new Date(mk.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}>{mk.n > 1 ? mk.n : mk.shortOnly ? <Icon name="smart_display" size={14} /> : <Icon name="play_arrow" size={14} />}</span>;
                  })}</div>
                )}
              </>
            ) : <p className="muted" style={{ padding: '24px 0' }}>No data yet — analytics will populate once your videos start getting watched.</p>}
          </section>

          <section className="am-card">
            <div className="am-card-head"><h2>Your top content in this period</h2></div>
            {data.top.length ? (
              <div className="am-table" role="table">
                <div className="am-row am-head-row" role="row"><span>#</span><span>Content</span><span>Average view duration</span><span>Views</span></div>
                {data.top.map(({ id, title, thumbnail, publishedAt, views, avgSec, pct }, i) => (
                  <Link key={id} role="row" href={`/studio/video/${id}`} className="am-row">
                    <span className="am-rank">{i + 1}</span>
                    <span className="am-content">
                      <span className="am-thumb"><img src={thumbnail} alt="" loading="lazy" decoding="async" /></span>
                      <span className="am-title-wrap"><span className="am-title">{title}</span><span className="am-date">{new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                    </span>
                    <span className="am-num">{views ? fmtTime(avgSec / views) : '—'}<span className="am-pct">{views && pct ? `(${pct}%)` : ''}</span></span>
                    <span className="am-num">{fmtInt(views)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted" style={{ padding: '20px 0' }}>Your top content will rank here once your videos start getting plays.</p>}
          </section>
        </div>

        <div className="am-side">
          <section className="am-card am-rt" aria-label="Realtime">
            <div className="am-rt-head"><h2>Realtime</h2><span className="am-live-badge"><span className="am-live-dot" aria-hidden="true"><span /></span>Updating live</span></div>
            <div className="am-rt-metric"><b>{fmtInt(data.mySubs)}</b><span>Subscribers</span></div>
            <Link href="/studio/subcount" className="btn btn-tonal btn-sm">See live count</Link>
            <hr className="am-hr" />
            <div className="am-rt-metric"><b>{fmtInt(data.views48)}</b><span>Views · Last 48 hours</span></div>
            <div className="am-rt-bars" role="img" aria-label="Views per hour, last 48 hours">
              {data.rtBars.map((n, i) => <div key={i} className="am-rt-bar" style={{ height: `${Math.max(4, (n / Math.max(1, ...data.rtBars)) * 100)}%` }} title={`${n.toLocaleString('en-US')} views`} />)}
            </div>
            <div className="am-rt-table-head"><span>Top content</span><span>Views</span></div>
            {data.rtTop.length ? data.rtTop.map(({ id, title, thumbnail, views }) => (
              <Link key={id} href={`/studio/video/${id}`} className="am-rt-row">
                <span className="am-rt-thumb"><img src={thumbnail} alt="" loading="lazy" decoding="async" /></span>
                <span className="am-rt-title">{title}</span>
                <span className="am-rt-views">{views.toLocaleString('en-US')}</span>
              </Link>
            )) : <p className="muted small" style={{ padding: '12px 0' }}>No views recorded in the last 48 hours yet.</p>}
          </section>

          {snap && (
            <section className="am-card am-snapshot" aria-label="Latest content">
              <div className="am-card-head"><h2>Latest content</h2>
                <div className="am-snap-nav">
                  <button type="button" className="icon-btn" aria-label="Previous item" disabled={snapIndex === 0} onClick={() => setSnapIndex((i) => Math.max(0, i - 1))}><Icon name="chevron_left" size={20} /></button>
                  <span className="am-snap-count">{snapIndex + 1} of {data.snapshots.length}</span>
                  <button type="button" className="icon-btn" aria-label="Next item" disabled={snapIndex === data.snapshots.length - 1} onClick={() => setSnapIndex((i) => Math.min(data.snapshots.length - 1, i + 1))}><Icon name="chevron_right" size={20} /></button>
                </div>
              </div>
              <Link href={`/studio/video/${snap.id}`} className="am-snap-thumb"><img src={snap.thumbnail} alt="" loading="lazy" decoding="async" /></Link>
              <Link href={`/studio/video/${snap.id}`} className="am-snap-title">{snap.title}</Link>
              <p className="am-snap-window">{daysUnit(snap.ageMs)}</p>
              <div className="am-snap-metrics">
                <div className="am-snap-row"><span>Views</span><b>{snap.views.toLocaleString('en-US')}</b></div>
                <div className="am-snap-row"><span>Average percentage viewed</span><b>{snap.avgPct.toFixed(1)}%</b></div>
                <div className="am-snap-row"><span>Likes</span><b>{snap.likes.toLocaleString('en-US')}</b></div>
              </div>
              <Link href={`/studio/video/${snap.id}`} className="btn btn-tonal btn-md">See video analytics</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
