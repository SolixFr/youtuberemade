'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Chips } from './ui';

/** Chips that store the selection in the URL (?param=), so the server renders the filtered list. */
export function RouteChips({ items, param = 'chip', fallback = 'all', className }: { items: { id: string; label: string }[]; param?: string; fallback?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const value = params.get(param) ?? fallback;
  return (
    <div className={`${className ?? ''} ${pending ? 'is-pending' : ''}`}>
      <Chips items={items} value={value} onChange={(id) => {
        const next = new URLSearchParams(params);
        if (id === fallback) next.delete(param); else next.set(param, id);
        const qs = next.toString();
        start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      }} />
    </div>
  );
}
