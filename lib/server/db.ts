import 'server-only';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { seed } from './seed';

export const DATA_DIR = process.env.VIDORA_DATA_DIR ?? join(process.cwd(), '.data');
const DB_PATH = join(DATA_DIR, 'vidora.sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  description TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  banner TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  subscribers INTEGER NOT NULL DEFAULT 0,
  links TEXT NOT NULL DEFAULT '[]',
  theme TEXT NOT NULL DEFAULT 'dark',
  autoplay INTEGER NOT NULL DEFAULT 1,
  history_paused INTEGER NOT NULL DEFAULT 0,
  message_policy TEXT NOT NULL DEFAULT 'everyone',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'image', 'captions')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  attached INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'short')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  src TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  captions TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'unlisted', 'private')),
  topic TEXT NOT NULL,
  made_for_kids INTEGER NOT NULL DEFAULT 0,
  credit_label TEXT,
  credit_url TEXT,
  recorded_live INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_channel ON videos(channel_id, published_at DESC);
CREATE INDEX IF NOT EXISTS videos_feed ON videos(visibility, type, published_at DESC);

CREATE TABLE IF NOT EXISTS video_ratings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (user_id, video_id)
);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bell TEXT NOT NULL DEFAULT 'personalized',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);
CREATE INDEX IF NOT EXISTS subscriptions_channel ON subscriptions(channel_id);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT,
  text TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  hearted INTEGER NOT NULL DEFAULT 0,
  edited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_video ON comments(video_id, created_at);
CREATE TABLE IF NOT EXISTS comment_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  image TEXT,
  video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_channel ON posts(channel_id, created_at DESC);
CREATE TABLE IF NOT EXISTS poll_options (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, idx)
);
CREATE TABLE IF NOT EXISTS poll_votes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS post_likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image TEXT,
  background TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  text_color TEXT NOT NULL,
  video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_channel ON stories(channel_id, created_at);
CREATE TABLE IF NOT EXISTS story_views (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  liked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, story_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'unlisted', 'private')),
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, video_id)
);
CREATE TABLE IF NOT EXISTS watch_later (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE TABLE IF NOT EXISTS history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  watched_at INTEGER NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS history_user ON history(user_id, watched_at DESC);
CREATE TABLE IF NOT EXISTS view_events (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  seconds INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS view_events_video ON view_events(video_id, at);
CREATE TABLE IF NOT EXISTS search_history (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL COLLATE NOCASE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, query)
);
CREATE TABLE IF NOT EXISTS hidden (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'channel')),
  target_id TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, target_id)
);
CREATE TABLE IF NOT EXISTS notification_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  pair_key TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  cleared_before_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON conversation_members(user_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS blocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, blocked_id)
);
`;

function open(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  const seeded = db.prepare("SELECT 1 FROM users WHERE id = 'loworbit'").get();
  if (!seeded) db.transaction(() => seed(db))();
  return db;
}

// Reuse one connection across hot reloads in development.
const g = globalThis as unknown as { __vidoraDb?: Database.Database };
export const db: Database.Database = g.__vidoraDb ?? (g.__vidoraDb = open());

/** Statement cache: compile each SQL string once. */
const cache = new Map<string, Database.Statement>();
export function sql(text: string): Database.Statement {
  let s = cache.get(text);
  if (!s) {
    s = db.prepare(text);
    cache.set(text, s);
  }
  return s;
}

export const tx = <T>(fn: () => T): T => db.transaction(fn)();
