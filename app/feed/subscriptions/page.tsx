'use client';

import Link from 'next/link';
import { ShortsShelf, VideoCard } from '@/components/cards';
import { PostCard } from '@/components/social';
import { StoriesRow } from '@/components/stories';
import { Avatar, EmptyState, useIsMobile } from '@/components/ui';
import { feedVideos, useDB } from '@/lib/store';

export default function Subscriptions() {
  const d = useDB();
  const mobile = useIsMobile();
  const subs = d.user.subscriptions;
  const all = feedVideos(d).filter((v) => subs.includes(v.channelId)).sort((a, b) => b.publishedAt - a.publishedAt);
  const videos = all.filter((v) => v.type === 'video');
  const shorts = all.filter((v) => v.type === 'short').slice(0, mobile ? 4 : 6);
  const latestPost = d.posts.filter((p) => subs.includes(p.channelId)).sort((a, b) => b.createdAt - a.createdAt)[0];

  if (!subs.length) {
    return <EmptyState icon="subscriptions" title="Don’t miss new videos" text="Subscribe to channels to see their latest videos here." action={<Link href="/" className="btn btn-tonal btn-md">Explore videos</Link>} />;
  }
  return (
    <div className="feed">
      {mobile && (
        <div className="stories-row pad-m" style={{ paddingTop: 12 }}>
          {subs.map((id) => d.channels[id]).filter(Boolean).map((c) => (
            <Link key={c.id} href={`/${c.handle}`} className="story-bubble"><Avatar channel={c} size={48} /><span className="story-name">{c.name}</span></Link>
          ))}
        </div>
      )}
      <StoriesRow />
      <div className="sec-head"><h2>Latest</h2><Link href="/feed/channels" className="btn btn-text btn-md link">Manage</Link></div>
      <div className="grid">{videos.slice(0, mobile ? 3 : 6).map((v) => <VideoCard key={v.id} v={v} />)}</div>
      <ShortsShelf videos={shorts} />
      {latestPost && <div className="shelf pad-m"><h2 className="shelf-title">Posts</h2><PostCard p={latestPost} /></div>}
      {videos.length > 6 && <div className="grid" style={{ paddingTop: 24 }}>{videos.slice(mobile ? 3 : 6).map((v) => <VideoCard key={v.id} v={v} />)}</div>}
    </div>
  );
}
