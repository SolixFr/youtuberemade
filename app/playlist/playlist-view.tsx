'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ago } from '@/components/ago';
import { useApp } from '@/components/app-context';
import { ChannelName, Thumbnail, VideoMenuButton } from '@/components/cards';
import { Button, ConfirmDialog, Dialog, EmptyState, Field, Icon, useToast } from '@/components/ui';
import { deletePlaylist, removeFromList, updatePlaylist } from '@/lib/actions/videos';
import {formatCount } from '@/lib/format';
import type { Video, Visibility } from '@/lib/types';

interface PlaylistData {
  id: string; title: string; description: string; visibility: Visibility; updatedAt: number | null; owner: string; editable: boolean; videos: Video[];
}

export function PlaylistView({ playlist }: { playlist: PlaylistData }) {
  const app = useApp();
  const router = useRouter();
  const toast = useToast();
  const [videos, setVideos] = useState(playlist.videos);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(playlist.title);
  const [desc, setDesc] = useState(playlist.description);
  const [vis, setVis] = useState<Visibility>(playlist.visibility);
  const custom = playlist.id !== 'WL' && playlist.id !== 'LL';
  const cover = videos[0]?.thumbnail;

  const play = (shuffle: boolean) => {
    if (!videos.length) return;
    const order = shuffle ? [...videos].sort(() => Math.random() - 0.5) : videos;
    if (shuffle) app.setQueue(order.slice(1).map((v) => ({ id: v.id, title: v.title })));
    router.push(`/watch?v=${order[0].id}${shuffle ? '' : `&list=${playlist.id}`}`);
  };

  return (
    <div className="two-col">
      <aside className="side">
        <div className="pl-hero">
          <div className="pl-hero-bg">{cover && <img src={cover} alt="" />}</div>
          <div className="thumb">{cover ? <img src={cover} alt="" /> : <span className="img-placeholder" />}</div>
          <h1>{playlist.title}</h1>
          <div className="pl-meta">
            <b>{playlist.owner}</b>
            <span><Icon name={playlist.visibility === 'public' ? 'public' : playlist.visibility === 'unlisted' ? 'link' : 'lock'} size={14} className="inline-icon" /> {playlist.visibility[0].toUpperCase() + playlist.visibility.slice(1)} · {videos.length} video{videos.length === 1 ? '' : 's'}{playlist.updatedAt ? <> · Updated <Ago ts={playlist.updatedAt} /></> : ''}</span>
            {playlist.description && <span>{playlist.description}</span>}
          </div>
          <div className="pl-buttons">
            <Button variant="filled" icon="play_arrow" disabled={!videos.length} onClick={() => play(false)}>Play all</Button>
            <Button icon="shuffle" disabled={!videos.length} onClick={() => play(true)}>Shuffle</Button>
          </div>
          {custom && (
            <div className="pl-buttons">
              <Button icon="share" aria-label="Share" onClick={() => app.open({ kind: 'share', title: playlist.title, path: `/playlist?list=${playlist.id}` })} />
              {playlist.editable && <Button icon="edit" aria-label="Edit playlist" onClick={() => setEditing(true)} />}
              {playlist.editable && <Button icon="delete" aria-label="Delete playlist" onClick={() => setConfirm(true)} />}
            </div>
          )}
        </div>
      </aside>
      <div className="main">
        {!videos.length && <EmptyState icon="playlist_play" title="No videos in this playlist yet" text={playlist.id === 'WL' ? 'Use “Save to Watch later” on any video.' : undefined} />}
        {videos.map((v, i) => (
          <div key={v.id} className="pl-row" onClick={() => router.push(`/watch?v=${v.id}&list=${playlist.id}`)}>
            <span className="idx">{i + 1}</span>
            <Link href={`/watch?v=${v.id}&list=${playlist.id}`} onClick={(e) => e.stopPropagation()} tabIndex={-1}><Thumbnail v={v} actions={false} /></Link>
            <div className="pl-text">
              <h3 className="v-title">{v.title}</h3>
              <div className="v-sub"><ChannelName channel={v.channel} /> · {formatCount(v.views)} views · <Ago ts={v.publishedAt} /></div>
            </div>
            <VideoMenuButton v={v} extra={playlist.editable ? [{ icon: 'delete', label: `Remove from ${playlist.title}`, onSelect: async () => {
              setVideos((x) => x.filter((y) => y.id !== v.id));
              const r = await removeFromList(playlist.id, v.id);
              toast(r.ok ? `Removed from ${playlist.title}` : r.error);
            } }] : []} />
          </div>
        ))}
      </div>
      {editing && (
        <Dialog title="Edit playlist" onClose={() => setEditing(false)} width={460}
          footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="blue" disabled={!title.trim()} onClick={async () => {
            const r = await updatePlaylist(playlist.id, { title, description: desc, visibility: vis });
            if (!r.ok) return toast(r.error);
            close();
            router.refresh();
          }}>Save</Button></>}>
          <Field label="Title" count={`${title.length}/150`}><input maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description"><textarea rows={3} maxLength={5000} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Visibility"><select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></Field>
        </Dialog>
      )}
      {confirm && <ConfirmDialog title="Delete playlist" text={`Delete “${playlist.title}”? The videos stay available.`} onClose={() => setConfirm(false)}
        onConfirm={async () => { await deletePlaylist(playlist.id); router.push('/feed/playlists'); router.refresh(); }} />}
    </div>
  );
}
