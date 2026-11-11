'use client';

import { useState, useId, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Dialog, Icon, useToast } from '@/components/ui';
import { setEarnNotified } from '@/lib/actions/account';
import { EARN_TABS, type EarnTab } from './earn-shared';

export function EarnTabs({ active }: { active: EarnTab }) {
  return (
    <nav className="earn-tabs" aria-label="Earn sections">
      {EARN_TABS.map(([id, label]) => (
        <Link key={id} href={`/studio/members?tab=${id}`} className={`earn-tab ${active === id ? 'on' : ''}`} aria-current={active === id ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}

/** Expansion panel — the collapsible content sections from YouTube's partner hub. */
export function EarnPanel({ id, title, children, defaultOpen = false }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <div className="earn-panel">
      <div className="earn-panel-bar">
        <button type="button" className="earn-panel-title" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>{title}</button>
        <button type="button" className="earn-panel-toggle" aria-expanded={open} aria-controls={bodyId} aria-label={open ? `Collapse ${title}` : `Expand ${title}`} onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'expand_less' : 'expand_more'} size={24} />
        </button>
      </div>
      {open && <div className="earn-panel-body" id={bodyId}>{children}</div>}
    </div>
  );
}

/** A gated variant of the panel — for features you have not unlocked yet. */
export function EarnGate({ title, locked, progress, requirement, children }: { title: string; locked: boolean; progress?: number | null; requirement: string; children?: ReactNode }) {
  if (locked) {
    const pct = progress ?? 0;
    return (
      <div className="earn-gate">
        <Icon name="lock" size={20} />
        <div className="earn-gate-body">
          <b>{title}</b>
          <div className="gate-bar earn-gate-bar"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <span className="muted small">{requirement}</span>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** "Notify me when I'm eligible" toggle — the email choice is stored on the account. */
export function EarnNotify({ notified }: { notified: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(notified);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    const r = await setEarnNotified(!on);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    setOn(r.data);
    toast(r.data ? 'We’ll email you when you’re eligible for the Partner Program.' : 'You won’t get an eligibility email.');
  };
  return (
    <Button variant={on ? 'filled' : 'tonal'} size="md" icon="notifications" disabled={busy} onClick={toggle}>
      {on ? 'We’ll notify you' : 'Notify me'}
    </Button>
  );
}

/** "Important things to know" — dismissible, collapsible learning module with real help links. */
const MODULES: { id: string; title: string; desc: string; href: string }[] = [
  { id: 'intro', title: 'Introduction: Earning on YouTube', desc: 'Understand the basics including the different ways to monetize, your revenue share, and how to receive your first payment.', href: 'https://support.google.com/youtube/answer/72902?hl=en' },
  { id: 'ads', title: 'Earning with ads', desc: 'Learn about the various types of ads, how advertisers view ads, and if ads make sense for your channel.', href: 'https://www.youtube.com/watch?v=qqiqlJEvTvg' },
  { id: 'fans', title: 'Earn and engage with fans', desc: 'Explore Channel Memberships, Super Chat, Super Stickers, and more.', href: 'https://support.google.com/youtube/answer/72857?hl=en#requirements' },
  { id: 'earnings', title: 'See your earnings', desc: 'See your estimated earnings in YouTube Analytics and your final monthly earnings in AdSense.', href: 'https://support.google.com/youtube/answer/9314488?hl=en' },
  { id: 'support', title: 'Accessing support', desc: 'Have questions? As part of the YouTube Partner Program, you now have access to direct chat and email support.', href: 'https://support.google.com/youtube/answer/3545535?hl=en' },
];

export function LearningModule() {
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [open, setOpen] = useState<readonly string[]>(['intro']);
  const visible = MODULES.filter((m) => !dismissed.includes(m.id));
  if (!visible.length) return null;
  const toggle = (id: string) => setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <section className="s-card earn-learning">
      <h2>Important things to know</h2>
      {visible.map((m) => {
        const isOpen = open.includes(m.id);
        return (
          <div key={m.id} className="earn-module">
            <button type="button" className="earn-module-title" aria-expanded={isOpen} onClick={() => toggle(m.id)}>
              <span>{m.title}</span>
              <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={22} />
            </button>
            {isOpen && (
              <div className="earn-module-body">
                <p className="earn-module-desc">{m.desc}</p>
                <div className="earn-module-actions">
                  <a className="btn btn-filled btn-sm" href={m.href} target="_blank" rel="noopener noreferrer">Learn more</a>
                  <Button variant="tonal" size="sm" onClick={() => setDismissed((cur) => [...cur, m.id])}>Dismiss topic</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** "How payouts work" info dialog. */
export function PayoutsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => setOpen(true)}>How payouts work</Button>
      {open && (
        <Dialog title="How payouts work" onClose={() => setOpen(false)} width={520}
          footer={<Button variant="filled" onClick={() => setOpen(false)}>Close</Button>}>
          <div className="earn-dialog-body">
            <p>Creator earnings on Vidora accrue automatically as your videos get views — roughly $2–6 per 1,000 views, plus 70% of the membership price each month.</p>
            <ul className="earn-dialog-list">
              <li><Icon name="check" size={16} />Revenue is credited as views land, not in monthly batches.</li>
              <li><Icon name="check" size={16} />Memberships pay out at the start of each month for active members.</li>
              <li><Icon name="check" size={16} />You won&apos;t be paid out until you reach the $100 lifetime threshold.</li>
            </ul>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** "See agreements" dialog — the partner terms you accepted. */
export function AgreementsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="tonal" size="sm" onClick={() => setOpen(true)}>See agreements</Button>
      {open && (
        <Dialog title="Partner Program agreements" onClose={() => setOpen(false)} width={560}
          footer={<Button variant="filled" onClick={() => setOpen(false)}>Close</Button>}>
          <div className="earn-dialog-body">
            <p>By joining the Vidora Partner Program, you accepted the following:</p>
            <ul className="earn-dialog-list">
              <li><Icon name="check" size={16} />Vidora shares roughly 70% of membership revenue and a view-based RPM with you.</li>
              <li><Icon name="check" size={16} />You keep your earnings even if the program changes for new members.</li>
              <li><Icon name="check" size={16} />Fake views, botted engagement or deceptive content forfeit earnings and access.</li>
              <li><Icon name="check" size={16} />Video ownership and rights stay with you; Vidora licenses display only.</li>
            </ul>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** "Creator Partnerships" dialog — brand matching info. */
export function PartnershipsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="filled" size="sm" onClick={() => setOpen(true)}>Get started</Button>
      {open && (
        <Dialog title="Creator Partnerships" onClose={() => setOpen(false)} width={560}
          footer={<><Button variant="text" onClick={() => setOpen(false)}>Close</Button><a className="btn btn-blue btn-md" href="https://support.google.com/youtube/answer/8629?hl=en" target="_blank" rel="noopener noreferrer">How it works</a></>}>
          <div className="earn-dialog-body">
            <p>Creator Partnerships helps by using technology to match creators like you with brands looking to create influencer marketing campaigns.</p>
            <p className="muted small">Partnerships work best with a consistent upload schedule and an engaged audience. Channels with active memberships get matched first.</p>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Shopping dialog for unlocked (50K subscriber) channels. */
export function ShoppingDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="filled" size="sm" onClick={() => setOpen(true)}>Get started</Button>
      {open && (
        <Dialog title="Turn on shopping" onClose={() => setOpen(false)} width={560}
          footer={<><Button variant="text" onClick={() => setOpen(false)}>Close</Button><a className="btn btn-blue btn-md" href="https://support.google.com/youtube/answer/72851?hl=en" target="_blank" rel="noopener noreferrer">Shopping requirements</a></>}>
          <div className="earn-dialog-body">
            <p>Share products on your channel — your own merch, or products from stores you work with. Members can buy without leaving the watch page.</p>
          </div>
        </Dialog>
      )}
    </>
  );
}
