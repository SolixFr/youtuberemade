'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { Avatar, Button, Dialog, Icon, MEMBER_TIER_COLORS, useToast } from '@/components/ui';
import { formatCount, formatDate } from '@/lib/format';
import { joinChannel, leaveChannel } from '@/lib/actions/social';
import type { Channel } from '@/lib/types';

export function ChannelHeaderAvatar({ channel }: { channel: Channel }) {
  const app = useApp();
  if (!channel.story) return <span className="ch-avatar"><Avatar channel={channel} size={160} /></span>;
  return (
    <button type="button" className="ch-avatar" onClick={() => app.openStory(channel.id)} aria-label="View story">
      <Avatar channel={channel} size={160} ring={channel.story} />
    </button>
  );
}

export function StoryTile({ channelId, children }: { channelId: string; children: React.ReactNode }) {
  const app = useApp();
  return <button type="button" className="story-tile" onClick={() => app.openStory(channelId)}>{children}</button>;
}

/** Tier color for membership level icons. */
const tierColor = (tier: number) => MEMBER_TIER_COLORS[(tier - 1) % MEMBER_TIER_COLORS.length];

/** YouTube-style "Join" button that opens the channel's membership panel. */
export function JoinButton({ channelId, name, tiers, initialMember, avatar, banner }: {
  channelId: string; name: string; tiers: { tier: number; price_cents: number; name: string; perks: string[] }[]; initialMember: { tier: number; name: string; price_cents: number } | null; avatar?: string | null; banner?: string | null;
}) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const me = app.me;
  const mine = me?.id === channelId;
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState(initialMember);
  const [selected, setSelected] = useState(member?.tier ?? 1);
  if (mine || !tiers.length) return null;
  const selectedTier = tiers.find((t) => t.tier === selected)!;
  const isCurrent = member?.tier === selected;
  const priceLabel = `$${(selectedTier.price_cents / 100).toFixed(2)}/month`;
  const join = async () => {
    const r = await joinChannel(channelId, selected);
    if (!r.ok) return toast(r.error);
    setMember({ tier: selected, name: selectedTier.name, price_cents: selectedTier.price_cents });
    setOpen(false);
    toast(member ? `Switched to ${selectedTier.name}` : 'Welcome to the community');
    router.refresh();
  };
  const leave = async () => {
    const r = await leaveChannel(channelId);
    if (!r.ok) return toast(r.error);
    setMember(null);
    setSelected(1);
    setOpen(false);
    toast('Membership ended');
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn btn-tonal btn-md join-btn" onClick={() => (app.me ? setOpen(true) : app.requireAuth(`Want to become a member of ${name}?`, () => setOpen(true)))} aria-label={member ? `Member · ${member.name}` : 'Join this channel'} aria-haspopup="dialog">
        <Icon name="loyalty" filled size={22} /><span className="btn-label">{member ? member.name : 'Join'}</span>
      </button>
      {open && (
        <Dialog title="Membership" onClose={() => setOpen(false)} width={720} className="join-dialog">
          <div className="join-banner" style={banner ? { backgroundImage: `linear-gradient(rgba(10,10,10,0.38), rgba(10,10,10,0.8)), url(${banner})` } : undefined}>
            <Avatar name={name} src={avatar} size={68} />
            <div className="join-banner-text">
              <p className="join-banner-name">{name}</p>
              <p className="join-banner-title">{member ? 'You’re a member' : 'Join this channel'}</p>
              <p className="join-banner-sub">{member ? `Member · ${member.name}` : 'Get access to membership perks'}</p>
            </div>
          </div>
          <div className="join-body">
            <div className="join-levels" role="radiogroup" aria-label="Membership tier">
              {tiers.map((t) => {
                const on = selected === t.tier;
                const current = member?.tier === t.tier;
                return (
                  <button type="button" role="radio" key={t.tier} aria-checked={on} className={`join-level ${on ? 'on' : ''} ${current ? 'current' : ''}`} onClick={() => setSelected(t.tier)}>
                    <span className="join-level-star" style={{ color: tierColor(t.tier) }}><Icon name="loyalty" filled size={22} /></span>
                    <span className="join-level-text"><b>{t.name}</b><small>${(t.price_cents / 100).toFixed(2)}/month</small></span>
                    {current && <span className="join-level-current">You</span>}
                  </button>
                );
              })}
            </div>
            <div className="join-detail">
              <p className="join-detail-price">{priceLabel}</p>
              {member ? (
                <>
                  {isCurrent ? (
                    <button type="button" className="join-cta join-cta-member" disabled><Icon name="check" size={20} />Member</button>
                  ) : (
                    <button type="button" className="join-cta" onClick={join}>Switch to {selectedTier.name}</button>
                  )}
                  <button type="button" className="join-leave" onClick={leave}>Leave membership</button>
                </>
              ) : (
                <button type="button" className="join-cta" onClick={join}>Join</button>
              )}
              <p className="join-detail-fine">Recurring payment. Cancel anytime. Creator may update perks.</p>
              <div className="join-perk">
                <h4>Loyalty badges next to your name in comments and live chat</h4>
                <div className="join-badges" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="loyalty" filled size={34} style={{ color: tierColor(n) }} />)}</div>
              </div>
              <div className="join-perk">
                <h4>Members-only posts and community updates</h4>
                <p className="join-perk-copy">Exclusive posts from {name}, unlocked the moment you join.</p>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function AddStoryButton({ variant = 'button' }: { variant?: 'button' | 'tile' }) {
  const app = useApp();
  // Only channels with 10,000+ subscribers can post stories.
  if ((app.me?.subscribers ?? 0) < 10_000) return null;
  if (variant === 'tile') {
    return <button type="button" className="story-tile" onClick={() => app.open({ kind: 'story' })}><div className="story-tile-frame add"><Icon name="add" size={40} /></div><div className="small">Add to story</div></button>;
  }
  return <Button icon="add_circle" onClick={() => app.open({ kind: 'story' })}>Add story</Button>;
}

export function NewPostPrompt({ channel }: { channel: Channel }) {
  const app = useApp();
  return (
    <button type="button" className="post post-prompt" onClick={() => app.open({ kind: 'post' })}>
      <Avatar channel={channel} size={40} />
      <span className="post-body">
        <span className="muted">Share an update, a sneak peek or a question with your audience</span>
        <span className="btn-row"><span className="btn btn-tonal btn-sm"><Icon name="image" size={20} />Image</span><span className="btn btn-tonal btn-sm"><Icon name="ballot" size={20} />Poll</span></span>
      </span>
    </button>
  );
}

export function ChannelSearch({ handle, initial }: { handle: string; initial: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!initial);
  const [q, setQ] = useState(initial);
  return (
    <form className={`tab-search ${open ? 'open' : ''}`} role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/${handle}/search?q=${encodeURIComponent(q.trim())}`); }}>
      <button type="button" aria-label="Search this channel" onClick={() => setOpen(!open)}><Icon name="search" /></button>
      {open && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search this channel" autoFocus />}
    </form>
  );
}

export function AboutDialog({ channel, videos, views, contactEmail }: { channel: Channel; videos: number; views: number; contactEmail?: string }) {
  const app = useApp();
  const router = useRouter();
  return (
    <Dialog title="About" onClose={() => router.push(`/${channel.handle}`, { scroll: false })} width={560}>
      {channel.description && <p className="about-desc">{channel.description}</p>}
      {channel.links.length > 0 && (
        <>
          <h3 className="about-h">Links</h3>
          {channel.links.map((l) => (
            <div key={l.url} className="about-row"><Icon name="link" /><div><div>{l.title}</div><a className="link" href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.url.replace(/^https?:\/\//, '')}</a></div></div>
          ))}
        </>
      )}
      <h3 className="about-h">Channel details</h3>
      <div className="about-grid">
        {channel.pronouns && <div className="about-row"><Icon name="person" />{channel.pronouns}</div>}
        {contactEmail && <div className="about-row"><Icon name="mail" /><a className="link" href={`mailto:${contactEmail}`}>{contactEmail}</a></div>}
        <div className="about-row"><Icon name="group" />{formatCount(channel.subscribers)} subscribers</div>
        <div className="about-row"><Icon name="smart_display" />{videos} videos</div>
        <div className="about-row"><Icon name="trending_up" />{views.toLocaleString()} views</div>
        <div className="about-row"><Icon name="info" />Joined {formatDate(channel.joinedAt)}</div>
      </div>
      <div className="btn-row about-actions">
        <Button icon="share" onClick={() => app.open({ kind: 'share', title: channel.name, path: `/${channel.handle}` })}>Share channel</Button>
        {app.me?.id !== channel.id && <Button icon="flag" onClick={() => app.open({ kind: 'report', what: 'channel', targetId: channel.id })}>Report user</Button>}
      </div>
    </Dialog>
  );
}
