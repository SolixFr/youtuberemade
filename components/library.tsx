'use client';

import Link from 'next/link';
import { useDB, videoOf } from '@/lib/store';
import type { DB } from '@/lib/types';
import { Icon, MediaImg } from './ui';

export function playlistCards(d: DB) {
  return [
    { id: 'WL', title: 'Watch later', ids: d.user.watchLater, vis: 'Private' },
    { id: 'LL', title: 'Liked videos', ids: d.user.liked, vis: 'Private' },
    ...d.playlists.map((p) => ({ id: p.id, title: p.title, ids: p.videoIds, vis: p.visibility[0].toUpperCase() + p.visibility.slice(1) })),
  ];
}

export function PlaylistTile({ id, title, ids, vis }: { id: string; title: string; ids: string[]; vis: string }) {
  const d = useDB();
  const first = videoOf(d, ids[0]);
  return (
    <Link href={`/playlist?list=${id}`} className="card">
      <div className="thumb">
        {first ? <MediaImg src={first.thumbnail} /> : <span className="img-placeholder" />}
        <span className="duration"><Icon name="playlist_play" size={14} style={{ verticalAlign: -2 }} /> {ids.length} video{ids.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card-meta"><div className="card-text"><h3 className="v-title">{title}</h3><div className="v-sub">{vis} · Playlist</div><div className="v-sub">View full playlist</div></div></div>
    </Link>
  );
}
