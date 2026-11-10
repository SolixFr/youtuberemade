'use client';

import Link from 'next/link';
import { useApp } from '@/components/app-context';
import { VideoCard } from '@/components/cards';
import { PlaylistTile, playlistCards } from '@/components/library';
import { Avatar, Icon } from '@/components/ui';
import { myChannel, useDB, videoOf } from '@/lib/store';

export default function YouPage() {
  const d = useDB();
  const app = useApp();
  const me = myChannel(d);
  const history = d.user.history.map((h) => videoOf(d, h.videoId)).filter((v): v is NonNullable<typeof v> => !!v && v.type === 'video').slice(0, 12);
  const row = (title: string, href: string, ids: string[]) => {
    const vids = ids.map((id) => videoOf(d, id)).filter((v): v is NonNullable<typeof v> => !!v);
    return (
      <>
        <div className="sec-head"><h2>{title}</h2>{vids.length > 0 && <Link className="btn btn-outline btn-sm" style={{ color: 'var(--text)' }} href={href}>View all</Link>}</div>
        {vids.length ? <div className="hscroll">{vids.slice(0, 12).map((v) => <VideoCard key={v.id} v={v} />)}</div> : <p className="muted pad-m">Nothing here yet.</p>}
      </>
    );
  };
  return (
    <div className="page-pad you-page">
      <div className="you-head">
        <Avatar channel={me} size={120} />
        <div>
          <h1>{me.name}</h1>
          <div className="muted">{me.handle} · <Link href={`/${me.handle}`} className="link">View channel</Link></div>
          <div className="row-wrap">
            <Link href="/studio" className="btn btn-tonal btn-sm"><Icon name="video_settings" size={20} />Vidora Studio</Link>
            <button type="button" className="btn btn-tonal btn-sm" onClick={() => app.open({ kind: 'story' })}><Icon name="add_circle" size={20} />Create story</button>
          </div>
        </div>
      </div>
      <div className="sec-head"><h2>History</h2>{history.length > 0 && <Link className="btn btn-outline btn-sm" style={{ color: 'var(--text)' }} href="/feed/history">View all</Link>}</div>
      {history.length ? <div className="hscroll">{history.map((v) => <VideoCard key={v.id} v={v} />)}</div> : <p className="muted pad-m">Videos you watch will appear here.</p>}
      <div className="sec-head"><h2>Playlists</h2><Link className="btn btn-outline btn-sm" style={{ color: 'var(--text)' }} href="/feed/playlists">View all</Link></div>
      <div className="hscroll">{playlistCards(d).map((p) => <PlaylistTile key={p.id} {...p} />)}</div>
      {row('Watch later', '/playlist?list=WL', d.user.watchLater)}
      {row('Liked videos', '/playlist?list=LL', d.user.liked)}
    </div>
  );
}
