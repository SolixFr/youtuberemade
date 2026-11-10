'use client';

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMedia } from '@/lib/media';
import type { Channel } from '@/lib/types';

/* ---------- Icon (Material Symbols, the open icon set from Google) ---------- */
export function Icon({ name, filled, size = 24, className = '', style }: { name: string; filled?: boolean; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined icon ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/** Material Symbols has no Shorts glyph, so this is a drawn icon in the same 24px grid and stroke weight. */
export function ShortsIcon({ filled, size = 24 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <rect x="6" y="2.5" width="12" height="19" rx="3.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 9v6l4.8-3z" fill={filled ? 'var(--bg)' : 'currentColor'} />
    </svg>
  );
}

/* ---------- Buttons ---------- */
type BtnVariant = 'tonal' | 'filled' | 'blue' | 'text' | 'outline' | 'ghost';
export function Button({ variant = 'tonal', icon, size = 'md', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${icon && !children ? 'btn-icon-only' : ''} ${className}`} {...rest}>
      {typeof icon === 'string' ? <Icon name={icon} size={size === 'sm' ? 20 : 24} /> : icon}
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

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

/* ---------- Avatar ---------- */
const AVATAR_COLORS = ['#5c6bc0', '#26a69a', '#ef6c00', '#8e24aa', '#00897b', '#d81b60', '#3949ab', '#7cb342', '#6d4c41', '#039be5'];
export function letterColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ channel, name, src, size = 36, ring }: { channel?: Channel; name?: string; src?: string; size?: number; ring?: 'unseen' | 'seen' | null }) {
  const label = channel?.name ?? name ?? '?';
  const url = useMedia(src ?? channel?.avatar);
  const inner = url ? (
     
    <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-letter" style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: letterColor(label) }}>
      {label.replace(/^@/, '').charAt(0).toUpperCase()}
    </span>
  );
  if (!ring) return inner;
  return <span className={`story-ring ${ring}`} style={{ padding: Math.max(2, size / 24) }}>{inner}</span>;
}

/* ---------- Media image ---------- */
export function MediaImg({ src, alt = '', className, style }: { src?: string; alt?: string; className?: string; style?: CSSProperties }) {
  const url = useMedia(src);
   
  return url ? <img src={url} alt={alt} className={className} style={style} loading="lazy" draggable={false} /> : <span className={`img-placeholder ${className ?? ''}`} style={style} />;
}

/* ---------- Chips ---------- */
export function Chips<T extends string>({ items, value, onChange, className = '' }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, items.length]);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  return (
    <div className={`chips-wrap ${className}`}>
      {edges.left && <div className="chips-arrow left"><IconButton icon="chevron_left" label="Previous" onClick={() => scroll(-1)} /></div>}
      <div className="chips" ref={ref} onScroll={measure} role="tablist">
        {items.map((it) => (
          <button key={it.id} type="button" role="tab" aria-selected={it.id === value} className={`chip ${it.id === value ? 'on' : ''}`} onClick={() => onChange(it.id)}>
            {it.label}
          </button>
        ))}
      </div>
      {edges.right && <div className="chips-arrow right"><IconButton icon="chevron_right" label="Next" onClick={() => scroll(1)} /></div>}
    </div>
  );
}

/* ---------- Overlay plumbing ---------- */
export function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = matchMedia('(max-width: 791px)');
    const f = () => setM(q.matches);
    f();
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  return m;
}

/** Overlays only mount after hydration (see AppShell), so document.body is always available here. */
function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

/* ---------- Menu (anchored popover; a bottom sheet on phones) ---------- */
export interface MenuItem {
  icon?: string | ReactNode;
  label: ReactNode;
  onSelect?: () => void;
  href?: string;
  checked?: boolean;
  danger?: boolean;
  divider?: boolean;
  trailing?: ReactNode;
  keepOpen?: boolean;
}

export function Menu({ anchor, onClose, items, header, align = 'right', className = '', sheet = true, children }: {
  anchor: HTMLElement | null; onClose: () => void; items?: MenuItem[]; header?: ReactNode; align?: 'left' | 'right'; className?: string; sheet?: boolean; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const asSheet = mobile && sheet;
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!anchor || !ref.current || asSheet) return;
    const a = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    let left = align === 'right' ? a.right - m.width : a.left;
    left = Math.max(8, Math.min(window.innerWidth - m.width - 8, left));
    let top = a.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, a.top - m.height - 4);
    setPos({ left, top });
  }, [anchor, align, asSheet, items?.length]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('pointerdown', down), 0);
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return (
    <Portal>
      {asSheet && <div className="sheet-scrim" onClick={onClose} />}
      <div ref={ref} role="menu" className={`menu ${asSheet ? 'sheet' : ''} ${className}`} style={asSheet ? undefined : pos}>
        {asSheet && <div className="sheet-handle" />}
        {header}
        {items?.map((it, i) =>
          it.divider ? <hr key={i} /> : (
            <MenuRow key={i} item={it} onClose={onClose} />
          ),
        )}
        {children}
      </div>
    </Portal>
  );
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const content = (
    <>
      {item.icon !== undefined && <span className="menu-icon">{typeof item.icon === 'string' ? <Icon name={item.icon} /> : item.icon}</span>}
      <span className="menu-label">{item.label}</span>
      {item.checked && <Icon name="check" className="menu-trailing" />}
      {item.trailing && <span className="menu-trailing">{item.trailing}</span>}
    </>
  );
  const select = () => {
    item.onSelect?.();
    if (!item.keepOpen) onClose();
  };
  if (item.href) return <a role="menuitem" className={`menu-item ${item.danger ? 'danger' : ''}`} href={item.href} onClick={select}>{content}</a>;
  return <button role="menuitem" type="button" className={`menu-item ${item.danger ? 'danger' : ''}`} onClick={select}>{content}</button>;
}

/* ---------- Dialog ---------- */
export function Dialog({ title, onClose, children, footer, width = 520, className = '', dismissable = true }: {
  title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; className?: string; dismissable?: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && dismissable && onClose();
    document.addEventListener('keydown', key);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', key);
      if (!document.querySelector('.dialog-scrim ~ .dialog-scrim')) document.body.classList.remove('no-scroll');
    };
  }, [onClose, dismissable]);
  return (
    <Portal>
      <div className="dialog-scrim" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
        <div className={`dialog ${className}`} role="dialog" aria-modal="true" style={{ width }}>
          {title !== undefined && (
            <div className="dialog-head">
              <h2>{title}</h2>
              <IconButton icon="close" label="Close" onClick={onClose} />
            </div>
          )}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function ConfirmDialog({ title, text, confirm = 'Delete', onConfirm, onClose }: { title: string; text: ReactNode; confirm?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} width={420}
      footer={<><Button variant="text" onClick={onClose}>Cancel</Button><Button variant="text" className="text-blue" onClick={() => { onConfirm(); onClose(); }}>{confirm}</Button></>}>
      <p className="muted">{text}</p>
    </Dialog>
  );
}

/* ---------- Toasts ---------- */
interface ToastMsg { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast ${msg ? 'show' : ''}`} role="status" aria-live="polite">
        {msg && <span>{msg.text}</span>}
        {msg?.action && <button type="button" onClick={() => { msg.action?.run(); setMsg(null); }}>{msg.action.label}</button>}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Field ---------- */
export function Field({ label, children, count, hint }: { label: string; children: ReactNode; count?: string; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {count && <span className="field-count">{count}</span>}
      {hint && <span className="field-hint">{hint}</span>}
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
