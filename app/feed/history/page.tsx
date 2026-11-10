'use client';

import { useState } from 'react';
import { ListCard } from '@/components/cards';
import { Button, Chips, ConfirmDialog, EmptyState, Icon, useToast } from '@/components/ui';
import { update, useDB, videoOf } from '@/lib/store';
import type { Video } from '@/lib/types';

function dayLabel(ts: number) {
  const day = new Date(ts).toDateString();
  if (day === new Date().toDateString()) return 'Today';
  if (day === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function HistoryPage() {
  const d = useDB();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [confirm, setConfirm] = useState(false);
  const term = q.trim().toLowerCase();
  const groups = new Map<string, Video[]>();
  for (const h of d.user.history) {
    const v = videoOf(d, h.videoId);
    if (!v) continue;
    if (kind === 'videos' && v.type !== 'video') continue;
    if (kind === 'shorts' && v.type !== 'short') continue;
    if (term && !`${v.title} ${d.channels[v.channelId]?.name}`.toLowerCase().includes(term)) continue;
    const k = dayLabel(h.at);
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const remove = (id: string) => update((db) => { db.user.history = db.user.history.filter((h) => h.videoId !== id); delete db.user.progress[id]; });

  return (
    <div className="page-pad">
      <div className="two-col">
        <div className="main">
          <h1 className="page-title" style={{ marginTop: 0 }}>Watch history</h1>
          <div className="pad-m"><Chips value={kind} onChange={setKind} items={[{ id: 'all', label: 'All' }, { id: 'videos', label: 'Videos' }, { id: 'shorts', label: 'Shorts' }]} /></div>
          {groups.size === 0 ? (
            <EmptyState icon="history" title={d.user.historyPaused ? 'Watch history is off' : term ? 'No matches in your history' : 'This list has no videos'}
              text={d.user.historyPaused ? 'Videos you watch won’t be saved while history is paused.' : undefined} />
          ) : [...groups.entries()].map(([day, vids]) => (
            <section key={day}>
              <h2 className="day-title pad-m">{day}</h2>
              {vids.map((v) => <ListCard key={v.id} v={v} extraMenu={[{ icon: 'delete', label: 'Remove from watch history', onSelect: () => remove(v.id) }]} />)}
            </section>
          ))}
        </div>
        <aside className="side">
          <div className="history-side">
            <div className="history-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search watch history" aria-label="Search watch history" /></div>
            <Button variant="text" icon="delete" onClick={() => setConfirm(true)}>Clear all watch history</Button>
            <Button variant="text" icon={d.user.historyPaused ? 'play_circle' : 'pause_circle'}
              onClick={() => { update((db) => { db.user.historyPaused = !db.user.historyPaused; }); toast(d.user.historyPaused ? 'Watch history turned on' : 'Watch history paused'); }}>
              {d.user.historyPaused ? 'Turn on watch history' : 'Pause watch history'}
            </Button>
          </div>
        </aside>
      </div>
      {confirm && <ConfirmDialog title="Clear watch history?" text="Your watch history and resume positions will be cleared from this browser." confirm="Clear watch history"
        onClose={() => setConfirm(false)} onConfirm={() => { update((db) => { db.user.history = []; db.user.progress = {}; }); toast('Watch history cleared'); }} />}
    </div>
  );
}
