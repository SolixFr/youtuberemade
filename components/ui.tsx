'use client';

import {

  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { ChannelLite, StoryState, Visibility } from '@/lib/types';

/** Member tier colors, like YouTube's loyalty badge levels. */
export const MEMBER_TIER_COLORS = ['#9aa0a6', '#3ea6ff', '#2ba640', '#ab47bc', '#ffd600'];

/** YouTube-style loyalty star next to a commenter/poster; colored by tier. */
export function MemberBadge({ tier, name }: { tier: number; name?: string }) {
  const color = MEMBER_TIER_COLORS[(tier - 1) % MEMBER_TIER_COLORS.length];
  return (
    <span className="member-badge" style={{ color }} role="img" aria-label={name ? `Member · ${name}` : `Member, tier ${tier}`} title={name ? `Member · ${name}` : `Member, tier ${tier}`}>
      <Icon name="loyalty" filled size={18} />
    </span>
  );
}

/** The exact confirmed-check glyph YouTube renders: a filled disc with the check punched out. */
export function CheckCircleIcon({ size = 24, className = '', style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ display: 'block', ...style }} aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm5.707 7.293a1 1 0 010 1.414L10 17.414l-3.707-3.707a1 1 0 111.414-1.414L10 14.586l6.293-6.293a1 1 0 011.414 0Z" />
    </svg>
  );
}

/* ---------- Icon (Material Symbols) ---------- */
export function Icon({ name, filled, size = 24, className = '', style }: { name: string; filled?: boolean; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={`material-symbols-outlined icon ${className}`} aria-hidden="true"
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`, ...style }}>
      {name}
    </span>
  );
}

/** Material Symbols has no Shorts glyph, so this one is drawn on the same 24px grid. */
export function ShortsIcon({ filled, size = 24 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <rect x="6" y="2.5" width="12" height="19" rx="3.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 9v6l4.8-3z" fill={filled ? 'var(--bg)' : 'currentColor'} />
    </svg>
  );
}

/* ---------- Buttons ---------- */
type BtnVariant = 'tonal' | 'filled' | 'blue' | 'text' | 'outline';
export function Button({ variant = 'tonal', icon, size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: string; size?: 'sm' | 'md' }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${icon && !children ? 'btn-icon-only' : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 20 : 24} />}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, filled, size = 40, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string | ReactNode; label: string; filled?: boolean; size?: number }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} data-tooltip={label} style={{ width: size, height: size }} {...rest}>
      {typeof icon === 'string' ? <Icon name={icon} filled={filled} /> : icon}
    </button>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Spinner({ size = 24 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="progressbar" aria-label="Loading" />;
}

/* ---------- Avatar ---------- */
const AVATAR_COLORS = ['#5c6bc0', '#26a69a', '#ef6c00', '#8e24aa', '#00897b', '#d81b60', '#3949ab', '#7cb342', '#6d4c41', '#039be5'];
function letterColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ channel, name, src, size = 36, ring }: { channel?: Pick<ChannelLite, 'name' | 'avatar'> | null; name?: string; src?: string | null; size?: number; ring?: StoryState }) {
  const label = channel?.name ?? name ?? '?';
  const url = src ?? channel?.avatar;
  const inner = url ? (
     
    <img className="avatar" src={url} alt="" width={size} height={size} loading="lazy" decoding="async" />
  ) : (
    <span className="avatar avatar-letter" style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: letterColor(label) }}>
      {label.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  );
  if (!ring) return inner;
  return <span className={`story-ring ${ring}`} style={{ padding: Math.max(2, size / 24) }}>{inner}</span>;
}

/* ---------- Chips ---------- */
export function Chips<T extends string>({ items, value, onChange, className = '' }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  return (
    <div className={`chips-wrap ${className}`}>
      {edges.left && <div className="chips-arrow left"><IconButton icon="chevron_left" label="Previous" size={28} onClick={() => scroll(-1)} /></div>}
      <div className="chips" ref={ref} onScroll={measure} role="tablist">
        {items.map((it) => (
          <button key={it.id} type="button" role="tab" aria-selected={it.id === value} className={`chip ${it.id === value ? 'on' : ''}`} onClick={() => onChange(it.id)}>{it.label}</button>
        ))}
      </div>
      {edges.right && <div className="chips-arrow right"><IconButton icon="chevron_right" label="Next" size={28} onClick={() => scroll(1)} /></div>}
    </div>
  );
}

/* ---------- Media queries ---------- */
const mobileQuery = '(max-width: 791px)';
/** SSR-safe breakpoint flag: server and first client render agree on false; measured after mount. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const q = matchMedia(mobileQuery);
    const apply = () => setMobile(q.matches);
    apply();
    q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, []);
  return mobile;
}
/** SSR-safe window width: server and first client render agree on 1440; the real width is measured after mount. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(1440);
  useEffect(() => {
    const measure = () => setWidth(window.innerWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return width;
}

function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

/* ---------- Exit animations ---------- */
const EXIT_MS = 150;
/** Keeps an overlay mounted while its close animation plays, then calls onClose. */
function useClosing(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const done = useRef(onClose);
  useEffect(() => { done.current = onClose; });
  const close = useCallback(() => {
    setClosing((c) => {
      if (!c) setTimeout(() => done.current(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS);
      return true;
    });
  }, []);
  return { closing, close };
}

/* Shared items for the common visibility dropdown. */
export const VISIBILITY_ITEMS: DropdownItem<Visibility>[] = [
  { id: 'public', label: 'Public', icon: 'public' },
  { id: 'unlisted', label: 'Unlisted', icon: 'link' },
  { id: 'private', label: 'Private', icon: 'lock' },
];

/* ---------- Dropdown: styled replacement for <select> ---------- */
export interface DropdownItem<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
}

/** Tonal trigger + the standard anchored Menu (bottom sheet on phones). No dead `<select>` chrome. */
export function Dropdown<T extends string = string>({ items, value, onChange, label, placeholder = 'Select…', className = '', align = 'left', disabled = false }: {
  items: DropdownItem<T>[];
  value: T | '';
  onChange: (id: T) => void;
  /** Accessible name; shown when `value` doesn't match an item. */
  label?: string;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = items.find((i) => i.id === value) ?? null;
  const shown = current?.label ?? (label ?? placeholder);
  return (
    <span className={`dd ${className}`}>
      <button type="button" className={`dd-trigger ${current ? '' : 'empty'} ${anchor ? 'open' : ''}`}
        aria-haspopup="menu" aria-expanded={anchor !== null} aria-label={label ?? placeholder} disabled={disabled}
        onClick={(e) => setAnchor((a) => (a ? null : e.currentTarget))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !anchor) { e.preventDefault(); setAnchor(e.currentTarget); } }}>
        <span className="dd-label">{shown}</span>
        <Icon name="expand_more" size={20} className="dd-chevron" />
      </button>
      {anchor && (
        <Menu anchor={anchor} align={align} onClose={() => setAnchor(null)} items={items.map((it) => ({
          icon: it.icon, label: it.label, checked: it.id === value, onSelect: () => onChange(it.id),
        }))} />
      )}
    </span>
  );
}

/* ---------- Menu: anchored popover, bottom sheet on phones ---------- */
export interface MenuItem {
  icon?: string | ReactNode;
  label: ReactNode;
  onSelect?: () => void;
  href?: string;
  checked?: boolean;
  divider?: boolean;
  trailing?: ReactNode;
  keepOpen?: boolean;
}

export function Menu({ anchor, onClose, items, header, align = 'right', className = '', sheet = true, children }: {
  anchor: HTMLElement | null; onClose: () => void; items?: MenuItem[]; header?: ReactNode; align?: 'left' | 'right'; className?: string; sheet?: boolean; children?: ReactNode | ((close: () => void) => ReactNode);
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const asSheet = mobile && sheet;
  const { closing, close } = useClosing(onClose);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!anchor || !ref.current || asSheet) return;
    const a = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - m.width - 8, align === 'right' ? a.right - m.width : a.left));
    let top = a.bottom + 4;
    let origin = 'top';
    if (top + m.height > window.innerHeight - 8) { top = Math.max(8, a.top - m.height - 4); origin = 'bottom'; }
    setPos({ left, top, transformOrigin: `${align === 'right' ? 'right' : 'left'} ${origin}` });
  }, [anchor, align, asSheet, items?.length]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const reflow = () => !asSheet && close();
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', reflow);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', reflow);
    };
  }, [anchor, close, asSheet]);

  if (!anchor) return null;
  return (
    <Portal>
      {asSheet && <div className={`sheet-scrim ${closing ? 'closing' : ''}`} onClick={close} />}
      <div ref={ref} role="menu" className={`menu ${asSheet ? 'sheet' : ''} ${closing ? 'closing' : ''} ${className}`} style={asSheet ? undefined : pos}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const all = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
          const i = all.indexOf(document.activeElement as HTMLElement);
          all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
        }}>
        {asSheet && <div className="sheet-handle" />}
        {header}
        {items?.map((it, i) => (it.divider ? <hr key={i} /> : <MenuRow key={i} item={it} close={close} />))}
        {typeof children === 'function' ? children(close) : children}
      </div>
    </Portal>
  );
}

function MenuRow({ item, close }: { item: MenuItem; close: () => void }) {
  const content = (
    <>
      {item.icon !== undefined && <span className="menu-icon">{typeof item.icon === 'string' ? (item.icon ? <Icon name={item.icon} /> : null) : item.icon}</span>}
      <span className="menu-label">{item.label}</span>
      {item.checked && <Icon name="check" className="menu-trailing" />}
      {item.trailing && <span className="menu-trailing">{item.trailing}</span>}
    </>
  );
  const select = () => {
    item.onSelect?.();
    if (!item.keepOpen) close();
  };
  if (item.href) return <a role="menuitem" className="menu-item" href={item.href} onClick={select}>{content}</a>;
  return <button role="menuitem" type="button" className="menu-item" onClick={select}>{content}</button>;
}

/* ---------- Dialog ---------- */
type Slot = ReactNode | ((close: () => void) => ReactNode);
const renderSlot = (s: Slot, close: () => void) => (typeof s === 'function' ? s(close) : s);
let openDialogs = 0;

export function Dialog({ title, onClose, children, footer, width = 520, className = '', dismissable = true }: {
  title?: ReactNode; onClose: () => void; children: Slot; footer?: Slot; width?: number; className?: string; dismissable?: boolean;
}) {
  const { closing, close } = useClosing(onClose);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    openDialogs++;
    document.body.classList.add('no-scroll');
    box.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]), textarea')?.focus({ preventScroll: true });
    return () => {
      if (--openDialogs === 0) document.body.classList.remove('no-scroll');
      previous?.focus?.({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && dismissable && close();
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [close, dismissable]);
  return (
    <Portal>
      <div className={`dialog-scrim ${closing ? 'closing' : ''}`} onMouseDown={(e) => dismissable && e.target === e.currentTarget && close()}>
        <div ref={box} className={`dialog ${className}`} role="dialog" aria-modal="true" style={{ width }}>
          {title !== undefined && title !== '' && (
            <div className="dialog-head">
              <h2>{title}</h2>
              <IconButton icon="close" label="Close" onClick={close} />
            </div>
          )}
          <div className="dialog-body">{renderSlot(children, close)}</div>
          {footer && <div className="dialog-foot">{renderSlot(footer, close)}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function ConfirmDialog({ title, text, confirm = 'Delete', onConfirm, onClose }: { title: string; text: ReactNode; confirm?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} width={420}
      footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="text" className="text-blue" onClick={() => { onConfirm(); close(); }}>{confirm}</Button></>}>
      <p className="muted">{text}</p>
    </Dialog>
  );
}

/* ---------- Toasts ---------- */
interface ToastMsg { text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    clearTimeout(timer.current);
    setMsg({ text, action });
    setShown(true);
    timer.current = setTimeout(() => setShown(false), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast ${shown ? 'show' : ''}`} role="status" aria-live="polite">
        {msg && <span>{msg.text}</span>}
        {msg?.action && <button type="button" onClick={() => { msg.action?.run(); setShown(false); }}>{msg.action.label}</button>}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Form bits ---------- */
export function Field({ label, children, count, hint, error }: { label: string; children: ReactNode; count?: string; hint?: ReactNode; error?: string | null }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {count && <span className="field-count">{count}</span>}
      {(error || hint) && <span className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
    </label>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: string; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={96} className="empty-icon" />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
