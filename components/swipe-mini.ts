'use client';

import { useRef, type PointerEvent as RPointerEvent } from 'react';

const TRANSITION = 'transform 0.26s cubic-bezier(0.2, 0, 0, 1), opacity 0.22s ease, border-radius 0.26s';

/**
 * YouTube-style swipe down to minimize. As the finger travels, the target element
 * shrinks and drifts toward the bottom-left; past the threshold it flies off and
 * `onDismiss` fires (the caller then swaps in the mini player). Otherwise it springs back.
 * Bind the returned handlers to any container; drags starting on interactive
 * elements (links, buttons, inputs, the seek bar) are ignored.
 */
export function useSwipeMini({ enabled, target, onDismiss }: {
  enabled: boolean;
  target: () => HTMLElement | null;
  onDismiss: () => void;
}) {
  const state = useRef<{ id: number; startY: number; startX: number; dy: number; captured: boolean } | null>(null);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (!enabled || e.pointerType !== 'touch' || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, [role="slider"], .p-bar, .p-controls, .p-toprow, .p-center')) return;
    state.current = { id: e.pointerId, startY: e.clientY, startX: e.clientX, dy: 0, captured: false };
  };

  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    const el = target();
    if (!el) return;
    const dy = Math.max(0, e.clientY - s.startY);
    const dx = Math.abs(e.clientX - s.startX);
    if (dx > dy * 1.6 && dy < 40) { if (s.dy) { el.style.transform = ''; el.style.opacity = ''; el.style.borderRadius = ''; } s.dy = 0; return; }
    s.dy = dy;
    if (dy > 10 && !s.captured) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* mid-gesture */ } s.captured = true; }
    const k = Math.min(1, dy / 260);
    el.style.transition = 'none';
    el.style.zIndex = '60';
    el.style.transform = `translateY(${dy}px) scale(${1 - k * 0.58})`;
    el.style.opacity = `${1 - k * 0.4}`;
    el.style.borderRadius = `${12 + k * 12}px`;
  };

  const finish = (e: RPointerEvent<HTMLElement>) => {
    const s = state.current;
    state.current = null;
    if (!s || s.id !== e.pointerId) return;
    const el = target();
    if (!el) return;
    el.style.transition = TRANSITION;
    if (s.dy > 110) {
      el.style.transform = `translate(${-(window.innerWidth / 2) + 88}px, ${window.innerHeight * 0.72}px) scale(0.16)`;
      el.style.opacity = '0';
      el.style.borderRadius = '18px';
      window.setTimeout(() => {
        el.style.transform = ''; el.style.opacity = ''; el.style.borderRadius = ''; el.style.transition = ''; el.style.zIndex = '';
        onDismiss();
      }, 240);
      return;
    }
    el.style.transform = ''; el.style.opacity = ''; el.style.borderRadius = ''; el.style.zIndex = '';
    window.setTimeout(() => { el.style.transition = ''; }, 280);
  };

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
