'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { applyTheme } from '@/components/chrome';
import { Button, Switch, useToast } from '@/components/ui';
import { signOut } from '@/lib/actions/auth';
import { setBell, updateSettings } from '@/lib/actions/channels';
import type { BellLevel, Me, MessagePolicy, Theme } from '@/lib/types';

export function SettingsView({ me, subscriptions }: { me: Me; subscriptions: { id: string; name: string; bell: BellLevel }[] }) {
  const toast = useToast();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(me.settings.theme);
  const [autoplay, setAutoplay] = useState(me.settings.autoplay);
  const [history, setHistory] = useState(!me.settings.historyPaused);
  const [policy, setPolicy] = useState<MessagePolicy>(me.settings.messagePolicy);
  const save = async (input: Parameters<typeof updateSettings>[0]) => {
    const r = await updateSettings(input);
    toast(r.ok ? 'Settings saved' : r.error);
  };
  return (
    <>
      <section className="settings-card">
        <h2>Account</h2>
        <div className="settings-row"><span>Channel</span><span className="muted">{me.name} ({me.handle})</span></div>
        <div className="settings-row"><span>Subscribers</span><span className="muted">{me.subscribers.toLocaleString()}</span></div>
        <div className="settings-row"><span>Stories</span><span className="muted">{me.subscribers >= 10_000 ? 'Available' : 'Unlocks at 10,000 subscribers'}</span></div>
        <div className="settings-row"><span>Session</span><Button size="sm" icon="logout" onClick={async () => { await signOut(); router.push('/'); router.refresh(); }}>Sign out</Button></div>
      </section>
      <section className="settings-card">
        <h2>Appearance</h2>
        {(['system', 'dark', 'light'] as Theme[]).map((t) => (
          <label key={t} className="radio-row"><input type="radio" name="theme" checked={theme === t} onChange={() => { setTheme(t); applyTheme(t); }} />{t === 'system' ? 'Use device theme' : `${t[0].toUpperCase()}${t.slice(1)} theme`}</label>
        ))}
      </section>
      <section className="settings-card">
        <h2>Playback and history</h2>
        <div className="settings-row"><span>Autoplay the next video</span><Switch label="Autoplay" on={autoplay} onChange={(v) => { setAutoplay(v); void save({ autoplay: v }); }} /></div>
        <div className="settings-row"><span>Save watch history</span><Switch label="Watch history" on={history} onChange={(v) => { setHistory(v); void save({ historyPaused: !v }); }} /></div>
      </section>
      <section className="settings-card">
        <h2>Messages</h2>
        <p className="muted small">Who can start a conversation with you.</p>
        {([['everyone', 'Everyone with an account'], ['subscriptions', 'Only channels I subscribe to'], ['none', 'No one']] as const).map(([k, label]) => (
          <label key={k} className="radio-row"><input type="radio" name="policy" checked={policy === k} onChange={() => { setPolicy(k); void save({ messagePolicy: k }); }} />{label}</label>
        ))}
      </section>
      <section className="settings-card" id="notifications">
        <h2>Notifications</h2>
        <p className="muted small">Uploads, posts and stories from these channels appear in your notifications.</p>
        {subscriptions.length === 0 && <p className="muted">You’re not subscribed to any channels yet.</p>}
        {subscriptions.map((c) => (
          <div key={c.id} className="settings-row"><span>{c.name}</span>
            <select className="input" defaultValue={c.bell} onChange={(e) => { void setBell(c.id, e.target.value as BellLevel); toast('Saved'); }} aria-label={`Notifications from ${c.name}`}>
              <option value="all">All</option><option value="personalized">Personalized</option><option value="none">None</option>
            </select>
          </div>
        ))}
      </section>
    </>
  );
}
