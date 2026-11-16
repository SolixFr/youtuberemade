'use client';

import { useEffect, useState } from 'react';
import { channelSubs } from '@/lib/actions/channels';
import { formatCount } from '@/lib/format';
import { VerifiedBadge } from './cards';

/** Channel header title + subs line. The count ticks live so the verified check
    appears the moment the channel crosses 50,000 subscribers — no refresh needed. */
export function ChannelLiveHead({ id, name, handle, pronouns, videos, initialSubs, initialVerified }: {
  id: string; name: string; handle: string; pronouns: string; videos: number; initialSubs: number; initialVerified: boolean;
}) {
  const [subs, setSubs] = useState(initialSubs);
  useEffect(() => {
    let alive = true;
    const poll = () => channelSubs(id).then((r) => {
      if (!alive || !r.ok) return;
      setSubs((prev) => (prev === r.data.subscribers ? prev : r.data.subscribers));
    });
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  const verified = initialVerified || subs >= 50_000;
  return (
    <>
      <h1>{name}{verified && <VerifiedBadge size={24} tip={false} />}</h1>
      <div className="ch-line"><span>{handle}</span>{pronouns && <> · {pronouns}</>} · {formatCount(subs)} subscribers · {videos} video{videos === 1 ? '' : 's'}</div>
    </>
  );
}
