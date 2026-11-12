'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Dialog, Dropdown, Field, useToast, VISIBILITY_ITEMS } from '@/components/ui';
import { createPlaylist } from '@/lib/actions/videos';
import type { Visibility } from '@/lib/types';

export function NewPlaylistButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState<Visibility>('private');
  return (
    <>
      <Button icon="add" onClick={() => setOpen(true)}>New playlist</Button>
      {open && (
        <Dialog title="New playlist" onClose={() => setOpen(false)} width={420}
          footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="blue" disabled={!title.trim()} onClick={async () => {
            const r = await createPlaylist(title, vis);
            if (!r.ok) return toast(r.error);
            close();
            setTitle('');
            router.refresh();
          }}>Create</Button></>}>
          <Field label="Title" count={`${title.length}/150`}><input maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Visibility"><Dropdown value={vis} onChange={setVis} items={VISIBILITY_ITEMS} label="Visibility" /></Field>
        </Dialog>
      )}
    </>
  );
}

