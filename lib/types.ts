export type VideoType = 'video' | 'short';
export type Visibility = 'public' | 'unlisted' | 'private';
export type BellLevel = 'all' | 'personalized' | 'none';
export type Theme = 'dark' | 'light' | 'system';

export interface Channel {
  id: string;
  name: string;
  handle: string; // includes leading "@"
  subscribers: number;
  description: string;
  joinedAt: number;
  avatar?: string; // URL or "idb:<key>"
  banner?: string;
  verified: boolean;
  links: { title: string; url: string }[];
  topic?: string;
  isMine?: boolean;
}

export interface Chapter {
  t: number;
  title: string;
}

export interface Video {
  id: string;
  channelId: string;
  type: VideoType;
  title: string;
  description: string;
  duration: number;
  views: number;
  likes: number;
  publishedAt: number;
  src: string; // URL or "idb:<key>"
  thumbnail: string; // URL or "idb:<key>"
  captions?: string; // "idb:<key>" of a WebVTT file
  visibility: Visibility;
  topic: string;
  madeForKids?: boolean;
  credit?: { label: string; url: string };
  recordedLive?: boolean;
}

export interface Comment {
  id: string;
  videoId: string;
  parentId?: string;
  author: string; // display handle, e.g. "@mira.k"
  mine?: boolean;
  byCreator?: boolean;
  text: string;
  createdAt: number;
  likes: number;
  pinned?: boolean;
  hearted?: boolean;
  edited?: boolean;
}

export interface PollOption {
  text: string;
  votes: number;
}

export interface Post {
  id: string;
  channelId: string;
  text: string;
  image?: string;
  poll?: PollOption[];
  videoId?: string;
  createdAt: number;
  likes: number;
}

export interface PostComment {
  id: string;
  postId: string;
  author: string;
  mine?: boolean;
  text: string;
  createdAt: number;
}

export interface StorySlide {
  id: string;
  channelId: string;
  createdAt: number;
  image?: string;
  background: string;
  text: string;
  textColor: string;
  videoId?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  visibility: Visibility;
  videoIds: string[];
  updatedAt: number;
}

export interface ViewEvent {
  videoId: string;
  at: number;
  seconds: number;
}

export interface UserState {
  subscriptions: string[];
  bells: Record<string, BellLevel>;
  liked: string[];
  disliked: string[];
  watchLater: string[];
  history: { videoId: string; at: number }[];
  historyPaused: boolean;
  searchHistory: string[];
  votes: Record<string, number>;
  likedComments: string[];
  dislikedComments: string[];
  likedPosts: string[];
  likedStories: string[];
  seenStories: string[];
  progress: Record<string, number>;
  theme: Theme;
  autoplay: boolean;
  downloads: string[];
  hiddenVideos: string[];
  hiddenChannels: string[];
  readNotifications: string[];
  dismissedNotifications: string[];
  viewLog: ViewEvent[];
}

export interface DB {
  version: number;
  createdAt: number;
  channels: Record<string, Channel>;
  videos: Video[];
  comments: Comment[];
  posts: Post[];
  postComments: PostComment[];
  stories: StorySlide[];
  playlists: Playlist[];
  user: UserState;
}
