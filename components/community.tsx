'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from './app-context';
import { PostCard } from './social';
import { Avatar, Button, Chips, Icon, IconButton, useToast } from './ui';
import { createPost } from '@/lib/actions/social';
import { uploadFile } from '@/lib/upload-client';
import type { Channel, Post } from '@/lib/types';

/** The channel community hub — shows the public community feed: header, owner composer, Top/Newest/My posts. */
export function CommunityHub({ channel, mine, posts, membershipsEnabled }: { channel: Channel; mine: boolean; posts: Post[]; membershipsEnabled: boolean }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const meId = app.me?.id;
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [membersOnly, setMembersOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'top' | 'newest' | 'mine'>('top');
  const [descOpen, setDescOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = [...posts]
    .sort((a, b) => (tab === 'newest' ? b.createdAt - a.createdAt : b.likes - a.likes))
    .filter((p) => (tab === 'mine' ? meId != null && p.channel.id === meId : true));

  const publish = async () => {
    setBusy(true);
    try {
      const imageId = image ? await uploadFile(image, 'image').promise : null;
      const r = await createPost({ text, image: imageId, membersOnly });
      if (!r.ok) return toast(r.error);
      setText('');
      setImage(null);
      setMembersOnly(false);
      toast('Post published. Your community will see it in their feeds.');
      router.refresh();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const blurb = channel.description || 'Your community is a space for you and your viewers to start discussions and connect.';
  const long = blurb.length > 90;
  const canPost = (text.trim() || !!image) && !busy;

  return (
    <div className="community-hub">
      <div className="community-head">
        <div className="community-avatar">
          <Avatar channel={channel} size={160} />
        </div>
        <div className="community-info">
          <h1 className="community-title">{channel.name}’s Community</h1>
          <div className="community-sub">Public</div>
          <p className={`community-blurb ${descOpen ? 'open' : ''}`} onClick={() => !descOpen && setDescOpen(true)}>
            {blurb}
            {long && !descOpen && <button type="button" className="more" onClick={(e) => { e.stopPropagation(); setDescOpen(true); }}>…more</button>}
          </p>
          {mine && <Link href="/studio/customization" className="btn btn-outline btn-md community-settings">Community settings</Link>}
        </div>
      </div>

      {mine && (
        <div className="community-composer">
          <div className="cc-who">
            <Avatar channel={channel} size={32} />
            <span className="cc-name">{channel.name}</span>
            <span className="cc-pills">
              <span className="cc-pill"><Icon name="group" size={16} />My Community</span>
              {membershipsEnabled && <span className="cc-pill"><Icon name={membersOnly ? 'loyalty' : 'public'} size={16} />{membersOnly ? 'Members only' : 'Public'}</span>}
            </span>
          </div>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What’s on your mind?" aria-label="Write to your community" />
          <div className="community-composer-foot">
            <label className={`cc-image ${image ? 'on' : ''}`}><Icon name="image" size={18} />{image ? 'Image added' : 'Image'}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
            {membershipsEnabled && (
              <button type="button" role="switch" aria-checked={membersOnly} className={`cc-members ${membersOnly ? 'on' : ''}`} onClick={() => setMembersOnly((v) => !v)}>
                <Icon name="loyalty" size={18} />Members only
              </button>
            )}
            <span className="grow" />
            <Button variant="blue" size="md" disabled={!canPost} onClick={publish}>{busy ? 'Posting…' : 'Post'}</Button>
          </div>
        </div>
      )}

      <Chips items={[{ id: 'top', label: 'Top' }, { id: 'newest', label: 'Newest' }, ...(mine ? [{ id: 'mine' as const, label: 'My posts' }] : [])]} value={tab} onChange={setTab} className="community-tabs" />

      {filtered.length ? (
        <div className="community-feed">
          {filtered.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      ) : (
        <div className="community-empty">
          <span className="community-empty-icon"><Icon name="edit_note" size={56} /></span>
          <h2>Publish post</h2>
          <p className="muted">Posts appear here after you publish and will be visible to your community.</p>
        </div>
      )}
    </div>
  );
}
