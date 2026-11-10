import { PlaylistTile } from '@/components/library';
import { SignedOut } from '@/components/signed-out';
import { getMe } from '@/lib/server/auth';
import { likedIds, playlists, videosByIds, watchLaterIds } from '@/lib/server/queries';
import { NewPlaylistButton } from './new-playlist';

export const metadata = { title: 'Playlists' };

export default async function PlaylistsPage() {
  const me = await getMe();
  if (!me) return <SignedOut icon="playlist_play" title="Save videos for later" text="Sign in to create and manage playlists." next="/feed/playlists" />;
  const wl = watchLaterIds(me.id);
  const ll = likedIds(me.id);
  const cover = (ids: string[]) => videosByIds(ids.slice(0, 1), me.id)[0]?.thumbnail ?? null;
  const lists = [
    { id: 'WL', title: 'Watch later', visibility: 'private' as const, count: wl.length, thumbnail: cover(wl), updatedAt: 0 },
    { id: 'LL', title: 'Liked videos', visibility: 'private' as const, count: ll.length, thumbnail: cover(ll), updatedAt: 0 },
    ...playlists(me.id),
  ];
  return (
    <div className="page-pad">
      <div className="sec-head"><h1 className="page-title">Playlists</h1><NewPlaylistButton /></div>
      <div className="grid">{lists.map((p) => <PlaylistTile key={p.id} p={p} />)}</div>
    </div>
  );
}
