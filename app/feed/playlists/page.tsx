'use client';

import { useState } from 'react';
import { PlaylistTile, playlistCards } from '@/components/library';
import { Button, Dialog, Field } from '@/components/ui';
import { createPlaylist } from '@/lib/actions';
import { useDB } from '@/lib/store';
import type { Visibility } from '@/lib/types';

export default function PlaylistsPage() {
  const d = useDB();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState<Visibility>('private');
  return (
    <div className="page-pad">
      <div className="sec-head" style={{ padding: 0 }}>
        <h1 className="page-title">Playlists</h1>
        <Button icon="add" onClick={() => setOpen(true)}>New playlist</Button>
      </div>
      <div className="grid">{playlistCards(d).map((p) => <PlaylistTile key={p.id} {...p} />)}</div>
      {open && (
        <Dialog title="New playlist" onClose={() => setOpen(false)} width={420}
          footer={<><Button variant="text" onClick={() => setOpen(false)}>Cancel</Button><Button variant="blue" disabled={!title.trim()} onClick={() => { createPlaylist(title.trim(), vis); setOpen(false); setTitle(''); }}>Create</Button></>}>
          <Field label="Title" count={`${title.length}/150`}><input autoFocus maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Visibility"><select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></Field>
        </Dialog>
      )}
    </div>
  );
}
