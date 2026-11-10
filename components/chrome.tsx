'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { addSearch } from '@/lib/actions';
import { timeAgo } from '@/lib/format';
import { activeStories, feedVideos, myChannel, notificationsFor, STORY_MIN_SUBS, update, useDB } from '@/lib/store';
import type { Theme } from '@/lib/types';
import { useApp } from './app-context';
import { Avatar, Dialog, Icon, IconButton, MediaImg, Menu, ShortsIcon, useIsMobile, useToast, type MenuItem } from './ui';

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
function SearchBox({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const d = useDB();
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(() => (pathname === '/results' ? params.get('search_query') ?? '' : ''));
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);

  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hist = d.user.searchHistory.filter((s) => s.toLowerCase().includes(term)).slice(0, term ? 3 : 10).map((s) => ({ s, hist: true }));
    if (!term) return hist;
    const pool = new Set<string>();
    for (const v of feedVideos(d)) if (v.title.toLowerCase().includes(term)) pool.add(v.title.toLowerCase());
    for (const c of Object.values(d.channels)) if (c.name.toLowerCase().includes(term) && !c.isMine) pool.add(c.name.toLowerCase());
    return [...hist, ...[...pool].filter((s) => !hist.some((h) => h.s === s)).slice(0, 10 - hist.length).map((s) => ({ s, hist: false }))];
  }, [q, d]);

  const go = (text: string) => {
    const t = text.trim();
    if (!t) return;
    addSearch(t);
    setOpen(false);
    inputRef.current?.blur();
    onDone?.();
    router.push(`/results?search_query=${encodeURIComponent(t)}`);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(hl >= 0 ? suggestions[hl].s : q);
  };

  const voice = () => {
    type SR = { lang: string; interimResults: boolean; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void; onend: () => void; onerror: () => void };
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setListening(true);
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join('');
      setQ(text);
      const last = e.results[e.results.length - 1];
      if (last.isFinal) go(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <div className="search">
      <form className="search-form" role="search" onSubmit={submit}>
        <div className="search-box">
          <Icon name="search" size={20} className="search-lead" />
          <input
            ref={inputRef}
            value={q}
            autoFocus={autoFocus}
            onChange={(e) => { setQ(e.target.value); setHl(-1); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(suggestions.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(-1, h - 1)); }
              if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
            }}
            placeholder="Search"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {q && <IconButton icon="close" label="Clear search query" size={36} onClick={() => { setQ(''); inputRef.current?.focus(); }} />}
        </div>
        <button className="search-btn" type="submit" aria-label="Search" data-tooltip="Search"><Icon name="search" /></button>
        {open && suggestions.length > 0 && (
          <ul className="suggest" role="listbox">
            {suggestions.map((it, i) => (
              <li key={it.s} className={i === hl ? 'hl' : ''} onMouseDown={(e) => { e.preventDefault(); go(it.s); }}>
                <Icon name={it.hist ? 'history' : 'search'} size={20} />
                <span className="grow">{it.s}</span>
                {it.hist && (
                  <button type="button" className="suggest-remove" onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    update((db) => { db.user.searchHistory = db.user.searchHistory.filter((s) => s !== it.s); });
                  }}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </form>
      <IconButton icon="mic" label="Search with your voice" className="mic-btn" onClick={voice} filled />
      {listening && (
        <Dialog title="" onClose={() => setListening(false)} width={560}>
          <div className="voice">
            <span className="voice-dot"><Icon name="mic" filled size={36} /></span>
            <p>{('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? 'Listening…' : 'Voice search isn’t supported in this browser.'}</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ---------------- Masthead menus ---------------- */
function CreateMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const app = useApp();
  const d = useDB();
  const router = useRouter();
  const eligible = myChannel(d).subscribers >= STORY_MIN_SUBS;
  return (
    <Menu anchor={anchor} onClose={onClose} header={<div className="menu-title mobile-only">Create</div>} items={[
      { icon: 'upload', label: 'Upload video', onSelect: () => app.open({ kind: 'upload' }) },
      { icon: <ShortsIcon />, label: 'Create Short', onSelect: () => app.open({ kind: 'upload', short: true }) },
      { icon: 'sensors', label: 'Go live', onSelect: () => router.push('/studio/live') },
      { icon: 'edit_note', label: 'Create post', onSelect: () => app.open({ kind: 'post' }) },
      { icon: 'add_circle', label: 'Create story', trailing: eligible ? undefined : <Icon name="lock" size={18} />, onSelect: () => app.open({ kind: 'story' }) },
    ]} />
  );
}

function NotificationsMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const d = useDB();
  const app = useApp();
  const router = useRouter();
  const items = notificationsFor(d);
  const [menuFor, setMenuFor] = useState<{ el: HTMLElement; id: string; channelId: string } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => update((db) => {
      db.user.readNotifications = [...new Set([...db.user.readNotifications, ...items.map((n) => n.id)])];
    }), 2000);
    return () => clearTimeout(t);
  }, [items]);
  return (
    <Menu anchor={anchor} onClose={onClose} className="notif-menu" header={
      <div className="notif-head"><span>Notifications</span><Link href="/account#notifications" onClick={onClose} className="icon-btn" aria-label="Settings" data-tooltip="Settings"><Icon name="settings" /></Link></div>
    }>
      {items.length === 0 ? (
        <div className="notif-empty"><Icon name="notifications" size={96} /><h3>Your notifications live here</h3><p className="muted">Subscribe to your favorite channels to get notified about their latest videos.</p></div>
      ) : items.map((n) => (
        <div key={n.id} className={`notif ${d.user.readNotifications.includes(n.id) ? '' : 'unread'}`} onClick={() => {
          onClose();
          if (n.href.startsWith('?story=')) app.openStory(n.channelId); else router.push(n.href);
        }}>
          <Avatar channel={d.channels[n.channelId]} size={48} />
          <div className="notif-text">{n.text}<small>{timeAgo(n.at)}</small></div>
          {n.thumbnail && <MediaImg src={n.thumbnail} className="notif-thumb" />}
          <IconButton icon="more_vert" label="Action menu" onClick={(e) => { e.stopPropagation(); setMenuFor({ el: e.currentTarget, id: n.id, channelId: n.channelId }); }} />
        </div>
      ))}
      {menuFor && <Menu anchor={menuFor.el} onClose={() => setMenuFor(null)} sheet={false} items={[
        { icon: 'visibility_off', label: 'Hide this notification', onSelect: () => update((db) => { db.user.dismissedNotifications.push(menuFor.id); }) },
        { icon: 'notifications_off', label: `Turn off all from ${d.channels[menuFor.channelId].name}`, onSelect: () => update((db) => { db.user.bells[menuFor.channelId] = 'none'; }) },
      ]} />}
    </Menu>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'Use device theme' },
  { id: 'dark', label: 'Dark theme' },
  { id: 'light', label: 'Light theme' },
];

function AccountMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const d = useDB();
  const app = useApp();
  const me = myChannel(d);
  const [view, setView] = useState<'main' | 'theme'>('main');
  const theme = THEMES.find((t) => t.id === d.user.theme)!;
  if (view === 'theme') {
    return (
      <Menu anchor={anchor} onClose={onClose} header={<div className="menu-back"><IconButton icon="arrow_back" label="Back" onClick={() => setView('main')} /><span>Appearance</span></div>}
        items={[{ label: <span className="muted small">Setting applies to this browser only</span>, keepOpen: true }, ...THEMES.map((t) => ({ label: t.label, checked: t.id === d.user.theme, icon: '', onSelect: () => update((db) => { db.user.theme = t.id; }) }))]} />
    );
  }
  const items: MenuItem[] = [
    { icon: 'account_box', label: 'Your channel', href: `/${me.handle}` },
    { icon: 'smart_display', label: 'Vidora Studio', href: '/studio' },
    { divider: true, label: '' },
    { icon: d.user.theme === 'light' ? 'light_mode' : 'dark_mode', label: `Appearance: ${theme.label.replace(' theme', '')}`, trailing: <Icon name="chevron_right" />, keepOpen: true, onSelect: () => setView('theme') },
    { icon: 'keyboard', label: 'Keyboard shortcuts', onSelect: () => app.open({ kind: 'shortcuts' }) },
    { divider: true, label: '' },
    { icon: 'settings', label: 'Settings', href: '/account' },
    { icon: 'info', label: 'About & credits', href: '/about' },
  ];
  return (
    <Menu anchor={anchor} onClose={onClose} className="account-menu" header={
      <div className="account-head">
        <Avatar channel={me} size={40} />
        <div><div className="account-name">{me.name}</div><div>{me.handle}</div><Link href={`/${me.handle}`} onClick={onClose} className="link">View your channel</Link></div>
      </div>
    } items={items} />
  );
}

/* ---------------- Masthead ---------------- */
export function Masthead() {
  const d = useDB();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchKey = pathname === '/results' ? params.get('search_query') ?? '' : pathname;
  const app = useApp();
  const mobile = useIsMobile();
  const [menu, setMenu] = useState<{ kind: 'create' | 'notif' | 'account'; el: HTMLElement } | null>(null);
  const [mSearch, setMSearch] = useState(false);
  const unread = notificationsFor(d).filter((n) => !d.user.readNotifications.includes(n.id)).length;
  const close = () => setMenu(null);

  if (mobile && mSearch) {
    return (
      <header className="masthead msearch">
        <IconButton icon="arrow_back" label="Back" onClick={() => setMSearch(false)} />
        <SearchBox autoFocus onDone={() => setMSearch(false)} />
      </header>
    );
  }
  return (
    <header className="masthead">
      <div className="mh-start">
        <IconButton icon="menu" label="Guide" className="guide-btn" onClick={() => app.setDrawer(!app.drawer)} />
        <Logo />
      </div>
      <div className="mh-center"><SearchBox key={searchKey} /></div>
      <div className="mh-end">
        <IconButton icon="search" label="Search" className="mobile-only" onClick={() => setMSearch(true)} />
        <button type="button" className="btn btn-tonal btn-md create-btn desktop-only" onClick={(e) => setMenu({ kind: 'create', el: e.currentTarget })}>
          <Icon name="add" /><span className="btn-label">Create</span>
        </button>
        <button type="button" className="icon-btn notif-btn" aria-label="Notifications" data-tooltip="Notifications" onClick={(e) => setMenu({ kind: 'notif', el: e.currentTarget })}>
          <Icon name="notifications" />
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button type="button" className="avatar-btn desktop-only" aria-label="Account menu" onClick={(e) => setMenu({ kind: 'account', el: e.currentTarget })}>
          <Avatar channel={myChannel(d)} size={32} />
        </button>
      </div>
      {menu?.kind === 'create' && <CreateMenu anchor={menu.el} onClose={close} />}
      {menu?.kind === 'notif' && <NotificationsMenu anchor={menu.el} onClose={close} />}
      {menu?.kind === 'account' && <AccountMenu anchor={menu.el} onClose={close} />}
    </header>
  );
}

/* ---------------- Guide (sidebar) ---------------- */
function GuideLink({ href, icon, label, active, trailing, mini }: { href: string; icon: ReactNode; label: string; active?: boolean; trailing?: ReactNode; mini?: boolean }) {
  const app = useApp();
  return (
    <Link href={href} className={`g-item ${active ? 'active' : ''} ${mini ? 'mini' : ''}`} title={label} onClick={() => app.setDrawer(false)}>
      <span className="g-icon">{icon}</span>
      <span className="g-label">{label}</span>
      {trailing}
    </Link>
  );
}

export type GuideMode = 'full' | 'mini' | 'drawer' | 'none';

export function Guide({ mode }: { mode: GuideMode }) {
  const d = useDB();
  const app = useApp();
  const path = usePathname();
  const params = useSearchParams();
  const me = myChannel(d);
  const subs = d.user.subscriptions.map((id) => d.channels[id]).filter(Boolean);
  const [showAll, setShowAll] = useState(false);
  const storyChannels = new Set(activeStories(d).map((g) => g.channelId));
  const isActive = (p: string) => path === p;
  const list = path === '/playlist' ? params.get('list') : null;

  if (mode === 'none') return null;
  if (mode === 'mini') {
    return (
      <nav className="guide-mini" aria-label="Main">
        <GuideLink mini href="/" icon={<Icon name="home" filled={isActive('/')} />} label="Home" active={isActive('/')} />
        <GuideLink mini href="/shorts" icon={<ShortsIcon filled={path.startsWith('/shorts')} />} label="Shorts" active={path.startsWith('/shorts')} />
        <GuideLink mini href="/feed/subscriptions" icon={<Icon name="subscriptions" filled={isActive('/feed/subscriptions')} />} label="Subscriptions" active={isActive('/feed/subscriptions')} />
        <GuideLink mini href="/feed/you" icon={<Icon name="account_circle" filled={isActive('/feed/you')} />} label="You" active={isActive('/feed/you')} />
      </nav>
    );
  }
  const shown = showAll ? subs : subs.slice(0, 7);
  return (
    <>
      {mode === 'drawer' && app.drawer && <div className="scrim" onClick={() => app.setDrawer(false)} />}
      <nav className={`guide ${mode === 'drawer' ? 'drawer' : ''} ${mode === 'drawer' && app.drawer ? 'open' : ''}`} aria-label="Main">
        {mode === 'drawer' && <div className="drawer-head"><IconButton icon="menu" label="Guide" onClick={() => app.setDrawer(false)} /><Logo /></div>}
        <div className="g-section">
          <GuideLink href="/" icon={<Icon name="home" filled={isActive('/')} />} label="Home" active={isActive('/')} />
          <GuideLink href="/shorts" icon={<ShortsIcon filled={path.startsWith('/shorts')} />} label="Shorts" active={path.startsWith('/shorts')} />
          <GuideLink href="/feed/subscriptions" icon={<Icon name="subscriptions" filled={isActive('/feed/subscriptions')} />} label="Subscriptions" active={isActive('/feed/subscriptions')} />
        </div>
        <div className="g-section">
          <Link href="/feed/you" className="g-title" onClick={() => app.setDrawer(false)}>You <Icon name="chevron_right" size={20} /></Link>
          <GuideLink href={`/${me.handle}`} icon={<Icon name="account_box" />} label="Your channel" active={decodeURIComponent(path) === `/${me.handle}`} />
          <GuideLink href="/feed/history" icon={<Icon name="history" />} label="History" active={isActive('/feed/history')} />
          <GuideLink href="/feed/playlists" icon={<Icon name="playlist_play" />} label="Playlists" active={isActive('/feed/playlists')} />
          <GuideLink href="/studio/content" icon={<Icon name="smart_display" />} label="Your videos" />
          <GuideLink href="/playlist?list=WL" icon={<Icon name="schedule" filled={list === 'WL'} />} label="Watch later" active={list === 'WL'} />
          <GuideLink href="/playlist?list=LL" icon={<Icon name="thumb_up" filled={list === 'LL'} />} label="Liked videos" active={list === 'LL'} />
          <GuideLink href="/feed/downloads" icon={<Icon name="download" />} label="Downloads" active={isActive('/feed/downloads')} />
        </div>
        <div className="g-section">
          <div className="g-title">Subscriptions</div>
          {subs.length === 0 && <p className="g-note">Channels you subscribe to show up here.</p>}
          {shown.map((c) => (
            <GuideLink key={c.id} href={`/${c.handle}`} icon={<Avatar channel={c} size={24} ring={storyChannels.has(c.id) ? 'unseen' : null} />} label={c.name}
              active={decodeURIComponent(path).startsWith(`/${c.handle}`)}
              trailing={d.videos.some((v) => v.channelId === c.id && Date.now() - v.publishedAt < 7 * 86_400_000) ? <span className="g-dot" aria-label="New content" /> : undefined} />
          ))}
          {subs.length > 7 && (
            <button type="button" className="g-item" onClick={() => setShowAll(!showAll)}>
              <span className="g-icon"><Icon name={showAll ? 'expand_less' : 'expand_more'} /></span>
              <span className="g-label">{showAll ? 'Show fewer' : `Show ${subs.length - 7} more`}</span>
            </button>
          )}
          <GuideLink href="/feed/channels" icon={<Icon name="format_list_bulleted" />} label="All subscriptions" active={isActive('/feed/channels')} />
        </div>
        <div className="g-section">
          <GuideLink href="/studio" icon={<Icon name="video_settings" />} label="Vidora Studio" />
          <GuideLink href="/account" icon={<Icon name="settings" />} label="Settings" active={isActive('/account')} />
          <GuideLink href="/about" icon={<Icon name="info" />} label="About & credits" active={isActive('/about')} />
        </div>
        <footer className="g-footer">
          Video footage: NASA (public domain).<br />
          Icons: Material Symbols (Apache 2.0). Font: Roboto.<br />
          <span className="g-copy">Vidora is an independent project.</span>
        </footer>
      </nav>
    </>
  );
}

/* ---------------- Bottom nav (phones) ---------------- */
export function BottomNav() {
  const path = usePathname();
  const d = useDB();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const me = myChannel(d);
  const youActive = path === '/feed/you' || decodeURIComponent(path) === `/${me.handle}`;
  return (
    <nav className={`bottom-nav ${path.startsWith('/shorts') ? 'on-dark' : ''}`} aria-label="Primary">
      <Link href="/" className={path === '/' ? 'on' : ''}><Icon name="home" filled={path === '/'} /><span>Home</span></Link>
      <Link href="/shorts" className={path.startsWith('/shorts') ? 'on' : ''}><ShortsIcon filled={path.startsWith('/shorts')} /><span>Shorts</span></Link>
      <button type="button" className="bn-create" aria-label="Create" onClick={(e) => setAnchor(e.currentTarget)}><span className="bn-plus"><Icon name="add" size={28} /></span></button>
      <Link href="/feed/subscriptions" className={path === '/feed/subscriptions' ? 'on' : ''}><Icon name="subscriptions" filled={path === '/feed/subscriptions'} /><span>Subscriptions</span></Link>
      <Link href="/feed/you" className={youActive ? 'on' : ''}><Avatar channel={me} size={24} /><span>You</span></Link>
      {anchor && <CreateMenu anchor={anchor} onClose={() => setAnchor(null)} />}
    </nav>
  );
}
