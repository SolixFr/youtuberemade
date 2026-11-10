'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { badgeCounts, dismissNotification, loadNotifications, markNotificationsRead, removeSearch, saveSearch, searchSuggestions } from '@/lib/actions/account';
import { setTheme, signOut } from '@/lib/actions/auth';
import { setBell } from '@/lib/actions/channels';
import type { ChannelLite, Notification, Theme } from '@/lib/types';
import { Ago } from './ago';
import { useApp } from './app-context';
import { Avatar, Dialog, Icon, IconButton, Menu, ShortsIcon, Spinner, useIsMobile, type MenuItem } from './ui';

export interface GuideChannel extends ChannelLite { hasNew: boolean }

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Vidora home">
      <svg viewBox="0 0 30 24" width="30" height="24" aria-hidden="true">
        <path d="M5 3.6c0-1.9 2-3.1 3.7-2.2l16.9 9.2c1.8 1 1.8 3.6 0 4.6L8.7 24.4C7 25.3 5 24.1 5 22.2z" transform="translate(0 -1.2)" fill="#f2315c" />
        <path d="M11.4 8.2v8.6l7.5-4.3z" transform="translate(0 -1.2)" fill="#fff" />
      </svg>
      <span className="logo-word">Vidora</span>
    </Link>
  );
}

/* ---------------- Search ---------------- */
type SpeechCtor = new () => { lang: string; interimResults: boolean; start: () => void; abort: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void };

function SearchBox({ initial, onDone, autoFocus }: { initial: string; onDone?: () => void; autoFocus?: boolean }) {
  const router = useRouter();
  const { me } = useApp();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const [items, setItems] = useState<string[]>([]);
  const [history, setHistory] = useState<Set<string>>(new Set());
  const [voice, setVoice] = useState<'off' | 'listening' | 'unsupported'>('off');
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // Debounced suggestions from the server; stale responses are ignored.
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchSuggestions(q);
      if (n !== seq.current || !res.ok) return;
      setItems(res.data);
      if (!q) setHistory(new Set(res.data));
    }, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setOpen(false);
    input.current?.blur();
    onDone?.();
    if (me) void saveSearch(t);
    router.push(`/results?search_query=${encodeURIComponent(t)}`);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(hl >= 0 ? items[hl] : q);
  };
  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return setVoice('unsupported');
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join('');
      setQ(text);
      if (e.results[e.results.length - 1].isFinal) { setVoice('off'); go(text); }
    };
    rec.onend = () => setVoice('off');
    rec.onerror = () => setVoice('off');
    setVoice('listening');
    rec.start();
  };

  return (
    <div className="search">
      <form className="search-form" role="search" onSubmit={submit}>
        <div className="search-box">
          <Icon name="search" size={20} className="search-lead" />
          <input ref={input} value={q} autoFocus={autoFocus} placeholder="Search" aria-label="Search" autoComplete="off" spellCheck={false} enterKeyHint="search"
            onChange={(e) => { setQ(e.target.value); setHl(-1); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(items.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(-1, h - 1)); }
              if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
            }} />
          {q && <IconButton icon="close" label="Clear search query" size={36} onClick={() => { setQ(''); input.current?.focus(); }} />}
        </div>
        <button className="search-btn" type="submit" aria-label="Search" data-tooltip="Search"><Icon name="search" /></button>
        {open && items.length > 0 && (
          <ul className="suggest" role="listbox">
            {items.map((s, i) => (
              <li key={s} role="option" aria-selected={i === hl} className={i === hl ? 'hl' : ''} onMouseDown={(e) => { e.preventDefault(); go(s); }}>
                <Icon name={history.has(s) ? 'history' : 'search'} size={20} />
                <span className="grow">{s}</span>
                {history.has(s) && me && (
                  <button type="button" className="suggest-remove" onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setItems((x) => x.filter((y) => y !== s));
                    void removeSearch(s);
                  }}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </form>
      <IconButton icon="mic" filled label="Search with your voice" className="mic-btn" onClick={listen} />
      {voice !== 'off' && (
        <Dialog title="" onClose={() => setVoice('off')} width={480}>
          <div className="voice">
            {voice === 'listening' && <span className="voice-dot"><Icon name="mic" filled size={36} /></span>}
            <p>{voice === 'listening' ? 'Listening…' : 'Voice search isn’t supported in this browser.'}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ---------------- Menus ---------------- */
function CreateMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const app = useApp();
  const router = useRouter();
  const eligible = (app.me?.subscribers ?? 0) >= 10_000;
  const need = (fn: () => void) => () => app.requireAuth('Sign in to create content', fn);
  return (
    <Menu anchor={anchor} onClose={onClose} header={<div className="menu-title mobile-only">Create</div>} items={[
      { icon: 'upload', label: 'Upload video', onSelect: need(() => app.open({ kind: 'upload' })) },
      { icon: <ShortsIcon />, label: 'Create Short', onSelect: need(() => app.open({ kind: 'upload', short: true })) },
      { icon: 'sensors', label: 'Go live', onSelect: need(() => router.push('/studio/live')) },
      { icon: 'edit_note', label: 'Create post', onSelect: need(() => app.open({ kind: 'post' })) },
      { icon: 'add_circle', label: 'Create story', trailing: eligible ? undefined : <Icon name="lock" size={18} />, onSelect: need(() => app.open({ kind: 'story' })) },
    ]} />
  );
}

function NotificationsMenu({ anchor, onClose, onRead }: { anchor: HTMLElement; onClose: () => void; onRead: () => void }) {
  const app = useApp();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; n: Notification } | null>(null);
  useEffect(() => {
    let alive = true;
    loadNotifications().then((r) => {
      if (!alive || !r.ok) return;
      setItems(r.data);
      const unread = r.data.filter((n) => !n.read).map((n) => n.key);
      if (unread.length) markNotificationsRead(unread).then(onRead);
    });
    return () => { alive = false; };
  }, [onRead]);
  return (
    <Menu anchor={anchor} onClose={onClose} className="notif-menu" header={
      <div className="notif-head"><span>Notifications</span><Link href="/account#notifications" onClick={onClose} className="icon-btn" aria-label="Notification settings" data-tooltip="Settings"><Icon name="settings" /></Link></div>
    }>
      {(close) => (
        <>
          {items === null && <div className="center-pad"><Spinner /></div>}
          {items?.length === 0 && <div className="notif-empty"><Icon name="notifications" size={96} /><h3>Your notifications live here</h3><p className="muted">Subscribe to your favorite channels to hear about their latest videos.</p></div>}
          {items?.map((n) => (
            <div key={n.key} className={`notif ${n.read ? '' : 'unread'}`} role="menuitem" tabIndex={0}
              onClick={() => { close(); if (n.href.startsWith('story:')) app.openStory(n.channel.id); else router.push(n.href); }}>
              <Avatar channel={n.channel} size={48} />
              <div className="notif-text">{n.text}<small><Ago ts={n.at} /></small></div>
              {n.thumbnail && <img src={n.thumbnail} alt="" className="notif-thumb" loading="lazy" />}
              <IconButton icon="more_vert" label="Action menu" onClick={(e) => { e.stopPropagation(); setMenuFor({ el: e.currentTarget, n }); }} />
            </div>
          ))}
          {menuFor && <Menu anchor={menuFor.el} onClose={() => setMenuFor(null)} sheet={false} items={[
            { icon: 'visibility_off', label: 'Hide this notification', onSelect: () => { setItems((x) => x?.filter((y) => y.key !== menuFor.n.key) ?? null); void dismissNotification(menuFor.n.key); } },
            { icon: 'notifications_off', label: `Turn off all from ${menuFor.n.channel.name}`, onSelect: () => { setItems((x) => x?.filter((y) => y.channel.id !== menuFor.n.channel.id) ?? null); void setBell(menuFor.n.channel.id, 'none'); } },
          ]} />}
        </>
      )}
    </Menu>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Use device theme' },
  { id: 'dark', label: 'Dark theme' },
  { id: 'light', label: 'Light theme' },
];

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  void setTheme(theme);
}

function AccountMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const app = useApp();
  const router = useRouter();
  const [view, setView] = useState<'main' | 'theme'>('main');
  const [theme, setThemeState] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? 'dark');
  const me = app.me!;
  if (view === 'theme') {
    return (
      <Menu anchor={anchor} onClose={onClose} header={<div className="menu-back"><IconButton icon="arrow_back" label="Back" onClick={() => setView('main')} /><span>Appearance</span></div>}
        items={THEMES.map((t) => ({ icon: '', label: t.label, checked: t.id === theme, keepOpen: true, onSelect: () => { setThemeState(t.id); applyTheme(t.id); } }))} />
    );
  }
  const items: MenuItem[] = [
    { icon: 'account_box', label: 'Your channel', href: `/${me.handle}` },
    { icon: 'video_settings', label: 'Vidora Studio', href: '/studio' },
    { icon: 'chat', label: 'Messages', href: '/messages' },
    { icon: 'logout', label: 'Sign out', onSelect: async () => { await signOut(); router.push('/'); router.refresh(); } },
    { divider: true, label: '' },
    { icon: theme === 'light' ? 'light_mode' : 'dark_mode', label: `Appearance: ${THEMES.find((t) => t.id === theme)!.label.replace(' theme', '')}`, trailing: <Icon name="chevron_right" />, keepOpen: true, onSelect: () => setView('theme') },
    { icon: 'keyboard', label: 'Keyboard shortcuts', onSelect: () => app.open({ kind: 'shortcuts' }) },
    { divider: true, label: '' },
    { icon: 'settings', label: 'Settings', href: '/account' },
    { icon: 'info', label: 'About & credits', href: '/about' },
  ];
  return (
    <Menu anchor={anchor} onClose={onClose} className="account-menu" items={items} header={
      <div className="account-head">
        <Avatar channel={me} size={40} />
        <div><div className="account-name">{me.name}</div><div>{me.handle}</div><Link href={`/${me.handle}`} onClick={onClose} className="link">View your channel</Link></div>
      </div>
    } />
  );
}

/* ---------------- Badges (polled while the tab is visible) ---------------- */
function useBadges(initial: { notifications: number; messages: number }, signedIn: boolean) {
  const [counts, setCounts] = useState(initial);
  const pathname = usePathname();
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      badgeCounts().then((r) => alive && r.ok && setCounts(r.data));
    };
    tick();
    const t = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [signedIn, pathname]);
  return [counts, setCounts] as const;
}

/* ---------------- Masthead ---------------- */
export function Masthead({ badges: initialBadges }: { badges: { notifications: number; messages: number } }) {
  const app = useApp();
  const pathname = usePathname();
  const params = useSearchParams();
  const [menu, setMenu] = useState<{ kind: 'create' | 'notif' | 'account'; el: HTMLElement } | null>(null);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [badges, setBadges] = useBadges(initialBadges, !!app.me);
  const query = pathname === '/results' ? params.get('search_query') ?? '' : '';
  const close = () => setMenu(null);
  const badge = (n: number) => (n > 0 ? <span className="badge">{n > 9 ? '9+' : n}</span> : null);

  if (mobileSearch) {
    return (
      <header className="masthead msearch">
        <IconButton icon="arrow_back" label="Back" onClick={() => setMobileSearch(false)} />
        <SearchBox initial={query} autoFocus onDone={() => setMobileSearch(false)} />
      </header>
    );
  }
  return (
    <header className="masthead">
      <div className="mh-start">
        <IconButton icon="menu" label="Guide" className="guide-btn" onClick={() => app.setDrawer(!app.drawer)} />
        <Logo />
      </div>
      <div className="mh-center"><SearchBox key={query} initial={query} /></div>
      <div className="mh-end">
        <IconButton icon="search" label="Search" className="mobile-only" onClick={() => setMobileSearch(true)} />
        <button type="button" className="btn btn-tonal btn-md create-btn desktop-only" onClick={(e) => setMenu({ kind: 'create', el: e.currentTarget })}>
          <Icon name="add" /><span className="btn-label">Create</span>
        </button>
        {app.me ? (
          <>
            <Link href="/messages" className="icon-btn badge-btn" aria-label="Messages" data-tooltip="Messages"><Icon name="chat" />{badge(badges.messages)}</Link>
            <button type="button" className="icon-btn badge-btn" aria-label="Notifications" data-tooltip="Notifications" onClick={(e) => setMenu({ kind: 'notif', el: e.currentTarget })}>
              <Icon name="notifications" />{badge(badges.notifications)}
            </button>
            <button type="button" className="avatar-btn desktop-only" aria-label="Account menu" onClick={(e) => setMenu({ kind: 'account', el: e.currentTarget })}>
              <Avatar channel={app.me} size={32} />
            </button>
          </>
        ) : (
          <Link href={`/signin?next=${encodeURIComponent(pathname)}`} className="btn btn-outline btn-md sign-in-btn"><Icon name="account_circle" />Sign in</Link>
        )}
      </div>
      {menu?.kind === 'create' && <CreateMenu anchor={menu.el} onClose={close} />}
      {menu?.kind === 'notif' && <NotificationsMenu anchor={menu.el} onClose={close} onRead={() => setBadges((b) => ({ ...b, notifications: 0 }))} />}
      {menu?.kind === 'account' && <AccountMenu anchor={menu.el} onClose={close} />}
    </header>
  );
}

/* ---------------- Guide ---------------- */
export type GuideMode = 'full' | 'mini' | 'drawer' | 'none';

function GuideLink({ href, icon, label, active, trailing, mini }: { href: string; icon: ReactNode; label: string; active?: boolean; trailing?: ReactNode; mini?: boolean }) {
  const app = useApp();
  return (
    <Link href={href} className={`g-item ${active ? 'active' : ''} ${mini ? 'mini' : ''}`} title={label} aria-current={active ? 'page' : undefined} onClick={() => app.setDrawer(false)}>
      <span className="g-icon">{icon}</span>
      <span className="g-label">{label}</span>
      {trailing}
    </Link>
  );
}

export function Guide({ mode, subscriptions }: { mode: GuideMode; subscriptions: GuideChannel[] }) {
  const app = useApp();
  const path = decodeURIComponent(usePathname());
  const params = useSearchParams();
  const [showAll, setShowAll] = useState(false);
  const list = path === '/playlist' ? params.get('list') : null;
  const is = (p: string) => path === p;

  if (mode === 'none') return null;
  if (mode === 'mini') {
    return (
      <nav className="guide-mini" aria-label="Main">
        <GuideLink mini href="/" icon={<Icon name="home" filled={is('/')} />} label="Home" active={is('/')} />
        <GuideLink mini href="/shorts" icon={<ShortsIcon filled={path.startsWith('/shorts')} />} label="Shorts" active={path.startsWith('/shorts')} />
        <GuideLink mini href="/feed/subscriptions" icon={<Icon name="subscriptions" filled={is('/feed/subscriptions')} />} label="Subscriptions" active={is('/feed/subscriptions')} />
        <GuideLink mini href="/feed/you" icon={<Icon name="account_circle" filled={is('/feed/you')} />} label="You" active={is('/feed/you')} />
      </nav>
    );
  }
  const shown = showAll ? subscriptions : subscriptions.slice(0, 7);
  const me = app.me;
  return (
    <>
      {mode === 'drawer' && <div className={`scrim ${app.drawer ? 'open' : ''}`} onClick={() => app.setDrawer(false)} />}
      <nav className={`guide ${mode === 'drawer' ? 'drawer' : ''} ${mode === 'drawer' && app.drawer ? 'open' : ''}`} aria-label="Main" inert={mode === 'drawer' && !app.drawer ? true : undefined}>
        {mode === 'drawer' && <div className="drawer-head"><IconButton icon="menu" label="Guide" onClick={() => app.setDrawer(false)} /><Logo /></div>}
        <div className="g-section">
          <GuideLink href="/" icon={<Icon name="home" filled={is('/')} />} label="Home" active={is('/')} />
          <GuideLink href="/shorts" icon={<ShortsIcon filled={path.startsWith('/shorts')} />} label="Shorts" active={path.startsWith('/shorts')} />
          <GuideLink href="/feed/subscriptions" icon={<Icon name="subscriptions" filled={is('/feed/subscriptions')} />} label="Subscriptions" active={is('/feed/subscriptions')} />
        </div>
        <div className="g-section">
          <Link href="/feed/you" className="g-title" onClick={() => app.setDrawer(false)}>You <Icon name="chevron_right" size={20} /></Link>
          {me ? (
            <>
              <GuideLink href={`/${me.handle}`} icon={<Icon name="account_box" />} label="Your channel" active={is(`/${me.handle}`)} />
              <GuideLink href="/feed/history" icon={<Icon name="history" />} label="History" active={is('/feed/history')} />
              <GuideLink href="/feed/playlists" icon={<Icon name="playlist_play" />} label="Playlists" active={is('/feed/playlists')} />
              <GuideLink href="/studio/content" icon={<Icon name="smart_display" />} label="Your videos" />
              <GuideLink href="/playlist?list=WL" icon={<Icon name="schedule" filled={list === 'WL'} />} label="Watch later" active={list === 'WL'} />
              <GuideLink href="/playlist?list=LL" icon={<Icon name="thumb_up" filled={list === 'LL'} />} label="Liked videos" active={list === 'LL'} />
              <GuideLink href="/messages" icon={<Icon name="chat" filled={path.startsWith('/messages')} />} label="Messages" active={path.startsWith('/messages')} />
            </>
          ) : (
            <div className="g-signin">
              <p>Sign in to like videos, comment, subscribe and send messages.</p>
              <Link href="/signin" className="btn btn-outline btn-md"><Icon name="account_circle" />Sign in</Link>
            </div>
          )}
        </div>
        {me && (
          <div className="g-section">
            <div className="g-title">Subscriptions</div>
            {subscriptions.length === 0 && <p className="g-note">Channels you subscribe to show up here.</p>}
            {shown.map((c) => (
              <GuideLink key={c.id} href={`/${c.handle}`} icon={<Avatar channel={c} size={24} ring={c.story === 'unseen' ? 'unseen' : null} />} label={c.name}
                active={path.startsWith(`/${c.handle}`)} trailing={c.hasNew ? <span className="g-dot" aria-label="New content" /> : undefined} />
            ))}
            {subscriptions.length > 7 && (
              <button type="button" className="g-item" onClick={() => setShowAll(!showAll)}>
                <span className="g-icon"><Icon name={showAll ? 'expand_less' : 'expand_more'} /></span>
                <span className="g-label">{showAll ? 'Show fewer' : `Show ${subscriptions.length - 7} more`}</span>
              </button>
            )}
            <GuideLink href="/feed/channels" icon={<Icon name="format_list_bulleted" />} label="All subscriptions" active={is('/feed/channels')} />
          </div>
        )}
        <div className="g-section">
          <GuideLink href="/studio" icon={<Icon name="video_settings" />} label="Vidora Studio" />
          <GuideLink href="/account" icon={<Icon name="settings" />} label="Settings" active={is('/account')} />
          <GuideLink href="/about" icon={<Icon name="info" />} label="About & credits" active={is('/about')} />
        </div>
        <footer className="g-footer">Video footage: NASA (public domain). Icons: Material Symbols. Font: Roboto.</footer>
      </nav>
    </>
  );
}

/* ---------------- Bottom nav (phones) ---------------- */
export function BottomNav() {
  const path = decodeURIComponent(usePathname());
  const app = useApp();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mobile = useIsMobile();
  if (!mobile) return null;
  const youActive = path === '/feed/you' || (!!app.me && path === `/${app.me.handle}`);
  return (
    <nav className={`bottom-nav ${path.startsWith('/shorts') ? 'on-dark' : ''}`} aria-label="Primary">
      <Link href="/" className={path === '/' ? 'on' : ''}><Icon name="home" filled={path === '/'} /><span>Home</span></Link>
      <Link href="/shorts" className={path.startsWith('/shorts') ? 'on' : ''}><ShortsIcon filled={path.startsWith('/shorts')} /><span>Shorts</span></Link>
      <button type="button" className="bn-create" aria-label="Create" onClick={(e) => setAnchor(e.currentTarget)}><span className="bn-plus"><Icon name="add" size={28} /></span></button>
      <Link href="/feed/subscriptions" className={path === '/feed/subscriptions' ? 'on' : ''}><Icon name="subscriptions" filled={path === '/feed/subscriptions'} /><span>Subscriptions</span></Link>
      <Link href="/feed/you" className={youActive ? 'on' : ''}>{app.me ? <Avatar channel={app.me} size={24} /> : <Icon name="account_circle" filled={youActive} />}<span>You</span></Link>
      {anchor && <CreateMenu anchor={anchor} onClose={() => setAnchor(null)} />}
    </nav>
  );
}
