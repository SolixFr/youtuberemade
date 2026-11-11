'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { dismissNotification, loadNotifications, markNotificationsRead } from '@/lib/actions/account';
import { Ago } from '@/components/ago';
import { Avatar, Icon, IconButton, Spinner } from '@/components/ui';
import { SignedOut } from '@/components/signed-out';
import { useApp } from '@/components/app-context';
import type { Notification } from '@/lib/types';

/** Full-page notification list — the sidebar's destination for the bell. */
export default function NotificationsView() {
  const app = useApp();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);
  const marked = useRef(false);

  useEffect(() => {
    if (!app.me) return;
    let alive = true;
    const load = () => {
      void loadNotifications().then((r) => {
        if (!alive || !r.ok) return;
        setItems(r.data);
        // Everything is marked read when the page opens; polling keeps the list fresh.
        if (!marked.current) {
          marked.current = true;
          const unread = r.data.filter((n) => !n.read).map((n) => n.key);
          if (unread.length) { setItems(r.data.map((n) => ({ ...n, read: true }))); void markNotificationsRead(unread).then(() => router.refresh()); }
        }
      });
    };
    load();
    const t = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.me]);

  if (!app.me) return <SignedOut icon="notifications" title="Notifications" text="Sign in to get updates from your subscriptions." next="/feed/notifications" />;

  const open = (n: Notification) => {
    if (n.href.startsWith('story:')) app.openStory(n.channel.id);
    else router.push(n.href);
  };
  const dismiss = (n: Notification) => {
    setItems((x) => (x ?? []).filter((y) => y.key !== n.key));
    void dismissNotification(n.key).then(() => router.refresh());
  };

  return (
    <div className="feed notif-page">
      <h1 className="notif-title">Notifications</h1>
      {items === null && <div className="center-pad"><Spinner /></div>}
      {items?.length === 0 && (
        <div className="notif-empty">
          <Icon name="notifications" size={96} />
          <h3>Your notifications live here</h3>
          <p className="muted">Subscribe to your favorite channels to hear about their latest videos.</p>
        </div>
      )}
      <ul className="notif-list">
        {items?.map((n) => (
          <li key={n.key} className={`notif ${n.read ? '' : 'unread'}`} role="link" tabIndex={0}
            onClick={() => open(n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(n); } }}>
            <Avatar channel={n.channel} size={48} />
            <div className="notif-text">{n.text}<small><Ago ts={n.at} /></small></div>
            {n.thumbnail && <img src={n.thumbnail} alt="" className="notif-thumb" loading="lazy" />}
            <IconButton icon="close" label="Hide this notification" onClick={(e) => { e.stopPropagation(); dismiss(n); }} />
          </li>
        ))}
      </ul>
    </div>
  );
}
