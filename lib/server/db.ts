import 'server-only';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { seed, TIERS } from './seed';

// Vercel's serverless filesystem is read-only (only /tmp is writable), so the
// database and uploads live there in production.
export const DATA_DIR = process.env.VIDORA_DATA_DIR
  ?? (process.env.VERCEL ? '/tmp/vidora-data' : join(process.cwd(), '.data'));
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
  role TEXT NOT NULL DEFAULT 'user',
  pronouns TEXT NOT NULL DEFAULT '',
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  earnings INTEGER NOT NULL DEFAULT 0,
  earn_notified INTEGER NOT NULL DEFAULT 0,
  contact_email TEXT NOT NULL DEFAULT '',
  trailer_video_id TEXT,
  featured_video_id TEXT,
  watermark TEXT,
  watermark_display TEXT NOT NULL DEFAULT 'end',
  watermark_start INTEGER NOT NULL DEFAULT 8,
  home_sections TEXT,
  subscribers INTEGER NOT NULL DEFAULT 0,
  links TEXT NOT NULL DEFAULT '[]',
  theme TEXT NOT NULL DEFAULT 'dark',
  autoplay INTEGER NOT NULL DEFAULT 1,
  history_paused INTEGER NOT NULL DEFAULT 0,
  message_policy TEXT NOT NULL DEFAULT 'everyone',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  title TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  subs_gained INTEGER NOT NULL DEFAULT 0,
  joins INTEGER NOT NULL DEFAULT 0,
  gifts_cents INTEGER NOT NULL DEFAULT 0,
  viewers INTEGER NOT NULL DEFAULT 0,
  video_id TEXT
);
CREATE INDEX IF NOT EXISTS live_sessions_open ON live_sessions(ended_at);
CREATE TABLE IF NOT EXISTS live_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'chat',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_messages_session ON live_messages(session_id, id);
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
  members_only INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_tiers (
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  name TEXT NOT NULL,
  perks TEXT NOT NULL,
  PRIMARY KEY (channel_id, tier)
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel_id)
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
  text_pos TEXT NOT NULL DEFAULT 'middle-center',
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'comment', 'channel')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`;

function open(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migrations for databases created before a column existed.
  const storyCols = (db.pragma('table_info(stories)') as { name: string }[]).map((c) => c.name);
  if (!storyCols.includes('text_pos')) db.exec("ALTER TABLE stories ADD COLUMN text_pos TEXT NOT NULL DEFAULT 'middle-center'");
  if (!storyCols.includes('views')) db.exec('ALTER TABLE stories ADD COLUMN views INTEGER NOT NULL DEFAULT 0');
  if (!storyCols.includes('likes')) db.exec('ALTER TABLE stories ADD COLUMN likes INTEGER NOT NULL DEFAULT 0');
  const userCols = (db.pragma('table_info(users)') as { name: string }[]).map((c) => c.name);
  if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  if (!userCols.includes('pronouns')) db.exec("ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''");
  if (!userCols.includes('watch_seconds')) {
    db.exec('ALTER TABLE users ADD COLUMN watch_seconds INTEGER NOT NULL DEFAULT 0');
    // Established channels start with a plausible lifetime: ~3 minutes of watch time per subscriber.
    db.exec('UPDATE users SET watch_seconds = subscribers * 180');
  }
  if (!userCols.includes('earnings')) db.exec('ALTER TABLE users ADD COLUMN earnings INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('earn_notified')) db.exec('ALTER TABLE users ADD COLUMN earn_notified INTEGER NOT NULL DEFAULT 0');
  if (!userCols.includes('contact_email')) db.exec("ALTER TABLE users ADD COLUMN contact_email TEXT NOT NULL DEFAULT ''");
  if (!userCols.includes('trailer_video_id')) db.exec('ALTER TABLE users ADD COLUMN trailer_video_id TEXT');
  if (!userCols.includes('featured_video_id')) db.exec('ALTER TABLE users ADD COLUMN featured_video_id TEXT');
  if (!userCols.includes('watermark')) db.exec('ALTER TABLE users ADD COLUMN watermark TEXT');
  if (!userCols.includes('watermark_display')) db.exec("ALTER TABLE users ADD COLUMN watermark_display TEXT NOT NULL DEFAULT 'end'");
  if (!userCols.includes('watermark_start')) db.exec('ALTER TABLE users ADD COLUMN watermark_start INTEGER NOT NULL DEFAULT 8');
  if (!userCols.includes('home_sections')) db.exec('ALTER TABLE users ADD COLUMN home_sections TEXT');
  const liveCols = (db.pragma('table_info(live_sessions)') as { name: string }[]).map((c) => c.name);
  if (liveCols.length && !liveCols.includes('viewers')) db.exec('ALTER TABLE live_sessions ADD COLUMN viewers INTEGER NOT NULL DEFAULT 0');
  if (liveCols.length && !liveCols.includes('video_id')) db.exec('ALTER TABLE live_sessions ADD COLUMN video_id TEXT');
  const postCols = (db.pragma('table_info(posts)') as { name: string }[]).map((c) => c.name);
  if (!postCols.includes('members_only')) db.exec('ALTER TABLE posts ADD COLUMN members_only INTEGER NOT NULL DEFAULT 0');
  if (!postCols.includes('views')) db.exec('ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0');
  if (!postCols.includes('subs_gained')) db.exec('ALTER TABLE posts ADD COLUMN subs_gained INTEGER NOT NULL DEFAULT 0');
  // Backfill default membership tiers for channels created before this existed.
  const untiered = db.prepare('SELECT id FROM users WHERE NOT EXISTS (SELECT 1 FROM channel_tiers t WHERE t.channel_id = users.id)').all() as { id: string }[];
  if (untiered.length) {
    const insert = db.prepare('INSERT OR IGNORE INTO channel_tiers (channel_id, tier, price_cents, name, perks) VALUES (?, ?, ?, ?, ?)');
    for (const u of untiered) for (const t of TIERS) insert.run(u.id, t.tier, t.price_cents, t.name, JSON.stringify(t.perks));
  }
  // The first real (password) account owns this deployment and administers it.
  db.exec("UPDATE users SET role = 'admin' WHERE password_hash IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')");
  // Build workers import this module concurrently; take the write lock before
  // checking whether the seed exists so only one of them runs it.
  const seedIfNeeded = db.transaction(() => {
    const seeded = db.prepare("SELECT 1 FROM users WHERE id = 'loworbit'").get();
    if (!seeded) seed(db);
  });
  seedIfNeeded.immediate();
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
