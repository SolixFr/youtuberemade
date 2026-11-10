'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button, Chips, Dialog } from './ui';

const GROUPS = {
  date: { title: 'Upload date', options: [['hour', 'Last hour'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']] },
  type: { title: 'Type', options: [['video', 'Video'], ['short', 'Shorts'], ['channel', 'Channel'], ['post', 'Post']] },
  duration: { title: 'Duration', options: [['short', 'Under 1 minute'], ['medium', '1–2 minutes'], ['long', 'Over 2 minutes']] },
  sort: { title: 'Sort by', options: [['', 'Relevance'], ['date', 'Upload date'], ['views', 'View count']] },
} as const;

export function SearchFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (!v || p.get(k) === v) p.delete(k); else p.set(k, v);
    router.push(`${pathname}?${p.toString()}`);
  };
  const active = (['date', 'duration', 'sort'] as const).filter((k) => params.get(k)).length;
  return (
    <div className="results-bar">
      <Chips value={params.get('type') ?? 'all'} onChange={(id) => set('type', id === 'all' ? '' : id)}
        items={[{ id: 'all', label: 'All' }, { id: 'video', label: 'Videos' }, { id: 'short', label: 'Shorts' }, { id: 'channel', label: 'Channels' }, { id: 'post', label: 'Posts' }]} />
      <Button variant="text" icon="tune" onClick={() => setOpen(true)}>Filters{active ? ` (${active})` : ''}</Button>
      {open && (
        <Dialog title="Search filters" onClose={() => setOpen(false)} width={760}>
          <div className="filters">
            {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((k) => (
              <div key={k}>
                <h4>{GROUPS[k].title}</h4>
                {GROUPS[k].options.map(([v, label]) => (
                  <button type="button" key={v} className={(params.get(k) ?? '') === v ? 'on' : ''} onClick={() => set(k, v)}>{label}</button>
                ))}
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
