'use client';

import { useState } from 'react';
import { Ago } from '@/components/ago';
import { useApp } from '@/components/app-context';
import { Avatar, Button, MemberBadge, useToast } from '@/components/ui';
import { commentOnPost } from '@/lib/actions/social';
import type { PostComment } from '@/lib/types';

export function PostComments({ postId, initial }: { postId: string; initial: PostComment[] }) {
  const app = useApp();
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="post-comments">
      <h2 className="sec-title">{list.length} Comment{list.length === 1 ? '' : 's'}</h2>
      <div className="c-composer">
        <Avatar channel={app.me} name="?" size={40} />
        <div className="c-field">
          <textarea className="line-input" rows={1} maxLength={5000} value={text} placeholder="Add a comment…"
            onFocus={() => app.requireAuth('Sign in to comment', () => {})} onChange={(e) => setText(e.target.value)} />
          <div className="c-actions">
            <Button variant="blue" disabled={!text.trim() || busy} onClick={async () => {
              setBusy(true);
              const r = await commentOnPost(postId, text);
              setBusy(false);
              if (!r.ok) return toast(r.error === 'auth' ? 'Sign in to comment' : r.error);
              setList(r.data);
              setText('');
            }}>Comment</Button>
          </div>
        </div>
      </div>
      {list.map((c) => (
        <div key={c.id} className="comment">
          <Avatar name={c.author.name} src={c.author.avatar} size={40} />
          <div className="c-body"><div className="c-who"><span>{c.author.handle}</span>{c.author.membership && <MemberBadge tier={c.author.membership.tier} name={c.author.membership.name} />}<span className="c-when"><Ago ts={c.createdAt} /></span></div><div className="c-text">{c.text}</div></div>
        </div>
      ))}
    </section>
  );
}
