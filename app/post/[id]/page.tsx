'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PostCard } from '@/components/social';
import { Avatar, Button, EmptyState } from '@/components/ui';
import { timeAgo, uid } from '@/lib/format';
import { myChannel, update, useDB } from '@/lib/store';

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const d = useDB();
  const [text, setText] = useState('');
  const p = d.posts.find((x) => x.id === id);
  if (!p) return <EmptyState icon="edit_note" title="This post isn’t available" />;
  const me = myChannel(d);
  const comments = d.postComments.filter((c) => c.postId === id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="page-pad" style={{ maxWidth: 900, paddingTop: 24 }}>
      <PostCard p={p} />
      <h2 className="sec-head" style={{ fontSize: 20, fontWeight: 700 }}>{comments.length} Comments</h2>
      <div className="c-composer pad-m">
        <Avatar channel={me} size={40} />
        <div className="c-field">
          <textarea className="line-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment..." />
          <div className="c-actions"><Button variant="blue" disabled={!text.trim()}
            onClick={() => { update((db) => { db.postComments.push({ id: uid('pc'), postId: id, author: me.handle, mine: true, text: text.trim(), createdAt: Date.now() }); }); setText(''); }}>Comment</Button></div>
        </div>
      </div>
      <div className="pad-m">
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <Avatar channel={c.mine ? me : undefined} name={c.author} size={40} />
            <div className="c-body"><div className="c-who"><span>{c.author}</span><span className="c-when">{timeAgo(c.createdAt)}</span></div><div className="c-text">{c.text}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
