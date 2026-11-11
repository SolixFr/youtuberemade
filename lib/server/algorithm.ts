import 'server-only';
import { sql } from './db';

/* Simulated audience — Vidora's "algorithm".
   Each tick, public uploads earn views from three layers:
     1. a decaying velocity curve (half-life: shorts ~6h, videos ~30h),
     2. a subscriber-driven baseline (big channels keep coasting),
     3. a generous fresh-upload push so new content is always visible.
   Every video has a hidden deterministic "quality" score: strong videos earn
   more likes, comments and subscribers per view — some pop, some flop.
   Occasionally the algorithm "picks up" a video for a viral spike window. */

const TICK_MS = 20_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const COMMENT_POOL = [
  'First! Great upload as always.', 'The algorithm brought me here and I’m not complaining.', 'This is exactly what I needed today.',
  'Came for the thumbnail, stayed for the content.', 'Underrated channel fr.', 'The pacing on this one was perfect.',
  'Watched this three times already.', 'Notifications are on, don’t stop posting.', 'This deserves way more views.',
  'The quality keeps going up every upload.', 'Genuinely one of my favourite channels.', 'Who else is here before this blows up?',
  'That transition halfway through was so smooth.', 'Been subbed since the beginning, love the direction.', 'How is this channel not bigger?',
  'Put this on in the background and it made my day.', 'The detail in this is unreal.', 'Sharing this with everyone I know.',
  'Perfect length, didn’t drag at all.', 'This is going straight into my playlist.', 'The ending caught me off guard, well done.',
  'Came back to watch it again a week later.', 'You can tell a lot of work went into this one.', 'Instant classic.',
];
const SIM_HANDLES = ['nova.streams', 'orbitfan', 'media_junkie', 'quietstorm', 'daily.design', 'wanderer_k', 'pixel_paul', 'skyward.sam'];
const LIVE_CHAT = [
  'Anyone here from the upload?', 'just joined, what did I miss?', 'the audio is crisp today', 'lets goooo', 'incredible quality as always',
  'hello from Germany', 'hi from Brazil', 'watching from Tokyo', 'love this community', 'that was unreal', 'clip that', 'W in the chat',
  'mods are too slow', 'been here since day one', 'question: what camera do you use?', 'the vibes are immaculate', 'here for the whole journey',
  'unbelievable as usual', 'this stream is so calm', 'take your time, we’re in no rush', 'the editing alone is worth it', 'peace from Italy',
];
// Weighted gift table (cents) — cheap stickers common, big gifts rare.
const GIFTS = [[100, 0.38], [199, 0.28], [499, 0.17], [990, 0.09], [1990, 0.05], [4990, 0.025], [9990, 0.005]] as const;
const GIFT_LABELS: Record<number, string> = { 100: 'Super Sticker', 199: 'Super Thanks', 499: 'Super Chat', 990: 'Sparkle', 1990: 'Glow', 4990: 'Nova', 9990: 'Cosmos' };
function pickGift(): number {
  let r = Math.random(), acc = 0;
  for (const [cents, p] of GIFTS) { acc += p; if (r <= acc) return cents; }
  return GIFTS[0][0];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p;
const newId = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 20);

/** Stable per-video quality (0.3–1.0), hashed from the id so it survives restarts. */
function qualityOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 0.3 + ((h >>> 0) % 1000) / 1000 * 0.7;
}

/** Temporary viral windows live in memory; a restart just clears them. */
const boosts = new Map<string, { until: number; mult: number }>();

function tick() {
  const now = Date.now();

  // --- videos & shorts ---
  const channels = sql('SELECT id, subscribers, watch_seconds FROM users').all() as { id: string; subscribers: number; watch_seconds: number }[];
  const monetized = new Map(channels.filter((c) => c.subscribers >= 1000 && c.watch_seconds / 3600 >= 250).map((c) => [c.id, true]));
  const watchByChannel = new Map<string, number>();

  const videos = sql(`SELECT v.id, v.type, v.duration, v.views, v.likes, v.published_at, u.id ch_id, u.subscribers subs,
      (SELECT COUNT(*) FROM comments c WHERE c.video_id = v.id) n_comments
    FROM videos v JOIN users u ON u.id = v.channel_id
    WHERE v.visibility = 'public' AND v.published_at <= ?`).all(now) as { id: string; type: 'video' | 'short'; duration: number; views: number; likes: number; published_at: number; ch_id: string; subs: number; n_comments: number }[];
  for (const v of videos) {
    const ageHours = Math.max(0, (now - v.published_at) / HOUR);
    const short = v.type === 'short';
    const q = qualityOf(v.id);

    // Comments track the view count: a catch-up flow fills toward a realistic
    // ratio (~0.3% of views, capped 120), runs even when the video is quiet.
    const target = Math.min(150, Math.round(v.views * 0.005));
    let batch = Math.min(2, Math.max(0, target - v.n_comments));
    const recentSim = batch > 0 ? (sql("SELECT id, author_name FROM comments WHERE video_id = ? AND id LIKE 'sim%' ORDER BY created_at DESC LIMIT 3").all(v.id) as { id: string; author_name: string | null }[]) : [];

    // Velocity: an S-curve (slow → peak → die out) like YouTube's browse "For You".
    // Shorts spike hard then fall off a cliff; long-form ramps slower and lives longer.
    // Videos older than 30 days stop being pushed at all.
    const halfLife = short ? 4 : 24;
    const ramp = ageHours < 2 ? 0.65 + (ageHours / 2) * 0.5 : 1; // slow start
    const decay = Math.pow(0.5, Math.max(0, ageHours - 2) / halfLife);
    const ageCut = ageHours > 720 ? 0.02 : 1; // nothing older than 30 days gets push
    let velocity = (short ? 5 : 2.4) * (0.35 + q * 0.75) * ramp * decay * rand(0.55, 1.45) * ageCut;
    velocity += (v.subs / 350_000) * decay * Math.random() * ageCut;
    if (v.subs < 1000) velocity += 3 * decay * ageCut;

    // Viral window: rare and sharp, then the video quiets down for good.
    const boost = boosts.get(v.id);
    if (boost) {
      if (boost.until > now) velocity *= boost.mult;
      else boosts.delete(v.id);
    }
    if (!boost && chance(0.004) && ageHours < 240) boosts.set(v.id, { until: now + rand(3, 8) * 60_000, mult: rand(5, 14) });

    const views = Math.round(velocity);
    if (views <= 0 && batch <= 0) continue;

    // Comment growth from this tick's views, layered onto the catch-up.
    batch += views > 0 ? Math.floor(views * (0.006 + q * 0.008) * Math.random()) + (chance(0.06) ? 1 : 0) : 0;
    while (batch-- > 0) {
      const replyTo = recentSim.length && chance(0.3) ? recentSim[Math.floor(rand(0, recentSim.length))] : null;
      sql('INSERT INTO comments (id, video_id, parent_id, author_id, author_name, text, likes, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)')
        .run(`sim${newId()}`, v.id, replyTo?.id ?? null, replyTo?.author_name ?? `@${SIM_HANDLES[Math.floor(rand(0, SIM_HANDLES.length))]}`,
          COMMENT_POOL[Math.floor(rand(0, COMMENT_POOL.length))], Math.round(rand(0, 2)), now - Math.round(rand(0, 60_000)));
    }

    if (views <= 0) continue;
    sql('UPDATE videos SET views = views + ? WHERE id = ?').run(views, v.id);

    // Analytics: retention reflects quality; raw events feed the charts, pruned monthly.
    const rows = Math.min(views, 2);
    const retention = 0.15 + q * 0.65;
    for (let i = 0; i < rows; i++) {
      // Demo time compression: each simulated viewer session counts 20×, so watch hours accumulate visibly.
      const seconds = Math.round(v.duration * Math.min(0.98, retention * rand(0.6, 1.1))) * 20;
      sql('INSERT INTO view_events (video_id, at, seconds) VALUES (?, ?, ?)').run(v.id, now - Math.round(rand(0, 5_000)), seconds);
      watchByChannel.set(v.ch_id, (watchByChannel.get(v.ch_id) ?? 0) + seconds);
    }

    // Partner-program earnings: roughly $2–6 RPM once monetized.
    if (monetized.get(v.ch_id)) {
      const rpmCents = 0.2 + q * 0.4;
      sql('UPDATE users SET earnings = earnings + ? WHERE id = ?').run(Math.max(1, Math.round(views * rpmCents)), v.ch_id);
    }

    // Engagement scales with quality — the good ones get the love.
    const likeBatch = Math.round(views * (0.05 + q * 0.08) * rand(0.5, 1.3));
    if (likeBatch > 0 && v.likes < v.views * 0.08 + 12) sql('UPDATE videos SET likes = likes + ? WHERE id = ?').run(likeBatch, v.id);

    // Shorts convert subscribers harder (that's why they exist).
    const conv = short ? 0.02 + q * 0.05 : 0.004 + q * 0.014;
    const subs = Math.round(views * conv * rand(0.5, 1.2)) + (chance(0.1) ? 1 : 0);
    if (subs > 0) sql('UPDATE users SET subscribers = subscribers + ? WHERE id = ?').run(subs, v.ch_id);
  }
  sql('DELETE FROM view_events WHERE at < ?').run(now - 31 * DAY);

  // Posts turn part of their reach into subscribers (likes, votes and comments
  // are handled by the "community posts" section further down).
  const postRows = sql(`SELECT p.id, p.channel_id, p.created_at, u.subscribers subs
    FROM posts p JOIN users u ON u.id = p.channel_id
    WHERE p.created_at > ? AND p.members_only = 0`).all(now - 30 * DAY) as { id: string; channel_id: string; created_at: number; subs: number }[];
  for (const p of postRows) {
    const ageHours = Math.max(0, (now - p.created_at) / HOUR);
    const q = qualityOf(p.id);
    const decay = Math.pow(0.5, ageHours / 18); // posts fade a bit faster than videos
    if (decay < 0.03) continue;
    const reach = (1.6 + q * 2.4) * decay * rand(0.4, 1.6) + (p.subs / 180_000) * decay * Math.random();
    const views = Math.round(reach);
    if (views <= 0) continue;
    const subs = Math.round(views * (0.008 + q * 0.02) * rand(0.5, 1.3));
    if (subs > 0) sql('UPDATE users SET subscribers = subscribers + ? WHERE id = ?').run(subs, p.channel_id);
  }

  // --- live streams: a simulated audience while you're on air ---
  // Safety: auto-close anything open longer than 6 hours.
  sql('UPDATE live_sessions SET ended_at = ? WHERE ended_at IS NULL AND started_at < ?').run(now, now - 6 * HOUR * 1000);
  const openLives = sql(`SELECT l.id, l.channel_id, l.started_at, l.views, l.likes, l.subs_gained, l.joins, l.gifts_cents, u.subscribers subs, u.earnings earnings
    FROM live_sessions l JOIN users u ON u.id = l.channel_id WHERE l.ended_at IS NULL`).all() as {
    id: string; channel_id: string; started_at: number; views: number; likes: number; subs_gained: number; joins: number; gifts_cents: number; subs: number; earnings: number;
  }[];
  for (const l of openLives) {
    const age = Math.max(0, (now - l.started_at) / HOUR);
    const q = qualityOf(l.id);
    const peak = Math.min(1500, Math.round(8 + Math.sqrt(Math.max(1, l.subs)) / 2.1));
    const rise = Math.min(1, age * 1.35 + 0.18);
    const decay = Math.max(0.35, 1 - Math.max(0, age - 0.9) * 0.24);
    const viewers = Math.max(2, Math.round(peak * rise * decay * rand(0.72, 1.3)));
    const gained = Math.max(0, Math.round(viewers * rand(0.25, 0.6)));
    const likeBatch = Math.round(gained * rand(0.05, 0.18));

    // Chat: a lively room, scaled to the house
    if (viewers > 3 && chance(0.85)) {
      const n = Math.min(3, 1 + Math.floor(viewers / 25) + (chance(0.25) ? 1 : 0));
      for (let i = 0; i < n; i++) {
        sql('INSERT INTO live_messages (session_id, author_name, text, kind, at) VALUES (?, ?, ?, ?, ?)')
          .run(l.id, `@${SIM_HANDLES[Math.floor(rand(0, SIM_HANDLES.length))]}`, LIVE_CHAT[Math.floor(rand(0, LIVE_CHAT.length))], 'chat', now - Math.round(rand(0, 5_000)));
      }
    }

    // Gifts: sometimes the room tips
    let giftGain = 0;
    if (chance(Math.min(0.5, viewers / 900 + 0.03))) {
      const cents = pickGift();
      const fan = SIM_HANDLES[Math.floor(rand(0, SIM_HANDLES.length))];
      sql('INSERT INTO live_messages (session_id, author_name, text, kind, amount_cents, at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(l.id, `@${fan}`, `${GIFT_LABELS[cents] ?? 'Super Chat'} · $${(cents / 100).toFixed(2)}`, 'gift', cents, now);
      sql('UPDATE users SET earnings = earnings + ? WHERE id = ?').run(cents, l.channel_id);
      giftGain = cents;
    }

    // Subscribers: converts like a Short, weighted by quality
    let subsGain = Math.round(gained * (0.012 + q * 0.03) * rand(0.5, 1.4));
    if (subsGain > 0) {
      const real = Math.min(subsGain, 2);
      for (let i = 0; i < real; i++) {
        const fan = sql(`SELECT u.id FROM users u WHERE u.password_hash IS NULL AND u.id != ? AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.channel_id = ?) ORDER BY RANDOM() LIMIT 1`)
          .get(l.channel_id, l.channel_id) as { id: string } | undefined;
        if (!fan) break;
        sql("INSERT INTO subscriptions (user_id, channel_id, bell, created_at) VALUES (?, ?, 'personalized', ?)").run(fan.id, l.channel_id, now - Math.round(rand(0, 30_000)));
      }
      if (subsGain >= 2) sql('INSERT INTO live_messages (session_id, author_name, text, kind, at) VALUES (?, ?, ?, ?, ?)').run(l.id, 'Vidora', `+${subsGain} new subscribers`, 'sub', now);
      sql('UPDATE users SET subscribers = subscribers + ? WHERE id = ?').run(subsGain, l.channel_id);
    } else subsGain = 0;

    // Membership joins: rare, worth celebrating
    let joinsGain = 0;
    if (chance(Math.min(0.4, viewers / 1600 + 0.01))) {
      const fan = sql(`SELECT u.id, u.name FROM users u WHERE u.password_hash IS NULL AND u.id != ? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.channel_id = ?) ORDER BY RANDOM() LIMIT 1`)
        .get(l.channel_id, l.channel_id) as { id: string; name: string } | undefined;
      if (fan) {
        const tierRow = sql('SELECT tier, name, price_cents FROM channel_tiers WHERE channel_id = ? AND tier <= 2 ORDER BY RANDOM() LIMIT 1').get(l.channel_id) as { tier: number; name: string; price_cents: number } | undefined;
        if (tierRow) {
          sql('INSERT INTO memberships (user_id, channel_id, tier, started_at) VALUES (?, ?, ?, ?)').run(fan.id, l.channel_id, tierRow.tier, now);
          sql('UPDATE users SET earnings = earnings + ? WHERE id = ?').run(Math.floor(tierRow.price_cents * 0.7), l.channel_id);
          sql('INSERT INTO live_messages (session_id, author_name, text, kind, at) VALUES (?, ?, ?, ?, ?)').run(l.id, fan.name, `joined at ${tierRow.name}`, 'join', now);
          joinsGain = 1;
        }
      }
    }

    sql('UPDATE live_sessions SET views = views + ?, likes = likes + ?, subs_gained = subs_gained + ?, joins = joins + ?, gifts_cents = gifts_cents + ?, viewers = ? WHERE id = ?')
      .run(gained, likeBatch, subsGain, joinsGain, giftGain, viewers, l.id);
  }

  // Real subscription events: when you upload, a demo channel may subscribe to
  // you — a genuine row, so "subscribed to your channel" notifications fire.
  const freshUploads = sql(`SELECT v.id, v.channel_id FROM videos v WHERE v.visibility = 'public' AND v.published_at > ? AND v.channel_id != (SELECT id FROM users WHERE role = 'admin') ORDER BY published_at DESC LIMIT 5`)
    .all(now - DAY) as { id: string; channel_id: string }[];
  for (const up of freshUploads) {
    if (!chance(0.25)) continue;
    const fan = sql(`SELECT u.id FROM users u WHERE u.password_hash IS NULL AND u.id != ? AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.channel_id = ?) ORDER BY RANDOM() LIMIT 1`)
      .get(up.channel_id, up.channel_id) as { id: string } | undefined;
    if (!fan) continue;
    sql("INSERT INTO subscriptions (user_id, channel_id, bell, created_at) VALUES (?, ?, 'personalized', ?)").run(fan.id, up.channel_id, now - Math.round(rand(0, 3_600_000)));
    sql('UPDATE users SET subscribers = subscribers + 1 WHERE id = ?').run(up.channel_id);
  }

  // --- posts: community posts get the same decay-curve push ---
  const posts = sql('SELECT p.id, p.created_at, p.likes, p.channel_id, u.subscribers subs FROM posts p JOIN users u ON u.id = p.channel_id')
    .all() as { id: string; created_at: number; likes: number; channel_id: string; subs: number }[];
  for (const p of posts) {
    const ageHours = Math.max(0, (now - p.created_at) / HOUR);
    const q = qualityOf(p.id);
    const decay = Math.pow(0.5, ageHours / 12); // posts burn out in about a day
    let velocity = (p.subs / 60_000) * decay * rand(1.5, 4);
    velocity += ageHours < 6 ? 3 : ageHours < 24 ? 1 : 0.2;
    if (p.subs < 1000) velocity += 1.5 * decay;

    const likes = Math.round(velocity * (0.02 + q * 0.06) * rand(0.4, 1.2));
    if (likes > 0) sql('UPDATE posts SET likes = likes + ? WHERE id = ?').run(likes, p.id);

    // Polls: votes trickle in, mostly behind the leading option (momentum).
    const opts = sql('SELECT idx, votes FROM poll_options WHERE post_id = ?').all(p.id) as { idx: number; votes: number }[];
    if (opts.length && chance(Math.min(0.6, velocity * 0.2 + 0.05))) {
      const sorted = [...opts].sort((a, b) => b.votes - a.votes);
      const winner = chance(0.7) ? sorted[0] : sorted[Math.floor(rand(0, sorted.length))];
      sql('UPDATE poll_options SET votes = votes + ? WHERE post_id = ? AND idx = ?').run(Math.max(1, Math.round(rand(1, 3) * (0.5 + velocity * 0.2))), p.id, winner.idx);
    }

    // Occasional comment from a demo channel.
    if (chance(Math.min(0.4, 0.02 + q * 0.04 + velocity * 0.02))) {
      const fan = sql('SELECT id FROM users WHERE password_hash IS NULL AND id != ? ORDER BY RANDOM() LIMIT 1').get(p.channel_id) as { id: string } | undefined;
      if (fan) {
        sql('INSERT INTO post_comments (id, post_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)')
          .run('pc' + newId(), p.id, fan.id, COMMENT_POOL[Math.floor(rand(0, COMMENT_POOL.length))], now - Math.round(rand(0, 60_000)));
      }
    }
  }

  // --- stories: views decay with age, likes follow, channels grow a little ---
  const stories = sql('SELECT s.id, s.views, u.id ch_id, u.subscribers subs FROM stories s JOIN users u ON u.id = s.channel_id WHERE s.created_at > ?')
    .all(now - 7 * DAY) as { id: string; views: number; ch_id: string; subs: number }[];
  let storyViewsTotal = 0;
  for (const s of stories) {
    const velocity = rand(0.5, 3) + (s.subs / 200_000) * rand(0.5, 1.5) + (s.views < 50 ? rand(1, 3) : 0);
    const views = Math.round(velocity);
    if (views <= 0) continue;
    sql('UPDATE stories SET views = views + ? WHERE id = ?').run(views, s.id);
    storyViewsTotal += views;
    if (chance(0.07)) sql('UPDATE stories SET likes = likes + 1 WHERE id = ?').run(s.id);
    if (chance(0.05)) sql('UPDATE users SET subscribers = subscribers + 1 WHERE id = ?').run(s.ch_id);
  }
  // Watch hours: the tick's video seconds plus an estimate for story views (~5s each).
  for (const [chId, seconds] of watchByChannel) {
    sql('UPDATE users SET watch_seconds = watch_seconds + ? WHERE id = ?').run(seconds, chId);
  }
  if (storyViewsTotal > 0) {
    sql(`UPDATE users SET watch_seconds = watch_seconds + ? WHERE id IN (SELECT DISTINCT channel_id FROM stories WHERE created_at > ?)`)
      .run(Math.round(storyViewsTotal * 5), now - 7 * DAY);
  }
}

let started = false;
/** Starts the simulation loop once per server process. Skipped on serverless. */
export function startAlgorithm() {
  const g = globalThis as unknown as { __vidoraAlgo?: boolean };
  if (g.__vidoraAlgo || started || process.env.VERCEL) return;
  g.__vidoraAlgo = started = true;
  setInterval(() => {
    try { tick(); } catch (err) { console.error('algorithm tick failed', err); }
  }, TICK_MS);
}
