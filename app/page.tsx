import { ShortsShelf, VideoGrid } from '@/components/cards';
import { RouteChips } from '@/components/route-chips';
import { PostCard } from '@/components/social';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { feed, posts, topics } from '@/lib/server/queries';

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
  const homePosts = isAll ? posts(viewer, { limit: 4 }) : [];

  return (
    <>
      <RouteChips className="feed-chips" items={chips} />
      <div className="feed">
        {videos.length === 0 ? (
          <EmptyState icon="video_library" title="Nothing here yet" text={chip === 'watched' ? 'Videos you watch will show up here.' : 'Try another filter.'} />
        ) : (
          <>
            <VideoGrid videos={videos.slice(0, 6)} />
            <ShortsShelf videos={shorts} />
            {isAll && homePosts.length > 0 && <section className="shelf"><h2 className="shelf-title">Posts</h2>{homePosts.slice(0, 2).map((p) => <PostCard key={p.id} post={p} />)}</section>}
            {videos.length > 6 && <div className="grid-after"><VideoGrid videos={videos.slice(6)} /></div>}
          </>
        )}
      </div>
    </>
  );
}
