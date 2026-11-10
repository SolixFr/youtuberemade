# Vidora

A video-sharing web app built with **Next.js 16 (App Router), React 19 and TypeScript**, backed by **SQLite** (`better-sqlite3`). It has a desktop layout and a phone layout.

The interface follows the conventions people know from large video platforms and uses the same open building blocks: [Material Symbols](https://fonts.google.com/icons) icons and the [Roboto](https://fonts.google.com/specimen/Roboto) typeface. The name, logo, code and Shorts glyph are original.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
# or: npm run build && npm start
```

The database and uploaded files live in `.data/` (gitignored). The database is created and seeded with the demo channels on first start. To start over, delete `.data/`.

Checks: `npm run lint`, `npm run typecheck`, `npm run build`.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIDORA_DATA_DIR` | `./.data` | Where `vidora.db` and `uploads/` are stored |
| `VIDORA_DEMO_TOOLS` | off in production | `1` lets you set your own subscriber count in Studio → Customization, to try the Stories gate |
| `VIDORA_INSECURE_COOKIES` | off | `1` drops the `Secure` flag on the session cookie, for running `next start` over plain HTTP locally |

## Architecture

- **Reads:** server components query SQLite directly through `lib/server/queries.ts`. Pages are a server `page.tsx` plus a client `*-view.tsx` only where there is interaction.
- **Writes:** server actions in `lib/actions/*`. Each one validates its input, checks auth and ownership, and returns `{ ok, data } | { ok: false, error }`.
- **Database:** `lib/server/db.ts` holds the schema, with WAL mode, foreign keys and cached prepared statements. Counters (views, likes, subscribers) are kept in transactions.
- **Uploads:** the browser sends the file to `POST /api/upload` with real progress, and the server streams it to disk.
  - The file type is checked from its first bytes, not its name.
  - Size limits: 1 GB for video, 10 MB for images, 1 MB for captions.
  - A file only becomes part of a video, avatar, post or story once its owner claims it. Unclaimed files are deleted after a day.
  - `GET /api/media/[id]` supports Range requests, so seeking works, and it hides private or scheduled media from everyone except the owner.
- **Direct messages:** one conversation per pair of users, with unread counts, read state, clearing your own copy, blocking, and a "who can message me" setting (everyone, channels I subscribe to, or no one). Open threads poll `/api/messages` every 3 seconds while the tab is visible.

### Security

- Passwords are hashed with scrypt and compared in constant time.
- Sessions use a random 256-bit token in an `HttpOnly`, `SameSite=Lax` (and, in production, `Secure`) cookie. Only its SHA-256 hash is stored.
- Sign-up, sign-in, uploads, messages and view counting are rate limited.
- Uploads check the `Origin` header, require a session and are stored under random ids, never under user-supplied names.
- Headers: a Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- All SQL is parameterised, and every ownership check (editing videos, pinning comments, playlists, stories) happens on the server.

## What works

- **Accounts:** sign up, sign in and sign out. You can browse without an account; liking, commenting, subscribing and the like ask you to sign in.
- **Home:** topic chips, a feed weighted by recency and subscriptions, a Shorts shelf, a Stories row and muted hover previews.
- **Watch:** a custom player with these features:
  - chapters on the progress bar and frame previews while hovering
  - speed, loop, sleep timer, ambient mode and captions
  - theater mode, miniplayer, fullscreen, press-and-hold for 2×, double-tap seek on phones, and keyboard shortcuts (`?` lists them)
  - your position is saved, so you can resume where you left off

  Under the player: like/dislike, subscribe with a bell, Share, Clip, Save to playlist, timestamped descriptions, comments (sort, reply, like, edit, delete, plus pin and heart on your own videos), and Up next with autoplay.
- **Shorts:** a snap-scrolling vertical feed where only the visible Short plays.
- **Stories:** channels with 10,000+ subscribers can post a photo or camera shot with text, optionally linked to a video. Stories expire after 7 days. The viewer has progress bars, tap, arrow and swipe navigation, pause and likes, and it tracks which stories you've seen.
- **Create:**
  - Upload a video or Short. The upload starts as soon as you pick the file, with a progress bar, while you fill in the details: thumbnail (picked from the video's frames or uploaded), chapters, subtitles, visibility and scheduling.
  - Go live from the webcam; the recording is published when you end the stream.
  - Posts: text, image, poll or a linked video.
- **Messages:** an inbox with unread badges, new-message search, and live threads.
- **Library:** History (search, pause, clear), Watch later, Liked videos and playlists.
- **Search:** suggestions, search history, and filters for type, upload date, duration and sort order.
- **Channels:** banner, a story ring on the avatar, tabs, an About dialog and in-channel search.
- **Studio:** a dashboard, a content manager, analytics from real watch time, comment moderation, Stories and channel customization.
- **Notifications** from your subscriptions, with a per-channel bell.
- **Theme:** dark, light or device. Dialogs and menus animate open and closed, and motion is reduced when the OS asks for it.

## Demo content

The catalogue is public-domain footage from the [NASA Image and Video Library](https://images.nasa.gov). `scripts/build-media.mjs` cuts the clips listed in `data/catalog.json`, makes the thumbnails, Shorts crops and channel art, and records the real durations. To rebuild it, run `npm run media -- --force` (needs ffmpeg). The channels, subscriber counts and comments are fictional. Full credits are on the in-app **About & credits** page.

## Layout

```
app/                 routes, plus api/upload, api/media/[id] and api/messages
components/          shell, chrome (header/sidebar/bottom nav), player, cards, social, stories, upload, messages, dialogs, ui kit
lib/server/          db (schema), seed, auth, storage, queries, action helpers (server only)
lib/actions/         server actions: auth, channels, videos, social, studio, messages, account
lib/                 shared types, formatting, upload client
data/                catalog.json (clip list and credits), durations.json (measured)
scripts/             build-media.mjs
public/media/        encoded clips, thumbnails, stills
screenshots/         desktop and phone screenshots
```
