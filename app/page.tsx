'use client';

import { useState } from 'react';
import { ShortsShelf, VideoCard } from '@/components/cards';
import { StoriesRow } from '@/components/stories';
import { Chips, EmptyState, useIsMobile } from '@/components/ui';
import { feedVideos, useDB, useNow } from '@/lib/store';
import type { Video } from '@/lib/types';

type ChipId = string;

/** Recency-weighted views: newer videos with traction float up, same as a typical home feed. */
const score = (v: Video, now: number) => v.views / Math.pow((now - v.publishedAt) / 3_600_000 + 2, 0.6);

export default function Home() {
  const d = useDB();
  const mobile = useIsMobile();
  const [chip, setChip] = useState<ChipId>('all');
  const now = useNow();
  const all = feedVideos(d, now);
  const topics = [...new Set(all.filter((v) => v.type === 'video').map((v) => v.topic))];
  const chips = [
    { id: 'all', label: 'All' },
    ...topics.map((t) => ({ id: `topic:${t}`, label: t })),
    { id: 'recent', label: 'Recently uploaded' },
    { id: 'watched', label: 'Watched' },
    { id: 'new', label: 'New to you' },
  ];

  const videos = (() => {
    let list = all.filter((v) => v.type === 'video');
    if (chip.startsWith('topic:')) list = list.filter((v) => v.topic === chip.slice(6));
    if (chip === 'watched') list = list.filter((v) => d.user.history.some((h) => h.videoId === v.id));
    if (chip === 'new') list = list.filter((v) => !d.user.history.some((h) => h.videoId === v.id) && !d.user.subscriptions.includes(v.channelId));
    if (chip === 'recent') return list.sort((a, b) => b.publishedAt - a.publishedAt);
    return list.sort((a, b) => score(b, now) - score(a, now));
  })();
  const shorts = all.filter((v) => v.type === 'short').sort((a, b) => score(b, now) - score(a, now)).slice(0, mobile ? 4 : 6);
  const firstRows = mobile ? 2 : 6;

  return (
    <>
      <div className="feed-chips"><Chips items={chips} value={chip} onChange={setChip} /></div>
      <div className="feed">
        {mobile && chip === 'all' && <StoriesRow />}
        {videos.length === 0 ? (
          <EmptyState icon="video_library" title="Nothing here yet" text={chip === 'watched' ? 'Videos you watch will show up here.' : 'Try another filter.'} />
        ) : (
          <>
            <div className="grid">{videos.slice(0, firstRows).map((v) => <VideoCard key={v.id} v={v} />)}</div>
            {chip === 'all' && <ShortsShelf videos={shorts} />}
            {!mobile && chip === 'all' && <div className="shelf"><StoriesRow /></div>}
            {videos.length > firstRows && <div className="grid" style={{ paddingTop: 24 }}>{videos.slice(firstRows).map((v) => <VideoCard key={v.id} v={v} />)}</div>}
          </>
        )}
      </div>
    </>
  );
}
