import Link from 'next/link';
import { RouteChips } from '@/components/route-chips';
import { SignedOut } from '@/components/signed-out';
import { SubscribeButton } from '@/components/social';
import { Avatar, EmptyState } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { getMe } from '@/lib/server/auth';
import { subscriptions } from '@/lib/server/queries';

export const metadata = { title: 'All subscriptions' };

export default async function AllSubscriptions({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = 'relevant' } = await searchParams;
  const me = await getMe();
  if (!me) return <SignedOut icon="subscriptions" title="Your subscriptions" text="Sign in to manage the channels you follow." next="/feed/channels" />;
  let list = subscriptions(me.id);
  if (sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'new') list = [...list].sort((a, b) => (b.latest ?? 0) - (a.latest ?? 0));
  return (
    <div className="page-pad">
      <h1 className="page-title">All subscriptions</h1>
      <RouteChips param="sort" fallback="relevant" items={[{ id: 'relevant', label: 'Most relevant' }, { id: 'new', label: 'New activity' }, { id: 'az', label: 'A–Z' }]} />
      {list.length === 0 && <EmptyState icon="subscriptions" title="You haven’t subscribed to any channels" />}
      {list.map((c) => (
        <div key={c.id} className="channel-row">
          <Link href={`/${c.handle}`} className="pic"><Avatar channel={c} size={136} /></Link>
          <div className="info"><h3><Link href={`/${c.handle}`}>{c.name}</Link></h3><div className="muted small">{c.handle} · {formatCount(c.subscribers)} subscribers</div><p>{c.description}</p></div>
          <SubscribeButton channel={c} initial={{ subscribed: true, bell: c.bell }} />
        </div>
      ))}
    </div>
  );
}
