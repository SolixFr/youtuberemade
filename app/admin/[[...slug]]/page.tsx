import Link from 'next/link';
import { EmptyState, Icon } from '@/components/ui';
import { adminReports, adminStats, adminUsers, adminVideos } from '@/lib/actions/admin';
import { demoTools, getMe } from '@/lib/server/auth';
import { AdminDemoTools, AdminReportsTable, AdminUsersTable, AdminVideosTable } from './admin-parts';

const NAV = [['', 'dashboard', 'Overview'], ['users', 'group', 'Users'], ['videos', 'smart_display', 'Videos'], ['reports', 'flag', 'Reports']] as const;

export const metadata = { title: 'Admin panel' };

export default async function AdminPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const [section = ''] = slug;
  const me = await getMe();
  if (me?.role !== 'admin') return <EmptyState icon="admin_panel_settings" title="Admins only" text="This area is for accounts with the admin role." />;
  const [stats, users, videos, reports] = await Promise.all([adminStats(), adminUsers(), adminVideos(), adminReports()]);
  if (!stats.ok || !users.ok || !videos.ok || !reports.ok) return <EmptyState icon="error" title="Couldn’t load the admin panel" />;

  const open = reports.data.filter((r) => !r.resolved).length;
  let body: React.ReactNode;
  if (section === 'users') body = <AdminUsersTable users={users.data} meId={me.id} />;
  else if (section === 'videos') body = <AdminVideosTable videos={videos.data} />;
  else if (section === 'reports') body = reports.data.length ? <AdminReportsTable reports={reports.data} /> : <EmptyState icon="flag" title="No reports" text="Reports filed by users show up here." />;
  else body = (
    <div className="dash">
      <section className="s-card">
        <h2>Users</h2>
        <div className="big">{stats.data.users.toLocaleString()}</div>
        <p className="muted small">Registered accounts, including demo channels without passwords.</p>
        <Link className="btn btn-text btn-md link" href="/admin/users">Manage users</Link>
      </section>
      <section className="s-card">
        <h2>Videos & Shorts</h2>
        <div className="s-row"><span>Videos</span><b>{stats.data.videos.toLocaleString()}</b></div>
        <div className="s-row"><span>Shorts</span><b>{stats.data.shorts.toLocaleString()}</b></div>
        <Link className="btn btn-text btn-md link" href="/admin/videos">Manage videos</Link>
      </section>
      <section className="s-card">
        <h2>Content</h2>
        <div className="s-row"><span>Comments</span><b>{stats.data.comments.toLocaleString()}</b></div>
        <div className="s-row"><span>Active stories</span><b>{stats.data.stories.toLocaleString()}</b></div>
      </section>
      <section className="s-card">
        <h2>Reports</h2>
        <div className="big">{stats.data.openReports.toLocaleString()}</div>
        <p className="muted small">Open reports waiting for review.</p>
        <Link className="btn btn-text btn-md link" href="/admin/reports">Review reports</Link>
      </section>
      {demoTools() && (
        <section className="s-card">
          <h2>Demo tools</h2>
          <AdminDemoTools subscribers={me.subscribers} />
        </section>
      )}
    </div>
  );

  return (
    <div className="studio">
      <nav className="studio-nav" aria-label="Admin sections">
        {NAV.map(([k, icon, label]) => (
          <Link key={k} href={`/admin${k ? `/${k}` : ''}`} className={`studio-link ${section === k ? 'on' : ''}`}>
            <Icon name={icon} filled={section === k} />
            <span>{label}</span>
            {k === 'reports' && open > 0 && <span className="admin-count">{open}</span>}
          </Link>
        ))}
      </nav>
      <div className="studio-main">
        <h1>Admin panel</h1>
        {body}
      </div>
    </div>
  );
}
