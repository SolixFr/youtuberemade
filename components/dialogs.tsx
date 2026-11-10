'use client';

import { useState } from 'react';
import { createPlaylist, setInPlaylist, toggleWatchLater } from '@/lib/actions';
import { formatDuration } from '@/lib/format';
import { useDB, videoOf } from '@/lib/store';
import type { Visibility } from '@/lib/types';
import { useApp, type DialogState } from './app-context';
import { Button, Dialog, Field, Icon, useToast } from './ui';

function absolute(path: string) {
  return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();
}

function ShareDialog({ title, path, startAt, onClose }: { title: string; path: string; startAt?: number; onClose: () => void }) {
  const toast = useToast();
  const [withStart, setWithStart] = useState(false);
  const [embed, setEmbed] = useState(false);
  const base = absolute(path);
  const link = withStart && startAt ? `${base}${base.includes('?') ? '&' : '?'}t=${Math.floor(startAt)}` : base;
  const value = embed ? `<iframe width="560" height="315" src="${link}" title="${title.replace(/"/g, '&quot;')}" allowfullscreen></iframe>` : link;
  const targets = [
    { name: 'Email', icon: 'mail', href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(link)}` },
    { name: 'X', icon: 'alternate_email', href: `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(link)}` },
    { name: 'Reddit', icon: 'forum', href: `https://www.reddit.com/submit?url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}` },
    { name: 'WhatsApp', icon: 'chat', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${link}`)}` },
  ];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Link copied to clipboard');
    } catch {
      toast('Couldn’t copy. Select the link and copy it manually.');
    }
  };
  return (
    <Dialog title="Share" onClose={onClose} width={520}>
      <div className="share-targets">
        <button type="button" className="share-target" onClick={() => setEmbed(!embed)}><span className="share-circle"><Icon name="code" /></span>Embed</button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" className="share-target" onClick={() => navigator.share({ title, url: link }).catch(() => {})}><span className="share-circle"><Icon name="ios_share" /></span>More</button>
        )}
        {targets.map((t) => (
          <a key={t.name} className="share-target" href={t.href} target="_blank" rel="noopener noreferrer"><span className="share-circle"><Icon name={t.icon} /></span>{t.name}</a>
        ))}
      </div>
      <div className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
        <Button variant="blue" onClick={copy}>Copy</Button>
      </div>
      {startAt !== undefined && startAt > 1 && (
        <label className="check-row"><input type="checkbox" checked={withStart} onChange={(e) => setWithStart(e.target.checked)} />Start at {formatDuration(startAt)}</label>
      )}
    </Dialog>
  );
}

function SaveDialog({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const d = useDB();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [vis, setVis] = useState<Visibility>('private');
  const inWL = d.user.watchLater.includes(videoId);
  const visIcon = (v: Visibility) => (v === 'public' ? 'public' : v === 'unlisted' ? 'link' : 'lock');
  return (
    <Dialog title="Save video to..." onClose={onClose} width={320}>
      <label className="check-row">
        <input type="checkbox" checked={inWL} onChange={() => { const on = toggleWatchLater(videoId); toast(on ? 'Saved to Watch later' : 'Removed from Watch later'); }} />
        <span className="grow">Watch later</span><Icon name="lock" size={18} />
      </label>
      {d.playlists.map((p) => {
        const has = p.videoIds.includes(videoId);
        return (
          <label key={p.id} className="check-row">
            <input type="checkbox" checked={has} onChange={() => { setInPlaylist(p.id, videoId, !has); toast(`${has ? 'Removed from' : 'Saved to'} ${p.title}`); }} />
            <span className="grow">{p.title}</span><Icon name={visIcon(p.visibility)} size={18} />
          </label>
        );
      })}
      {creating ? (
        <div className="new-playlist">
          <Field label="Name" count={`${name.length}/150`}><input autoFocus maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter playlist name..." /></Field>
          <Field label="Privacy">
            <select value={vis} onChange={(e) => setVis(e.target.value as Visibility)}>
              <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
            </select>
          </Field>
          <div className="row-end"><Button variant="text" onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="text" className="text-blue" disabled={!name.trim()} onClick={() => { createPlaylist(name.trim(), vis, videoId); toast(`Saved to ${name.trim()}`); onClose(); }}>Create</Button></div>
        </div>
      ) : (
        <Button variant="tonal" icon="add" className="full" onClick={() => setCreating(true)}>New playlist</Button>
      )}
    </Dialog>
  );
}

const REPORT_REASONS = ['Sexual content', 'Violent or repulsive content', 'Hateful or abusive content', 'Harassment or bullying', 'Harmful or dangerous acts', 'Misinformation', 'Child abuse', 'Promotes terrorism', 'Spam or misleading', 'Legal issue'];
function ReportDialog({ what, onClose }: { what: string; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <Dialog title={`Thanks for reporting`} onClose={onClose} width={420} footer={<Button variant="text" className="text-blue" onClick={onClose}>Close</Button>}>
        <p className="muted">This demo runs entirely in your browser, so the report wasn’t sent anywhere. On a real service it would go to a review team.</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={`Report ${what}`} onClose={onClose} width={420}
      footer={<><Button variant="text" onClick={onClose}>Cancel</Button><Button variant="text" className="text-blue" disabled={!reason} onClick={() => setSent(true)}>Report</Button></>}>
      {REPORT_REASONS.map((r) => <label key={r} className="check-row"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Toggle play/pause', 'k'], ['Rewind 10 seconds', 'j'], ['Fast forward 10 seconds', 'l'], ['Seek backward 5 seconds', '←'],
  ['Seek forward 5 seconds', '→'], ['Volume up / down (player focused)', '↑ ↓'], ['Toggle mute', 'm'], ['Toggle full screen', 'f'],
  ['Toggle theater mode', 't'], ['Toggle miniplayer', 'i'], ['Toggle captions', 'c'], ['Seek to 0%–90%', '0–9'],
  ['Increase / decrease speed', '> <'], ['Next video', 'Shift + N'], ['Go to search box', '/'], ['Show keyboard shortcuts', 'Shift + ?'],
];
function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={480}>
      <table className="shortcuts">
        <tbody>{SHORTCUTS.map(([a, k]) => <tr key={a}><td>{a}</td><td><kbd>{k}</kbd></td></tr>)}</tbody>
      </table>
    </Dialog>
  );
}

function ClipDialog({ videoId, at, onClose }: { videoId: string; at: number; onClose: () => void }) {
  const d = useDB();
  const app = useApp();
  const v = videoOf(d, videoId);
  const [start, setStart] = useState(Math.max(0, Math.floor(at)));
  const [length, setLength] = useState(15);
  const [title, setTitle] = useState('');
  if (!v) return null;
  const end = Math.min(v.duration, start + length);
  return (
    <Dialog title="Create clip" onClose={onClose} width={460}
      footer={<><Button variant="text" onClick={onClose}>Cancel</Button><Button variant="blue" disabled={!title.trim() || end - start < 5}
        onClick={() => app.open({ kind: 'share', title: `${title.trim()} — ${v.title}`, path: `/watch?v=${v.id}&clip=${start}-${end}` })}>Share clip</Button></>}>
      <p className="muted small">A clip link plays {formatDuration(start)}–{formatDuration(end)} of the video on a loop.</p>
      <Field label="Title" count={`${title.length}/140`}><input autoFocus maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title (required)" /></Field>
      <div className="two-fields">
        <Field label="Start (seconds)"><input type="number" min={0} max={Math.max(0, v.duration - 5)} value={start} onChange={(e) => setStart(Math.max(0, Number(e.target.value)))} /></Field>
        <Field label="Length (5–60 s)"><input type="number" min={5} max={60} value={length} onChange={(e) => setLength(Math.max(5, Math.min(60, Number(e.target.value))))} /></Field>
      </div>
    </Dialog>
  );
}

export function GlobalDialogs({ dialog }: { dialog: DialogState }) {
  const { close } = useApp();
  switch (dialog.kind) {
    case 'share': return <ShareDialog {...dialog} onClose={close} />;
    case 'save': return <SaveDialog videoId={dialog.videoId} onClose={close} />;
    case 'report': return <ReportDialog what={dialog.what} onClose={close} />;
    case 'shortcuts': return <ShortcutsDialog onClose={close} />;
    case 'clip': return <ClipDialog videoId={dialog.videoId} at={dialog.at} onClose={close} />;
    default: return null;
  }
}
