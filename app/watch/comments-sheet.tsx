'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Comments } from '@/components/social';
import { IconButton } from '@/components/ui';
import type { Comment } from '@/lib/types';

/** Bottom sheet that hosts the comment thread on phones (YouTube-style). */
export function CommentsSheet({ videoId, owner, comments, onSeek, onClose }: {
  videoId: string;
  owner: { id: string; handle: string; name: string; avatar: string | null };
  comments: Comment[];
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Lock the page behind the sheet, move focus into it, and wire Escape/scrim close.
  useEffect(() => {
    document.body.classList.add('no-scroll');
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('no-scroll'); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const seek = (t: number) => { onSeek(t); onClose(); };

  return createPortal(
    <>
      <div className="sheet-scrim" role="presentation" onClick={onClose} />
      <div ref={panel} className="comments-sheet" role="dialog" aria-modal="true" aria-label="Comments" tabIndex={-1}>
        <div className="comments-sheet-grab">
          <span className="sheet-handle" aria-hidden="true" />
          <span className="comments-sheet-close"><IconButton icon="close" label="Close comments" onClick={onClose} /></span>
        </div>
        <div className="comments-sheet-scroll">
          <Comments videoId={videoId} owner={owner} initial={comments} onSeek={seek} />
        </div>
      </div>
    </>,
    document.body
  );
}
