'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SubscribeButton } from '@/components/social';
import { Avatar, Chips, EmptyState } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { useDB } from '@/lib/store';

export default function AllSubscriptions() {
  const d = useDB();
  const [sort, setSort] = useState('relevant');
  let list = d.user.subscriptions.map((id) => d.channels[id]).filter(Boolean);
  if (sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'new') {
    const latest = (id: string) => Math.max(0, ...d.videos.filter((v) => v.channelId === id).map((v) => v.publishedAt));
    list = [...list].sort((a, b) => latest(b.id) - latest(a.id));
  }
  return (
    <div className="page-pad">
      <h1 className="page-title">All subscriptions</h1>
      <div className="pad-m"><Chips value={sort} onChange={setSort} items={[{ id: 'relevant', label: 'Most relevant' }, { id: 'new', label: 'New activity' }, { id: 'az', label: 'A–Z' }]} /></div>
      {list.length === 0 && <EmptyState icon="subscriptions" title="You haven’t subscribed to any channels" />}
      {list.map((c) => (
        <div key={c.id} className="channel-row">
          <Link href={`/${c.handle}`} className="pic"><Avatar channel={c} size={136} /></Link>
          <div className="info">
            <h3><Link href={`/${c.handle}`}>{c.name}</Link></h3>
            <div className="muted small">{c.handle} · {formatCount(c.subscribers)} subscribers</div>
            <p>{c.description}</p>
          </div>
          <SubscribeButton channelId={c.id} />
        </div>
      ))}
    </div>
  );
}
