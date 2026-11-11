'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ago } from '@/components/ago';
import { Avatar, ConfirmDialog, Icon, IconButton, Button, Field, useToast } from '@/components/ui';
import { deleteVideoAdmin, resolveReport, setOwnSubscribers, setUserRole } from '@/lib/actions/admin';
import { formatCount, formatDate } from '@/lib/format';

export function AdminDemoTools({ subscribers }: { subscribers: number }) {
  const toast = useToast();
  const router = useRouter();
  const [value, setValue] = useState(String(subscribers));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await setOwnSubscribers(Number(value));
      if (!r.ok) return toast(r.error);
      toast('Subscribers updated');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="muted small">Admin & demo only: set your own subscriber count to try the Stories gate (10,000+), monetization thresholds, and perk bars.</p>
      <Field label="Subscribers"><input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      <div className="btn-row"><Button variant="blue" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button></div>
    </div>
  );
}

export interface AdminUser {
  id: string; handle: string; name: string; avatar: string | null; role: 'user' | 'admin';
  subscribers: number; created_at: number; has_password: number; videos: number;
}

export function AdminUsersTable({ users, meId }: { users: AdminUser[]; meId: string }) {
  const toast = useToast();
  const router = useRouter();
  const setRole = async (u: AdminUser) => {
    const r = await setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin');
    if (!r.ok) return toast(r.error);
    toast(u.role === 'admin' ? `${u.name} is no longer an admin` : `${u.name} is now an admin`);
    router.refresh();
  };
  return (
    <div className="table-wrap">
      <table className="s-table">
        <thead><tr><th>User</th><th>Role</th><th className="hide-m">Subscribers</th><th className="hide-m">Videos</th><th className="hide-m">Joined</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><div className="s-video">
                <Link href={`/${u.handle}`}><Avatar channel={u} size={36} /></Link>
                <div><b><Link href={`/${u.handle}`}>{u.name}</Link></b><span className="muted">{u.handle}{!u.has_password && ' · demo channel'}</span></div>
              </div></td>
              <td><span className={`role-chip ${u.role}`}>{u.role === 'admin' && <Icon name="shield" size={14} />}{u.role}</span></td>
              <td className="hide-m">{formatCount(u.subscribers)}</td>
              <td className="hide-m">{u.videos.toLocaleString()}</td>
              <td className="hide-m">{formatDate(u.created_at)}</td>
              <td><div className="s-tools always">
                {u.id !== meId && <IconButton icon={u.role === 'admin' ? 'person_remove' : 'admin_panel_settings'} size={32}
                  label={u.role === 'admin' ? 'Remove admin' : 'Make admin'} onClick={() => setRole(u)} />}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface AdminVideo {
  id: string; title: string; type: 'video' | 'short'; visibility: 'public' | 'unlisted' | 'private';
  views: number; thumbnail: string; published_at: number; ch_handle: string; ch_name: string;
}

export function AdminVideosTable({ videos }: { videos: AdminVideo[] }) {
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState<AdminVideo | null>(null);
  const remove = async (v: AdminVideo) => {
    const r = await deleteVideoAdmin(v.id);
    if (!r.ok) return toast(r.error);
    setConfirm(null);
    toast(`Deleted “${v.title}”`);
    router.refresh();
  };
  return (
    <div className="table-wrap">
      <table className="s-table">
        <thead><tr><th>Video</th><th>Channel</th><th>Visibility</th><th className="hide-m">Views</th><th className="hide-m">Published</th><th /></tr></thead>
        <tbody>
          {videos.map((v) => (
            <tr key={v.id}>
              <td><div className="s-video">
                <Link href={v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}`}>
                  <span className={`thumb ${v.type === 'short' ? 'vertical' : ''}`}><img src={v.thumbnail} alt="" /></span>
                </Link>
                <div><b><Link href={v.type === 'short' ? `/shorts/${v.id}` : `/watch?v=${v.id}`}>{v.title}</Link></b></div>
              </div></td>
              <td><Link href={`/${v.ch_handle}`}>{v.ch_name}</Link></td>
              <td><span className="vis"><Icon name={v.visibility === 'public' ? 'public' : v.visibility === 'unlisted' ? 'link' : 'lock'} size={18} />{v.visibility}</span></td>
              <td className="hide-m">{formatCount(v.views)}</td>
              <td className="hide-m">{formatDate(v.published_at)}</td>
              <td><div className="s-tools always"><IconButton icon="delete" size={32} label="Delete video" onClick={() => setConfirm(v)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {confirm && (
        <ConfirmDialog title={`Delete “${confirm.title}”?`} text="The video, its file and its comments are deleted for everyone. This can’t be undone." confirm="Delete forever"
          onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} />
      )}
    </div>
  );
}

export interface AdminReport {
  id: string; kind: 'video' | 'comment' | 'channel' | 'post'; target_id: string; reason: string;
  resolved: number; created_at: number; reporter: string | null;
  video_id?: string | null; ch_handle?: string | null;
}

export function AdminReportsTable({ reports }: { reports: AdminReport[] }) {
  const toast = useToast();
  const router = useRouter();
  const resolve = async (r: AdminReport, state: boolean) => {
    const res = await resolveReport(r.id, state);
    if (!res.ok) return toast(res.error);
    router.refresh();
  };
  const href = (r: AdminReport) => r.kind === 'video' ? `/watch?v=${r.target_id}`
    : r.kind === 'comment' ? (r.video_id ? `/watch?v=${r.video_id}` : undefined)
    : r.kind === 'post' ? `/post/${r.target_id}`
      : r.ch_handle ? `/${r.ch_handle}` : undefined;
  return (
    <div className="table-wrap">
      <table className="s-table">
        <thead><tr><th>Reason</th><th>Target</th><th className="hide-m">Reported by</th><th className="hide-m">When</th><th>Status</th><th /></tr></thead>
        <tbody>
          {reports.map((r) => {
            const to = href(r);
            return (
              <tr key={r.id} className={r.resolved ? 'resolved' : ''}>
                <td>{r.reason}</td>
                <td>{to ? <Link href={to} className="link">{r.kind}</Link> : r.kind}{r.kind === 'channel' && r.ch_handle ? <span className="muted"> · {r.ch_handle}</span> : ''}</td>
                <td className="hide-m">{r.reporter ? `@${r.reporter}` : <span className="muted">Signed out</span>}</td>
                <td className="hide-m"><Ago ts={r.created_at} /></td>
                <td><span className={`report-state ${r.resolved ? 'done' : 'open'}`}>{r.resolved ? 'Resolved' : 'Open'}</span></td>
                <td><div className="s-tools always">
                  <IconButton icon={r.resolved ? 'undo' : 'check'} size={32} label={r.resolved ? 'Reopen' : 'Resolve'} onClick={() => resolve(r, !r.resolved)} />
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
