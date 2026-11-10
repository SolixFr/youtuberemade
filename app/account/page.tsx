'use client';

import { useState } from 'react';
import { Button, ConfirmDialog, Switch, useToast } from '@/components/ui';
import { clearMedia } from '@/lib/media';
import { getDB, myChannel, resetDB, STORY_MIN_SUBS, update, useDB } from '@/lib/store';
import type { BellLevel, Theme } from '@/lib/types';

export default function AccountPage() {
  const d = useDB();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const me = myChannel(d);
  const exportData = () => {
    const blob = new Blob([JSON.stringify(getDB(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vidora-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="page-pad" style={{ maxWidth: 900 }}>
      <h1 className="page-title">Settings</h1>
      <section className="settings-card">
        <h2>Account</h2>
        <div className="settings-row"><span>Channel</span><span className="muted">{me.name} ({me.handle})</span></div>
        <div className="settings-row"><span>Subscribers</span><span className="muted">{me.subscribers.toLocaleString()}</span></div>
        <div className="settings-row"><span>Stories</span><span className="muted">{me.subscribers >= STORY_MIN_SUBS ? 'Available' : `Unlocks at ${STORY_MIN_SUBS.toLocaleString()} subscribers`}</span></div>
      </section>
      <section className="settings-card">
        <h2>Appearance</h2>
        {(['system', 'dark', 'light'] as Theme[]).map((t) => (
          <label key={t} className="radio-row"><input type="radio" name="theme" checked={d.user.theme === t} onChange={() => update((db) => { db.user.theme = t; })} />{t === 'system' ? 'Use device theme' : `${t[0].toUpperCase()}${t.slice(1)} theme`}</label>
        ))}
      </section>
      <section className="settings-card">
        <h2>Playback</h2>
        <div className="settings-row"><span>Autoplay the next video</span><Switch label="Autoplay" on={d.user.autoplay} onChange={(v) => update((db) => { db.user.autoplay = v; })} /></div>
        <div className="settings-row"><span>Save watch history</span><Switch label="Watch history" on={!d.user.historyPaused} onChange={(v) => update((db) => { db.user.historyPaused = !v; })} /></div>
      </section>
      <section className="settings-card" id="notifications">
        <h2>Notifications</h2>
        <p className="muted small">Choose which subscribed channels can notify you. Notifications show new uploads, posts and stories.</p>
        {d.user.subscriptions.map((id) => d.channels[id]).filter(Boolean).map((c) => (
          <div key={c.id} className="settings-row"><span>{c.name}</span>
            <select className="input" value={d.user.bells[c.id] ?? 'personalized'} onChange={(e) => update((db) => { db.user.bells[c.id] = e.target.value as BellLevel; })}>
              <option value="all">All</option><option value="personalized">Personalized</option><option value="none">None</option>
            </select>
          </div>
        ))}
      </section>
      <section className="settings-card">
        <h2>Your data</h2>
        <p className="muted small">Everything you do here is stored in this browser: app data in localStorage, uploaded files in IndexedDB. Nothing is sent to a server.</p>
        <div className="row-wrap" style={{ marginTop: 16 }}>
          <Button icon="download" onClick={exportData}>Export data (JSON)</Button>
          <Button icon="restart_alt" onClick={() => setConfirm(true)}>Reset everything</Button>
        </div>
      </section>
      {confirm && <ConfirmDialog title="Reset all data?" text="This deletes your uploads, posts, stories, playlists and history from this browser." confirm="Reset" onClose={() => setConfirm(false)}
        onConfirm={async () => { await clearMedia(); resetDB(); toast('All data was reset'); }} />}
    </div>
  );
}
