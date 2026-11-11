'use client';

import { BottomSheet } from '@/components/bottom-sheet';
import { Comments } from '@/components/social';
import type { Comment } from '@/lib/types';

/** Comments in the draggable bottom sheet (YouTube-style). */
export function CommentsSheet({ videoId, owner, comments, onSeek, onClose }: {
  videoId: string;
  owner: { id: string; handle: string; name: string; avatar: string | null };
  comments: Comment[];
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  const seek = (t: number) => { onSeek(t); onClose(); };
  return (
    <BottomSheet onClose={onClose} label="Comments" className="comments-sheet">
      <Comments videoId={videoId} owner={owner} initial={comments} onSeek={seek} />
    </BottomSheet>
  );
}
