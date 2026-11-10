import Link from 'next/link';
import { VideoCard } from '@/components/cards';
import { PlaylistTile } from '@/components/library';
import { SignedOut } from '@/components/signed-out';
import { Avatar, Icon } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { history, likedIds, playlists, videosByIds, watchLaterIds } from '@/lib/server/queries';
import type { PlaylistSummary, Video } from '@/lib/types';

export const metadata = { title: 'You' };

function Row({ title, href, videos }: { title: string; href: string; videos: Video[] }) {
  return (
    <section>
      <div className="sec-head"><h2>{title}</h2>{videos.length > 0 && <Link className="btn btn-outline btn-sm btn-plain" href={href}>View all</Link>}</div>
      {videos.length ? <div className="hscroll">{videos.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div> : <p className="muted pad-m">Nothing here yet.</p>}
    </section>
  );
}

export default async function YouPage() {
  const me = await getMe();
  if (!me) return <SignedOut icon="video_library" title="Enjoy your favorite videos" text="Sign in to see your history, playlists and saved videos." next="/feed/you" />;
  const wl = watchLaterIds(me.id);
  const ll = likedIds(me.id);
  const lists: PlaylistSummary[] = [
    { id: 'WL', title: 'Watch later', visibility: 'private', count: wl.length, thumbnail: videosByIds(wl.slice(0, 1), me.id)[0]?.thumbnail ?? null, updatedAt: 0 },
    { id: 'LL', title: 'Liked videos', visibility: 'private', count: ll.length, thumbnail: videosByIds(ll.slice(0, 1), me.id)[0]?.thumbnail ?? null, updatedAt: 0 },
    ...playlists(me.id),
  ];
  return (
    <div className="page-pad you-page">
      <div className="you-head">
        <Avatar channel={me} size={120} />
        <div>
          <h1>{me.name}</h1>
          <div className="muted">{me.handle} · <Link href={`/${me.handle}`} className="link">View channel</Link></div>
          <div className="btn-row">
            <Link href="/studio" className="btn btn-tonal btn-sm"><Icon name="video_settings" size={20} />Vidora Studio</Link>
            <Link href="/messages" className="btn btn-tonal btn-sm"><Icon name="chat" size={20} />Messages</Link>
          </div>
        </div>
      </div>
      <Row title="History" href="/feed/history" videos={history(me.id).map((h) => h.video).filter((v) => v.type === 'video')} />
      <section>
        <div className="sec-head"><h2>Playlists</h2><Link className="btn btn-outline btn-sm btn-plain" href="/feed/playlists">View all</Link></div>
        <div className="hscroll">{lists.map((p) => <PlaylistTile key={p.id} p={p} />)}</div>
      </section>
      <Row title="Watch later" href="/playlist?list=WL" videos={videosByIds(wl, me.id)} />
      <Row title="Liked videos" href="/playlist?list=LL" videos={videosByIds(ll, me.id)} />
    </div>
  );
}
