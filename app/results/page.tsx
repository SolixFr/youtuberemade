import Link from 'next/link';
import { ListCard, ShortsShelf } from '@/components/cards';
import { SearchFilters } from '@/components/search-filters';
import { PostCard, SubscribeButton } from '@/components/social';
import { Avatar, EmptyState } from '@/components/ui';
import { formatCount } from '@/lib/format';
import { getMe } from '@/lib/server/auth';
import { posts, searchChannels, searchVideos, subscriptionState } from '@/lib/server/queries';

const AGES: Record<string, number> = { hour: 3_600_000, today: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
type Search = Promise<{ search_query?: string; type?: string; date?: string; duration?: string; sort?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }) {
  const { search_query: q = '' } = await searchParams;
  return { title: q || 'Search' };
}

export default async function Results({ searchParams }: { searchParams: Search }) {
  const { search_query: raw = '', type = '', date = '', duration = '', sort = '' } = await searchParams;
  const q = raw.slice(0, 100).trim();
  const me = await getMe();
  const videos = q ? searchVideos(q, me?.id, { type: type === 'video' || type === 'short' ? type : undefined, date: AGES[date], duration, sort }) : [];
  const longs = videos.filter((v) => v.type === 'video');
  const shorts = videos.filter((v) => v.type === 'short');
  const channels = q && (!type || type === 'channel') ? searchChannels(q, me?.id) : [];
  const found = q && (!type || type === 'post') ? posts(me?.id, { q, limit: type ? 30 : 1 }) : [];
  const nothing = !videos.length && !channels.length && !found.length;

  return (
    <div className="page-pad results">
      <SearchFilters />
      {channels.map((c) => (
        <div key={c.id} className="channel-row">
          <Link href={`/${c.handle}`} className="pic"><Avatar channel={c} size={136} /></Link>
          <div className="info"><h3><Link href={`/${c.handle}`}>{c.name}</Link></h3><div className="muted small">{c.handle} · {formatCount(c.subscribers)} subscribers</div><p>{c.description}</p></div>
          <SubscribeButton channel={c} initial={subscriptionState(me?.id, c.id)} />
        </div>
      ))}
      {(!type || type === 'video') && longs.slice(0, type ? undefined : 2).map((v) => <ListCard key={v.id} v={v} />)}
      {!type && <ShortsShelf videos={shorts.slice(0, 4)} />}
      {type === 'short' && <div className="shorts-row">{shorts.map((v) => <ListCard key={v.id} v={v} small />)}</div>}
      {found.map((p) => <PostCard key={p.id} post={p} />)}
      {!type && longs.slice(2).map((v) => <ListCard key={v.id} v={v} />)}
      {nothing && <EmptyState icon="search_off" title={q ? 'No results found' : 'Search for something'} text={q ? 'Try different keywords or remove search filters' : undefined} />}
    </div>
  );
}
