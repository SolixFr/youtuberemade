import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { feed, getVideo, viewerState } from '@/lib/server/queries';
import { ShortsView } from './shorts-view';

export const metadata = { title: 'Shorts' };

export default async function ShortsPage({ params }: { params: Promise<{ id?: string[] }> }) {
  const { id } = await params;
  const me = await getMe();
  const start = id?.[0] ? getVideo(id[0], me?.id) : null;
  const rest = feed(me?.id, { type: 'short', order: 'recent', limit: 40 }).filter((v) => v.id !== start?.id);
  const list = start?.type === 'short' ? [start, ...rest] : rest;
  if (!list.length) return <EmptyState icon="video_library" title="No Shorts yet" text="Upload a vertical video to see it here." />;
  return <ShortsView shorts={list.map((v) => ({ video: v, state: viewerState(v, me?.id) }))} />;
}
