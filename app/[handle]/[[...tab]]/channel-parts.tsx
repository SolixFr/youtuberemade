'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/app-context';
import { Avatar, Button, Dialog, Icon } from '@/components/ui';
import { formatDate } from '@/lib/format';
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

export function AddStoryButton({ variant = 'button' }: { variant?: 'button' | 'tile' }) {
  const app = useApp();
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

export function AboutDialog({ channel, videos, views }: { channel: Channel; videos: number; views: number }) {
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
        <div className="about-row"><Icon name="group" />{channel.subscribers.toLocaleString()} subscribers</div>
        <div className="about-row"><Icon name="smart_display" />{videos} videos</div>
        <div className="about-row"><Icon name="trending_up" />{views.toLocaleString()} views</div>
        <div className="about-row"><Icon name="info" />Joined {formatDate(channel.joinedAt)}</div>
      </div>
      <div className="btn-row about-actions">
        <Button icon="share" onClick={() => app.open({ kind: 'share', title: channel.name, path: `/${channel.handle}` })}>Share channel</Button>
        {app.me?.id !== channel.id && <Button icon="flag" onClick={() => app.open({ kind: 'report', what: 'channel' })}>Report user</Button>}
      </div>
    </Dialog>
  );
}
