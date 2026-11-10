import { SignedOut } from '@/components/signed-out';
import { getMe } from '@/lib/server/auth';
import { subscriptions } from '@/lib/server/queries';
import { SettingsView } from './settings-view';

export const metadata = { title: 'Settings' };

export default async function AccountPage() {
  const me = await getMe();
  if (!me) return <SignedOut icon="settings" title="Settings" text="Sign in to manage your account, privacy and notifications." next="/account" />;
  return (
    <div className="page-pad narrow">
      <h1 className="page-title">Settings</h1>
      <SettingsView me={me} subscriptions={subscriptions(me.id).map((c) => ({ id: c.id, name: c.name, bell: c.bell }))} />
    </div>
  );
}
