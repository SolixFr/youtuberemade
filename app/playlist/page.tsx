'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { ChannelName, Thumbnail, VideoMenuButton } from '@/components/cards';
import { Button, ConfirmDialog, Dialog, EmptyState, Field, Icon, MediaImg, useToast } from '@/components/ui';
import { formatCount, timeAgo } from '@/lib/format';
import { myChannel, update, useDB, videoOf } from '@/lib/store';
import type { Visibility } from '@/lib/types';

export default function PlaylistPage() {
  const params = useSearchParams();
  const id = params.get('list') ?? '';
  const d = useDB();
  const app = useApp();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const custom = d.playlists.find((p) => p.id === id);
  const special = id === 'WL' ? { title: 'Watch later', ids: d.user.watchLater } : id === 'LL' ? { title: 'Liked videos', ids: d.user.liked } : null;
  const [title, setTitle] = useState(custom?.title ?? '');
  const [desc, setDesc] = useState(custom?.description ?? '');
  const [vis, setVis] = useState<Visibility>(custom?.visibility ?? 'private');
  if (!custom && !special) return <EmptyState icon="playlist_remove" title="This playlist doesn’t exist" />;
  const name = custom?.title ?? special!.title;
  const ids = custom?.videoIds ?? special!.ids;
  const vids = ids.map((x) => videoOf(d, x)).filter((v): v is NonNullable<typeof v> => !!v);
  const visibility = custom?.visibility ?? 'private';
  const updated = custom?.updatedAt;

  const play = (shuffle: boolean) => {
    if (!vids.length) return;
    const order = shuffle ? [...vids].sort(() => Math.random() - 0.5) : vids;
    if (shuffle) app.setQueue(order.slice(1).map((v) => v.id));
    router.push(`/watch?v=${order[0].id}${shuffle ? '' : `&list=${id}`}`);
  };
  const removeFrom = (videoId: string) => update((db) => {
    if (id === 'WL') db.user.watchLater = db.user.watchLater.filter((x) => x !== videoId);
    else if (id === 'LL') {
      db.user.liked = db.user.liked.filter((x) => x !== videoId);
      const v = db.videos.find((x) => x.id === videoId);
      if (v) v.likes--;
    } else {
      const p = db.playlists.find((x) => x.id === id);
      if (p) { p.videoIds = p.videoIds.filter((x) => x !== videoId); p.updatedAt = Date.now(); }
    }
  });

  return (
    <div className="page-pad">
      <div className="two-col">
        <aside className="side">
          <div className="pl-hero">
            <div className="pl-hero-bg">{vids[0] && <MediaImg src={vids[0].thumbnail} />}</div>
            <div className="thumb">{vids[0] ? <MediaImg src={vids[0].thumbnail} /> : <span className="img-placeholder" />}</div>
            <h1>{name}</h1>
            <div className="pl-meta">
              <b>{myChannel(d).name}</b>
              <span><Icon name={visibility === 'public' ? 'public' : visibility === 'unlisted' ? 'link' : 'lock'} size={14} style={{ verticalAlign: -2 }} /> {visibility[0].toUpperCase() + visibility.slice(1)} · {vids.length} video{vids.length === 1 ? '' : 's'}{updated ? ` · Updated ${timeAgo(updated)}` : ''}</span>
              {custom?.description && <span>{custom.description}</span>}
            </div>
            <div className="pl-buttons">
              <Button variant="filled" icon="play_arrow" disabled={!vids.length} onClick={() => play(false)}>Play all</Button>
              <Button variant="tonal" icon="shuffle" disabled={!vids.length} onClick={() => play(true)}>Shuffle</Button>
            </div>
            {custom && (
              <div className="pl-buttons">
                <Button variant="tonal" icon="share" aria-label="Share" onClick={() => app.open({ kind: 'share', title: name, path: `/playlist?list=${id}` })} />
                <Button variant="tonal" icon="edit" aria-label="Edit" onClick={() => setEditing(true)} />
                <Button variant="tonal" icon="delete" aria-label="Delete playlist" onClick={() => setConfirm(true)} />
              </div>
            )}
          </div>
        </aside>
        <div className="main">
          {!vids.length && <EmptyState icon="playlist_play" title="No videos in this playlist yet" text={id === 'WL' ? 'Use “Save to Watch later” on any video.' : undefined} />}
          {vids.map((v, i) => (
            <div key={v.id} className="pl-row" onClick={() => router.push(`/watch?v=${v.id}&list=${id}`)}>
              <span className="idx">{i + 1}</span>
              <Link href={`/watch?v=${v.id}&list=${id}`} onClick={(e) => e.stopPropagation()}><Thumbnail v={v} overlayActions={false} /></Link>
              <div className="pl-text">
                <h3 className="v-title">{v.title}</h3>
                <div className="v-sub"><ChannelName channelId={v.channelId} /> · {formatCount(v.views)} views · {timeAgo(v.publishedAt)}</div>
              </div>
              <VideoMenuButton v={v} extra={[{ icon: 'delete', label: `Remove from ${name}`, onSelect: () => { removeFrom(v.id); toast(`Removed from ${name}`); } }]} />
            </div>
          ))}
        </div>
      </div>
      {editing && custom && (
        <Dialog title="Edit playlist" onClose={() => setEditing(false)} width={460}
          footer={<><Button variant="text" onClick={() => setEditing(false)}>Cancel</Button><Button variant="blue" disabled={!title.trim()}
            onClick={() => { update((db) => { const p = db.playlists.find((x) => x.id === id); if (p) { p.title = title.trim(); p.description = desc; p.visibility = vis; p.updatedAt = Date.now(); } }); setEditing(false); }}>Save</Button></>}>
          <Field label="Title" count={`${title.length}/150`}><input maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description"><textarea rows={3} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Visibility"><select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></Field>
        </Dialog>
      )}
      {confirm && <ConfirmDialog title="Delete playlist" text={`Are you sure you want to delete “${name}”?`} onClose={() => setConfirm(false)}
        onConfirm={() => { update((db) => { db.playlists = db.playlists.filter((p) => p.id !== id); }); router.push('/feed/playlists'); }} />}
    </div>
  );
}
