'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { submitReport } from '@/lib/actions/admin';
import { createPlaylist, getPlaylistMembership, setInPlaylist } from '@/lib/actions/videos';
import { formatDuration } from '@/lib/format';
import type { Visibility } from '@/lib/types';
import { useApp, type DialogState } from './app-context';
import { Button, Dialog, Dropdown, Field, Icon, Spinner, useToast, VISIBILITY_ITEMS } from './ui';

const absolute = (path: string) => new URL(path, window.location.origin).toString();

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
  const copy = () => navigator.clipboard.writeText(value).then(() => toast('Link copied to clipboard'), () => toast('Couldnâ€™t copy. Select the link and copy it manually.'));
  return (
    <Dialog title="Share" onClose={onClose} width={520}>
      <div className="share-targets">
        <button type="button" className={`share-target ${embed ? 'on' : ''}`} onClick={() => setEmbed(!embed)}><span className="share-circle"><Icon name="code" /></span>Embed</button>
        {'share' in navigator && (
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
  const toast = useToast();
  const [state, setState] = useState<{ watchLater: boolean; lists: { id: string; title: string; visibility: Visibility; has: boolean }[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [vis, setVis] = useState<Visibility>('private');
  useEffect(() => {
    getPlaylistMembership(videoId).then((r) => r.ok && setState(r.data));
  }, [videoId]);
  const toggle = async (id: string, title: string, on: boolean) => {
    setState((s) => s && (id === 'WL' ? { ...s, watchLater: on } : { ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, has: on } : l)) }));
    const r = await setInPlaylist(id, videoId, on);
    toast(r.ok ? `${on ? 'Saved to' : 'Removed from'} ${title}` : r.error);
  };
  const visIcon = (v: Visibility) => (v === 'public' ? 'public' : v === 'unlisted' ? 'link' : 'lock');
  return (
    <Dialog title="Save video toâ€¦" onClose={onClose} width={340}>
      {(close) => !state ? <div className="center-pad"><Spinner /></div> : (
        <>
          <label className="check-row"><input type="checkbox" checked={state.watchLater} onChange={(e) => toggle('WL', 'Watch later', e.target.checked)} /><span className="grow">Watch later</span><Icon name="lock" size={18} /></label>
          {state.lists.map((p) => (
            <label key={p.id} className="check-row"><input type="checkbox" checked={p.has} onChange={(e) => toggle(p.id, p.title, e.target.checked)} /><span className="grow">{p.title}</span><Icon name={visIcon(p.visibility)} size={18} /></label>
          ))}
          {creating ? (
            <form className="new-playlist" onSubmit={async (e) => {
              e.preventDefault();
              const r = await createPlaylist(name, vis, videoId);
              if (!r.ok) return toast(r.error);
              toast(`Saved to ${name.trim()}`);
              close();
            }}>
              <Field label="Name" count={`${name.length}/150`}><input autoFocus maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter playlist nameâ€¦" /></Field>
              <Field label="Visibility">
                 <Dropdown value={vis} onChange={setVis} items={VISIBILITY_ITEMS} label="Visibility" />
              </Field>
              <div className="row-end"><Button variant="text" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="text" className="text-blue" disabled={!name.trim()}>Create</Button></div>
            </form>
          ) : <Button icon="add" className="full" onClick={() => setCreating(true)}>New playlist</Button>}
        </>
      )}
    </Dialog>
  );
}

const REPORT_REASONS = ['Sexual content', 'Violent or repulsive content', 'Hateful or abusive content', 'Harassment or bullying', 'Harmful or dangerous acts', 'Misinformation', 'Spam or misleading', 'Legal issue'];
function ReportDialog({ what, targetId, onClose }: { what: string; targetId: string; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (close: () => void) => {
    if (!reason) return;
    const r = await submitReport(what as 'video' | 'comment' | 'channel' | 'post', targetId, reason);
    if (!r.ok) return toast(r.error);
    setSent(true);
  };
  if (sent) {
    return (
      <Dialog title="Report received" onClose={onClose} width={420} footer={(close) => <Button variant="text" className="text-blue" onClick={close}>Close</Button>}>
        <p className="muted">Thanks â€” an admin will review it. Reports are queued in the admin panel.</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={`Report ${what}`} onClose={onClose} width={420}
      footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="text" className="text-blue" disabled={!reason} onClick={() => submit(close)}>Report</Button></>}>
      {REPORT_REASONS.map((r) => <label key={r} className="check-row"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Play / pause', 'k'], ['Rewind 10 seconds', 'j'], ['Forward 10 seconds', 'l'], ['Seek 5 seconds', 'â† â†’'],
  ['Volume (player focused)', 'â†‘ â†“'], ['Mute', 'm'], ['Full screen', 'f'], ['Theater mode', 't'], ['Miniplayer', 'i'],
  ['Captions', 'c'], ['Seek to 0%â€“90%', '0â€“9'], ['Playback speed', '< >'], ['Next video', 'Shift + N'], ['Search', '/'], ['This list', '?'],
];
function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width={460}>
      <table className="shortcuts"><tbody>{SHORTCUTS.map(([a, k]) => <tr key={a}><td>{a}</td><td><kbd>{k}</kbd></td></tr>)}</tbody></table>
    </Dialog>
  );
}

function ClipDialog({ videoId, at, duration, title: videoTitle, onClose }: { videoId: string; at: number; duration: number; title: string; onClose: () => void }) {
  const app = useApp();
  const [start, setStart] = useState(Math.max(0, Math.floor(at)));
  const [length, setLength] = useState(15);
  const [title, setTitle] = useState('');
  const end = Math.min(duration, start + length);
  return (
    <Dialog title="Create clip" onClose={onClose} width={460}
      footer={(close) => <><Button variant="text" onClick={close}>Cancel</Button><Button variant="blue" disabled={!title.trim() || end - start < 5}
        onClick={() => app.open({ kind: 'share', title: `${title.trim()} â€” ${videoTitle}`, path: `/watch?v=${videoId}&clip=${start}-${end}` })}>Share clip</Button></>}>
      <p className="muted small">The link plays {formatDuration(start)}â€“{formatDuration(end)} on a loop.</p>
      <Field label="Title" count={`${title.length}/140`}><input maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a title (required)" /></Field>
      <div className="two-fields">
        <Field label="Start (seconds)"><input type="number" min={0} max={Math.max(0, duration - 5)} value={start} onChange={(e) => setStart(Math.max(0, Number(e.target.value)))} /></Field>
        <Field label="Length (5â€“60 s)"><input type="number" min={5} max={60} value={length} onChange={(e) => setLength(Math.max(5, Math.min(60, Number(e.target.value))))} /></Field>
      </div>
    </Dialog>
  );
}

function SignInDialog({ reason, onClose }: { reason: string; onClose: () => void }) {
  const path = usePathname();
  return (
    <Dialog title={reason} onClose={onClose} width={400}
      footer={(close) => <><Button variant="text" onClick={close}>Not now</Button><Link className="btn btn-blue btn-md" href={`/signin?next=${encodeURIComponent(path)}`} onClick={close}>Sign in</Link></>}>
      <p className="muted">Sign in or create an account to like, comment, subscribe, upload and send messages.</p>
    </Dialog>
  );
}

export function GlobalDialogs({ dialog }: { dialog: DialogState }) {
  const { close } = useApp();
  switch (dialog.kind) {
    case 'share': return <ShareDialog {...dialog} onClose={close} />;
    case 'save': return <SaveDialog videoId={dialog.videoId} onClose={close} />;
    case 'report': return <ReportDialog what={dialog.what} targetId={dialog.targetId} onClose={close} />;
    case 'shortcuts': return <ShortcutsDialog onClose={close} />;
    case 'clip': return <ClipDialog {...dialog} onClose={close} />;
    case 'signin': return <SignInDialog reason={dialog.reason} onClose={close} />;
    default: return null;
  }
}
