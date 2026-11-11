import type { Metadata } from 'next';
import { StoriesView } from '@/components/stories';
import { getMe } from '@/lib/server/auth';
import { STORY_MIN_SUBS, storyShelf } from '@/lib/server/queries';

export const metadata: Metadata = { title: 'Stories' };

export default async function Stories() {
  const me = await getMe();
  const groups = storyShelf(me?.id);
  const canPost = !!me && me.subscribers >= STORY_MIN_SUBS;
  return (
    <div className="feed stories-page">
      <h1 className="page-title">Stories</h1>
      <StoriesView groups={groups} meId={me?.id ?? null} canPost={canPost} />
    </div>
  );
}
