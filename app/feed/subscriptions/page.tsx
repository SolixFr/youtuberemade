import Link from 'next/link';
import { ShortsShelf, VideoGrid } from '@/components/cards';
import { SignedOut } from '@/components/signed-out';
import { PostCard } from '@/components/social';
import { StoriesRow } from '@/components/stories';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { feed, posts, storyShelf, subscriptions } from '@/lib/server/queries';

export const metadata = { title: 'Subscriptions' };

export default async function Subscriptions() {
  const me = await getMe();
  if (!me) return <SignedOut icon="subscriptions" title="Don’t miss new videos" text="Sign in to see updates from your favorite channels." next="/feed/subscriptions" />;
  const subs = subscriptions(me.id).map((c) => c.id);
  if (!subs.length) {
    return <EmptyState icon="subscriptions" title="Don’t miss new videos" text="Subscribe to channels to see their latest videos here." action={<Link href="/" className="btn btn-tonal btn-md">Explore videos</Link>} />;
  }
  const videos = feed(me.id, { type: 'video', channels: subs, order: 'recent' });
  const shorts = feed(me.id, { type: 'short', channels: subs, order: 'recent', limit: 6 });
  const latestPost = posts(me.id, { channels: subs, limit: 1 })[0];
  return (
    <div className="feed">
      <StoriesRow groups={storyShelf(me.id)} />
      <div className="sec-head"><h2>Latest</h2><Link href="/feed/channels" className="btn btn-text btn-md link">Manage</Link></div>
      <VideoGrid videos={videos.slice(0, 6)} />
      <ShortsShelf videos={shorts} />
      {latestPost && <div className="shelf"><h2 className="shelf-title">Posts</h2><PostCard post={latestPost} /></div>}
      {videos.length > 6 && <div className="grid-after"><VideoGrid videos={videos.slice(6)} /></div>}
    </div>
  );
}
