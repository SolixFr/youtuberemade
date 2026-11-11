'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The thin loading bar at the very top of the page during navigations.
    The crawl itself is a CSS animation; JS only switches run/done/idle. */
export function TopLoader() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'run' | 'done'>('idle');
  const reset = useRef<number | null>(null);
  const expect = useRef<string | null>(null);
  const prevKey = useRef(pathname + (search.size ? `?${search}` : ''));

  const finish = useCallback(() => {
    setState('done');
    reset.current = window.setTimeout(() => setState('idle'), 250);
  }, []);

  const start = useCallback(() => {
    if (reset.current) { clearTimeout(reset.current); reset.current = null; }
    setState('run');
  }, []);

  // Start when an internal link is clicked or the browser navigates back/forward.
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || a.origin !== location.origin || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      expect.current = a.pathname + a.search;
      start();
    };
    const pop = () => start();
    document.addEventListener('click', click, true);
    window.addEventListener('popstate', pop);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('popstate', pop);
    };
  }, [start]);

  const key = pathname + (search.size ? `?${search}` : '');

  // Complete when the navigation lands on any route, or after a short cap
  // (same-page clicks never change the URL, so they need the timeout).
  useEffect(() => {
    if (state !== 'run') return;
    if (prevKey.current !== key) { prevKey.current = key; finish(); }
  }, [key, state, finish]);
  useEffect(() => {
    if (state !== 'run') return;
    const t = setTimeout(finish, 1500);
    return () => clearTimeout(t);
  }, [state, finish]);

  return (
    <div className={`top-loader ${state}`} aria-hidden="true">
      <i />
    </div>
  );
}
