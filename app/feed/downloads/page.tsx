'use client';

import { ListCard } from '@/components/cards';
import { EmptyState } from '@/components/ui';
import { update, useDB, videoOf } from '@/lib/store';

export default function DownloadsPage() {
  const d = useDB();
  const vids = d.user.downloads.map((id) => videoOf(d, id)).filter((v): v is NonNullable<typeof v> => !!v);
  return (
    <div className="page-pad">
      <h1 className="page-title">Downloads</h1>
      <p className="muted pad-m" style={{ marginBottom: 16 }}>Videos you’ve saved to this device with the Download button. The files are in your browser’s downloads folder.</p>
      {vids.length === 0 ? <EmptyState icon="download" title="No downloads yet" text="Use Download under a video to save its file." /> :
        vids.map((v) => <ListCard key={v.id} v={v} extraMenu={[{ icon: 'delete', label: 'Remove from this list', onSelect: () => update((db) => { db.user.downloads = db.user.downloads.filter((x) => x !== v.id); }) }]} />)}
    </div>
  );
}
