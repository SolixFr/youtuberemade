import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { comments, getVideo, liveSessionForVideo, playlist, related, viewerState, watermarkOf } from '@/lib/server/queries';
import { WatchView } from './watch-view';
import { LiveTheater } from './live-theater';

type Search = Promise<{ v?: string; list?: string; t?: string; clip?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { v } = await searchParams;
  const me = await getMe();
  const video = v ? getVideo(v, me?.id) : null;
  return video ? { title: video.title, description: video.description.slice(0, 160) } : { title: 'Video unavailable' };
}

export default async function WatchPage({ searchParams }: { searchParams: Search }) {
  const { v, list, t, clip } = await searchParams;
  const me = await getMe();
  const video = v ? getVideo(v, me?.id) : null;
  if (!video) {
    return <EmptyState icon="error" title="This video isn’t available anymore" action={<Link href="/" className="btn btn-tonal btn-md">Go to home</Link>} />;
  }
  const live = liveSessionForVideo(video.id);
  if (live) {
    return <LiveTheater video={video} me={me ? { id: me.id, name: me.name, handle: me.handle } : null} />;
  }
  const pl = list ? playlist(list, me?.id) : null;
  const range = clip?.match(/^(\d+)-(\d+)$/);
  return (
    <WatchView
      key={video.id}
      video={video}
      state={viewerState(video, me?.id)}
      comments={comments(video.id, me?.id)}
      related={related(video, me?.id)}
      playlist={pl ? { id: pl.id, title: pl.title, videos: pl.videos } : null}
      startAt={t ? Number(t) : video.progress}
      clip={range && Number(range[2]) > Number(range[1]) ? { start: Number(range[1]), end: Number(range[2]) } : undefined}
      autoplayNext={me?.settings.autoplay ?? true}
      watermark={watermarkOf(video.channel.id)}
    />
  );
}
