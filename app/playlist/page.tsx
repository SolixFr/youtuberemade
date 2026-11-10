import { SignedOut } from '@/components/signed-out';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { channelById, playlist } from '@/lib/server/queries';
import { PlaylistView } from './playlist-view';

export const metadata = { title: 'Playlist' };

export default async function PlaylistPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const { list = '' } = await searchParams;
  const me = await getMe();
  if ((list === 'WL' || list === 'LL') && !me) return <SignedOut icon="playlist_play" title="Your saved videos" text="Sign in to see your Watch later and Liked videos." next={`/playlist?list=${list}`} />;
  const p = playlist(list, me?.id);
  if (!p) return <EmptyState icon="playlist_remove" title="This playlist doesn’t exist or is private" />;
  const owner = channelById(p.ownerId)?.name ?? '';
  return (
    <div className="page-pad">
      <PlaylistView playlist={{ ...p, owner, editable: p.ownerId === me?.id }} />
    </div>
  );
}
