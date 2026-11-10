'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ListCard } from '@/components/cards';
import { Button, Chips, ConfirmDialog, EmptyState, Icon, useToast } from '@/components/ui';
import { updateSettings } from '@/lib/actions/channels';
import { clearHistory, removeFromHistory } from '@/lib/actions/videos';
import type { Video } from '@/lib/types';

function dayLabel(ts: number) {
  const day = new Date(ts).toDateString();
  if (day === new Date().toDateString()) return 'Today';
  if (day === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function HistoryView({ entries: initial, paused: initialPaused }: { entries: { video: Video; at: number }[]; paused: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState(initial);
  const [paused, setPaused] = useState(initialPaused);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [confirm, setConfirm] = useState(false);
  const term = q.trim().toLowerCase();
  const groups = new Map<string, Video[]>();
  for (const { video: v, at } of entries) {
    if (kind !== 'all' && v.type !== kind) continue;
    if (term && !`${v.title} ${v.channel.name}`.toLowerCase().includes(term)) continue;
    const k = dayLabel(at);
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const remove = async (id: string) => {
    setEntries((e) => e.filter((x) => x.video.id !== id));
    await removeFromHistory(id);
  };

  return (
    <div className="two-col">
      <div className="main">
        <h1 className="page-title">Watch history</h1>
        <Chips value={kind} onChange={setKind} items={[{ id: 'all', label: 'All' }, { id: 'video', label: 'Videos' }, { id: 'short', label: 'Shorts' }]} />
        {groups.size === 0 ? (
          <EmptyState icon="history" title={paused ? 'Watch history is off' : term ? 'No matches in your history' : 'This list has no videos'}
            text={paused ? 'Videos you watch aren’t saved while history is paused.' : undefined} />
        ) : [...groups.entries()].map(([day, vids]) => (
          <section key={day}>
            <h2 className="day-title">{day}</h2>
            {vids.map((v) => <ListCard key={v.id} v={v} extraMenu={[{ icon: 'delete', label: 'Remove from watch history', onSelect: () => remove(v.id) }]} />)}
          </section>
        ))}
      </div>
      <aside className="side">
        <div className="history-side">
          <div className="history-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search watch history" aria-label="Search watch history" /></div>
          <Button variant="text" icon="delete" onClick={() => setConfirm(true)}>Clear all watch history</Button>
          <Button variant="text" icon={paused ? 'play_circle' : 'pause_circle'} onClick={async () => {
            const next = !paused;
            setPaused(next);
            await updateSettings({ historyPaused: next });
            toast(next ? 'Watch history paused' : 'Watch history turned on');
            router.refresh();
          }}>{paused ? 'Turn on watch history' : 'Pause watch history'}</Button>
        </div>
      </aside>
      {confirm && <ConfirmDialog title="Clear watch history?" text="Your watch history and resume positions will be cleared." confirm="Clear watch history"
        onClose={() => setConfirm(false)} onConfirm={async () => { await clearHistory(); setEntries([]); toast('Watch history cleared'); }} />}
    </div>
  );
}
