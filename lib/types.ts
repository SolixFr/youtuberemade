/* Shared data shapes passed from the server (SQLite) to client components. */

export type VideoType = 'video' | 'short';
export type Visibility = 'public' | 'unlisted' | 'private';
export type BellLevel = 'all' | 'personalized' | 'none';
export type Theme = 'dark' | 'light' | 'system';
export type StoryState = 'unseen' | 'seen' | null;
export type MessagePolicy = 'everyone' | 'subscriptions' | 'none';

export interface ChannelLite {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  subscribers: number;
  story: StoryState;
  /** Member badge for the viewer on this channel. */
  membership?: { tier: number; name: string } | null;
}

export interface Channel extends ChannelLite {
  description: string;
  banner: string | null;
  links: { title: string; url: string }[];
  pronouns: string;
  joinedAt: number;
  hasAccount: boolean;
}

export interface Video {
  id: string;
  type: VideoType;
  title: string;
  description: string;
  duration: number;
  views: number;
  likes: number;
  publishedAt: number;
  src: string;
  thumbnail: string;
  captions: string | null;
  visibility: Visibility;
  topic: string;
  credit: { label: string; url: string } | null;
  recordedLive: boolean;
  channel: ChannelLite;
  /** Resume position for the signed-in viewer, in seconds. */
  progress: number;
  /** True while the channel is broadcasting this video right now. */
  live?: boolean;
}

export interface ViewerVideoState {
  rating: -1 | 0 | 1;
  inWatchLater: boolean;
  subscribed: boolean;
  bell: BellLevel;
}

export interface Comment {
  id: string;
  videoId: string;
  parentId: string | null;
  author: { id: string | null; name: string; handle: string; avatar: string | null; verified: boolean; membership?: { tier: number; name: string } | null };
  byCreator: boolean;
  mine: boolean;
  text: string;
  likes: number;
  myVote: -1 | 0 | 1;
  pinned: boolean;
  hearted: boolean;
  edited: boolean;
  createdAt: number;
}

export interface Post {
  id: string;
  channel: ChannelLite;
  text: string;
  image: string | null;
  video: Video | null;
  poll: { text: string; votes: number }[] | null;
  myVote: number | null;
  likes: number;
  /** True when the post is members-only. Non-members receive it redacted with `locked` set. */
  membersOnly?: boolean;
  locked?: boolean;
  liked: boolean;
  comments: number;
  createdAt: number;
}

export interface PostComment {
  id: string;
  author: { name: string; handle: string; avatar: string | null; membership?: { tier: number; name: string } | null };
  mine: boolean;
  text: string;
  createdAt: number;
}

export interface StorySlide {
  id: string;
  image: string | null;
  background: string;
  text: string;
  textColor: string;
  /** Where the text sits: 'top|middle|bottom' - 'left|center|right'. */
  textPos: string;
  views: number;
  likes: number;
  video: { id: string; title: string; type: VideoType } | null;
  createdAt: number;
  seen: boolean;
  liked: boolean;
}

export interface StoryGroup {
  channel: ChannelLite;
  slides: StorySlide[];
}

export interface PlaylistSummary {
  id: string;
  title: string;
  visibility: Visibility;
  count: number;
  thumbnail: string | null;
  updatedAt: number;
}

export interface Notification {
  key: string;
  channel: ChannelLite;
  text: string;
  href: string;
  thumbnail: string | null;
  at: number;
  read: boolean;
  /** What generated it; 'sub'/'comment' notifications are about the viewer's own channel. */
  kind?: 'upload' | 'post' | 'story' | 'sub' | 'comment';
}

export interface Settings {
  theme: Theme;
  autoplay: boolean;
  historyPaused: boolean;
  messagePolicy: MessagePolicy;
}

export interface Me {
  id: string;
  handle: string;
  name: string;
  avatar: string | null;
  subscribers: number;
  pronouns: string;
  role: 'user' | 'admin';
  settings: Settings;
}

export interface Conversation {
  id: string;
  other: ChannelLite;
  last: { body: string; mine: boolean; at: number } | null;
  unread: number;
  blocked: boolean;
}

export interface Message {
  id: number;
  mine: boolean;
  body: string;
  createdAt: number;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
