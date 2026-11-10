import { ShortsShelf, VideoGrid } from '@/components/cards';
import { RouteChips } from '@/components/route-chips';
import { StoriesRow } from '@/components/stories';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { feed, storyShelf, topics } from '@/lib/server/queries';

export default async function Home({ searchParams }: { searchParams: Promise<{ chip?: string }> }) {
  const { chip = 'all' } = await searchParams;
  const me = await getMe();
  const viewer = me?.id;
  const allTopics = topics();
  const chips = [
    { id: 'all', label: 'All' },
    ...allTopics.map((t) => ({ id: `t:${t}`, label: t })),
    { id: 'recent', label: 'Recently uploaded' },
    ...(me ? [{ id: 'watched', label: 'Watched' }, { id: 'new', label: 'New to you' }] : []),
  ];
  const videos = feed(viewer, {
    type: 'video',
    topic: chip.startsWith('t:') ? chip.slice(2) : undefined,
    order: chip === 'recent' ? 'recent' : 'trending',
    watched: chip === 'watched' && !!me,
    fresh: chip === 'new' && !!me,
  });
  const isAll = chip === 'all';
  const shorts = isAll ? feed(viewer, { type: 'short', limit: 6 }) : [];
  const stories = isAll ? storyShelf(viewer) : [];

  return (
    <>
      <RouteChips className="feed-chips" items={chips} />
      <div className="feed">
        {isAll && <div className="mobile-only-block"><StoriesRow groups={stories} /></div>}
        {videos.length === 0 ? (
          <EmptyState icon="video_library" title="Nothing here yet" text={chip === 'watched' ? 'Videos you watch will show up here.' : 'Try another filter.'} />
        ) : (
          <>
            <VideoGrid videos={videos.slice(0, 6)} />
            <ShortsShelf videos={shorts} />
            {isAll && stories.length > 0 && <div className="shelf desktop-only-block"><StoriesRow groups={stories} /></div>}
            {videos.length > 6 && <div className="grid-after"><VideoGrid videos={videos.slice(6)} /></div>}
          </>
        )}
      </div>
    </>
  );
}
