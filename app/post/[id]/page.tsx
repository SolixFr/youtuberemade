import { PostCard } from '@/components/social';
import { PostAnalyticsPanel } from '@/components/post-analytics';
import { EmptyState } from '@/components/ui';
import { getMe } from '@/lib/server/auth';
import { postAnalytics, postComments, posts } from '@/lib/server/queries';
import { PostComments } from './post-comments';

export const metadata = { title: 'Post' };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const post = posts(me?.id, { id })[0];
  if (!post) return <EmptyState icon="edit_note" title="This post isn’t available" />;
  // Creator-only analytics panel, shown to the post's author.
  const analytics = me?.id === post.channel.id ? postAnalytics(id) : null;
  return (
    <div className="page-pad narrow">
      <PostCard post={post} />
      {analytics && <PostAnalyticsPanel a={analytics} />}
      {!post.locked && <PostComments postId={id} initial={postComments(id, me?.id)} />}
    </div>
  );
}
