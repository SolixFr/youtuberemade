import Link from 'next/link';
import type { PlaylistSummary } from '@/lib/types';
import { Icon } from './ui';

export function PlaylistTile({ p }: { p: PlaylistSummary }) {
  const vis = p.visibility[0].toUpperCase() + p.visibility.slice(1);
  return (
    <Link href={`/playlist?list=${p.id}`} className="card">
      <div className="thumb">
        {p.thumbnail ? <img src={p.thumbnail} alt="" loading="lazy" decoding="async" /> : <span className="img-placeholder" />}
        <span className="duration"><Icon name="playlist_play" size={14} className="inline-icon" /> {p.count} video{p.count === 1 ? '' : 's'}</span>
      </div>
      <div className="card-meta">
        <div className="card-text">
          <h3 className="v-title">{p.title}</h3>
          <div className="v-sub">{vis} · Playlist</div>
          <div className="v-sub">View full playlist</div>
        </div>
      </div>
    </Link>
  );
}
