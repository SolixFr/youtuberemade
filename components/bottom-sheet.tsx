'use client';

import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/components/ui';

const MIN_PX = 64;
const HALF_VH = 0.55;
const FULL_VH = 0.92;
const DISMISS_VH = 0.30;

/**
 * Draggable bottom sheet (YouTube-style): drag the grab strip between half and full height,
 * or fling it down past the dismiss threshold to close. Escape / scrim / X also close.
 */
export function BottomSheet({ onClose, label, className = '', children }: {
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; base: number } | null>(null);
  const half = useRef(0);
  const full = useRef(0);

  // Measure snap points and keep them current on resize; start at half.
  useEffect(() => {
    const measure = () => {
      half.current = Math.round(window.innerHeight * HALF_VH);
      full.current = Math.round(window.innerHeight * FULL_VH);
      setSize((s) => (s == null ? half.current : Math.min(Math.max(s, MIN_PX), full.current)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Lock the page behind the sheet, move focus into it, and wire Escape to close.
  useEffect(() => {
    document.body.classList.add('no-scroll');
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('no-scroll'); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, base: size ?? half.current };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.base - (e.clientY - drag.current.startY);
    setSize(Math.min(Math.max(next, MIN_PX), full.current));
  };
  const endDrag = () => {
    if (!drag.current) return;
    const h = size ?? drag.current.base;
    drag.current = null;
    setDragging(false);
    if (window.innerHeight > 0 && h < window.innerHeight * DISMISS_VH) { onClose(); return; }
    setSize(Math.abs(h - half.current) <= Math.abs(h - full.current) ? half.current : full.current);
  };

  return createPortal(
    <>
      <div className="sheet-scrim" role="presentation" onClick={onClose} />
      <div
        ref={panel}
        className={`bottom-sheet ${dragging ? 'dragging' : ''} ${className}`}
        style={size == null ? undefined : { height: `${size}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <div
          className="sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-handle" aria-hidden="true" />
          <span className="sheet-close"><IconButton icon="close" label={`Close ${label}`} onClick={onClose} /></span>
        </div>
        <div className="sheet-scroll">{children}</div>
      </div>
    </>,
    document.body
  );
}
