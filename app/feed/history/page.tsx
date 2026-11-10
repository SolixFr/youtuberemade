import { SignedOut } from '@/components/signed-out';
import { getMe } from '@/lib/server/auth';
import { history } from '@/lib/server/queries';
import { HistoryView } from './history-view';

export const metadata = { title: 'Watch history' };

export default async function HistoryPage() {
  const me = await getMe();
  if (!me) return <SignedOut icon="history" title="Keep track of what you watch" text="Watch history isn’t viewable when signed out." next="/feed/history" />;
  return <div className="page-pad"><HistoryView entries={history(me.id)} paused={me.settings.historyPaused} /></div>;
}
