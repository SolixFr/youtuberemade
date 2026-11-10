'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ListCard, ShortsShelf } from '@/components/cards';
import { PostCard, SubscribeButton } from '@/components/social';
import { Avatar, Button, Chips, EmptyState } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { feedVideos, useDB, useNow } from '@/lib/store';
import type { Video } from '@/lib/types';

const FILTERS = {
  date: [['hour', 'Last hour', 3_600_000], ['today', 'Today', 86_400_000], ['week', 'This week', 604_800_000], ['month', 'This month', 2_592_000_000], ['year', 'This year', 31_536_000_000]] as const,
  type: [['video', 'Videos'], ['short', 'Shorts'], ['channel', 'Channels'], ['post', 'Posts']] as const,
  duration: [['short', 'Under 1 minute'], ['medium', '1–2 minutes'], ['long', 'Over 2 minutes']] as const,
  sort: [['relevance', 'Relevance'], ['date', 'Upload date'], ['views', 'View count']] as const,
};

export default function Results() {
  const params = useSearchParams();
  const router = useRouter();
  const d = useDB();
  const [panel, setPanel] = useState(false);
  const now = useNow();
  const q = params.get('search_query') ?? '';
  const type = params.get('type') ?? '';
  const date = params.get('date') ?? '';
  const duration = params.get('duration') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const terms = q.toLowerCase().replace(/^#/, '').split(/\s+/).filter(Boolean);

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (!v || p.get(k) === v) p.delete(k); else p.set(k, v);
    router.push(`/results?${p.toString()}`);
  };

  const scoreOf = (v: Video) => {
    const title = v.title.toLowerCase();
    const hay = `${title} ${v.description.toLowerCase()} ${d.channels[v.channelId]?.name.toLowerCase()} ${v.topic.toLowerCase()}`;
    return terms.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (hay.includes(t) ? 1 : 0), 0);
  };
  let videos = feedVideos(d, now).map((v) => ({ v, s: scoreOf(v) })).filter((x) => x.s > 0 && x.s >= terms.length);
  const age = FILTERS.date.find((f) => f[0] === date)?.[2];
  if (age) videos = videos.filter((x) => now - x.v.publishedAt < age);
  if (duration === 'short') videos = videos.filter((x) => x.v.duration < 60);
  if (duration === 'medium') videos = videos.filter((x) => x.v.duration >= 60 && x.v.duration <= 120);
  if (duration === 'long') videos = videos.filter((x) => x.v.duration > 120);
  videos.sort((a, b) => (sort === 'date' ? b.v.publishedAt - a.v.publishedAt : sort === 'views' ? b.v.views - a.v.views : b.s - a.s || b.v.views - a.v.views));
  const longs = videos.filter((x) => x.v.type === 'video').map((x) => x.v);
  const shorts = videos.filter((x) => x.v.type === 'short').map((x) => x.v);
  const channels = Object.values(d.channels).filter((c) => !c.isMine && terms.some((t) => `${c.name} ${c.handle}`.toLowerCase().includes(t)));
  const posts = d.posts.filter((p) => terms.every((t) => p.text.toLowerCase().includes(t)));
  const nothing = !longs.length && !shorts.length && !channels.length && !posts.length;

  return (
    <div className="page-pad" style={{ maxWidth: 1096 + 48 }}>
      <div className="sec-head" style={{ margin: '12px 0' }}>
        <Chips value={type || 'all'} onChange={(id) => setParam('type', id === 'all' ? '' : id)} items={[{ id: 'all', label: 'All' }, ...FILTERS.type.map(([id, label]) => ({ id, label }))]} />
        <Button variant="text" icon="tune" onClick={() => setPanel(true)}>Filters</Button>
      </div>
      {panel && (
        <div className="settings-card">
          <div className="sec-head" style={{ margin: '0 0 16px', padding: 0 }}><h2>Search filters</h2><Button variant="text" icon="close" aria-label="Close filters" onClick={() => setPanel(false)} /></div>
          <div className="filters">
            <div><h4>Upload date</h4>{FILTERS.date.map(([k, l]) => <button type="button" key={k} className={date === k ? 'on' : ''} onClick={() => setParam('date', k)}>{l}</button>)}</div>
            <div><h4>Type</h4>{FILTERS.type.map(([k, l]) => <button type="button" key={k} className={type === k ? 'on' : ''} onClick={() => setParam('type', k)}>{l}</button>)}</div>
            <div><h4>Duration</h4>{FILTERS.duration.map(([k, l]) => <button type="button" key={k} className={duration === k ? 'on' : ''} onClick={() => setParam('duration', k)}>{l}</button>)}</div>
            <div><h4>Sort by</h4>{FILTERS.sort.map(([k, l]) => <button type="button" key={k} className={sort === k ? 'on' : ''} onClick={() => setParam('sort', k === 'relevance' ? '' : k)}>{l}</button>)}</div>
          </div>
        </div>
      )}
      {(!type || type === 'channel') && channels.map((c) => (
        <div key={c.id} className="channel-row">
          <Link href={`/${c.handle}`} className="pic"><Avatar channel={c} size={136} /></Link>
          <div className="info"><h3><Link href={`/${c.handle}`}>{c.name}</Link></h3><div className="muted small">{c.handle} · {formatCount(c.subscribers)} subscribers</div><p>{c.description}</p></div>
          <SubscribeButton channelId={c.id} />
        </div>
      ))}
      {(!type || type === 'video') && longs.slice(0, type ? undefined : 2).map((v) => <ListCard key={v.id} v={v} />)}
      {!type && <ShortsShelf videos={shorts.slice(0, 4)} />}
      {type === 'short' && <div className="shorts-row">{shorts.map((v) => <ListCard key={v.id} v={v} small />)}</div>}
      {(!type || type === 'post') && posts.slice(0, type ? undefined : 1).map((p) => <PostCard key={p.id} p={p} />)}
      {!type && longs.slice(2).map((v) => <ListCard key={v.id} v={v} />)}
      {nothing && <EmptyState icon="search_off" title="No results found" text="Try different keywords or remove search filters" />}
    </div>
  );
}
