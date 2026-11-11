# Vidora

**A from-scratch remake of YouTube** — look and feel, feature set, and interaction design
included — built with **Next.js 16 (App Router)**, **React 19**, **TypeScript** and **SQLite**.

The UI follows the conventions of the real thing and uses the same open building blocks:
[Material Symbols](https://fonts.google.com/icons) icons and the [Roboto](https://fonts.google.com/specimen/Roboto)
typeface. The name, logo, code and Shorts glyph are original.

- **Desktop:** full Studio, analytics, memberships, Earn and every desktop surface you know
- **Mobile:** a YouTube-parity phone layout — hamburger drawer, chips row, inset cards, draggable bottom sheets
- **Phone:** `http://your-machine:3000` on the same network

## Table of contents

- [Features](#features)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Data & resetting](#data--resetting)
- [Checks & verification build](#checks--verification-build)
- [Deployment (Vercel)](#deployment-vercel)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Security](#security)
- [Demo content & credits](#demo-content--credits)
- [Screenshots](#screenshots)

## Features

- **Accounts:** sign up / sign in / sign out, sessions, account switching on one device
- **Home:** topic chips, recency-weighted feed, Shorts shelf, hover previews
- **Watch:** custom player with chapters, frame previews, ambient mode, captions, theater mode,
  mini player, fullscreen, 2× press-and-hold, keyboard shortcuts (`?`), resume where you left off,
  comments (like / reply / pin / heart), timestamped descriptions
- **Mobile watch:** comments and description open as **draggable bottom sheets** (half → full, fling to dismiss)
- **Shorts:** snap-scrolling vertical feed
- **Stories:** 10,000+ subscriber channels can post photos; viewer with progress bars and likes
- **Live:** Go live from the webcam (or a canvas fallback when no camera is available).
  The waiting room is a public, watchable video from the moment the stream starts; the channel gets
  a red **LIVE** badge, a Live tab, a home hero and live chat — simulated audience with real viewer/like/sub/gift/join
  counts folded into the published video afterwards
- **Channels:** banner, tabs (Home · Videos · Shorts · Live · Playlists · Posts · Memberships),
  community hub, about dialog, verified badge tooltips
- **Memberships:** eligibility gates (500 subs / 3 uploads / 100 watch hours), tier setup,
  member roster, owner-only view
- **Earn:** two-tier monetization (fan funding at 500 subs, full at 1,000 subs) with persisted
  "Notify me" and progress toward each requirement
- **Studio:** dashboard, content table, analytics, comment moderation, customization
  (Profile / Home tab — banner, watermark, trailer, layout sections), live streams
- **Library:** History, Watch later, Liked videos, playlists
- **Messages:** direct inbox with unread badges and live threads
- **Notifications:** per-channel bells + a full Notifications page in the sidebar (mobile)
- **Theme:** dark, light or device; reduced motion respected

## Getting started

### Prerequisites

- **Node.js ≥ 20** and npm 10+
- No native build tools needed; SQLite ships prebuilt (`better-sqlite3`)

### Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

The database is created and seeded with demo channels on first start (NASA public-domain footage).
Browse anonymously; sign up to like, comment, subscribe, go live and upload.

```bash
# Production
npm run build
npm start            # http://localhost:3000
```

### Phone layout

Open `http://localhost:3000` on a phone on the same network (bind `next dev -H 0.0.0.0`), or use
the browser with the device toolbar enabled (≤ 792px).

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIDORA_DATA_DIR` | `./.data` | Where `vidora.db` and `uploads/` are stored. On Vercel this automatically falls back to `/tmp/vidora-data` (ephemeral) |
| `VIDORA_DEMO_TOOLS` | off in production | `1` lets you set your own subscriber count in Studio → Customization (for trying the Stories gate locally) |
| `VIDORA_INSECURE_COOKIES` | off | `1` drops the `Secure` flag on the session cookie, for `next start` over plain HTTP locally |
| `VIDORA_VERIFY_BUILD` | off | `1` routes build output to `.next-verify/`, so a throwaway production build never clobbers a running dev server's `.next/` |

## Data & resetting

- Everything lives in **`.data/`** (gitignored): `vidora.db` (SQLite, WAL mode) and `uploads/` (media).
- To start over: stop the server, delete `.data/`, start again — the seed re-runs.

## Checks & verification build

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm run build         # production build (.next/)
VIDORA_VERIFY_BUILD=1 npm run build   # throwaway build into .next-verify/
```

## Deployment (Vercel)

1. Push this directory to GitHub (main branch).
2. Import the repo in Vercel — no extra configuration needed; Next.js is auto-detected.
3. The deployed app stores its SQLite database in `/tmp/vidora-data` (autodetected), which is
   **ephemeral** — perfect for a demo, not for persistence. For persistent storage, point
   `VIDORA_DATA_DIR` at a mounted volume or migrate these queries to a hosted database.

## Project structure

```
app/                routes; server components + client *-view.tsx where interactive
  api/upload/       real-progress streaming upload endpoint
  api/media/[id]/   media serving with Range requests (seek, cache, auth checks)
  api/messages/     direct-message polling
  [handle]/         channel pages
  studio/           the Studio (dashboard, content, analytics, members/earn, customization)
components/         shell, chrome (masthead/guide/…), player, cards, social, stories,
                    bottom-sheet (draggable), upload, messages, dialogs, ui kit
lib/server/         db.ts (schema + migrations), seed.ts, auth, storage, queries (server only)
lib/actions/        server actions: auth, channels, videos, social, studio, messages, account, live, admin
lib/                shared types, formatting, upload client
data/               catalog.json (clip list and credits), durations.json (measured)
scripts/            build-media.mjs (rebuild thumbnails/clips), subset-icons.py (icon font)
public/media/       encoded clips, thumbnails, stills
screenshots/        desktop and phone screenshots
.data/              runtime database and uploads (gitignored)
```

## Architecture

- **Reads:** server components query SQLite directly through `lib/server/queries.ts`.
  A page is a server `page.tsx` plus a client `*-view.tsx` only where there is interaction.
- **Writes:** server actions in `lib/actions/*`. Each one validates its input, checks auth and
  ownership, and returns `{ ok, data } | { ok: false, error }` — interactions never dead-end on a
  fake control.
- **Database:** `lib/server/db.ts` holds the schema. WAL mode, foreign keys, migrations on boot,
  and transactions around counters (views, likes, subscribers, live earnings).
- **Uploads:** the browser streams the file to `POST /api/upload`.
  - type checked from file bytes, not the name
  - 1 GB video / 10 MB images / 1 MB captions
  - unclaimed files are deleted after a day
  - `GET /api/media/[id]` supports Range requests (seeking) and hides private/scheduled media
    from everyone except the owner
- **Live:** `startLive` pre-creates the public waiting-room video atomically with the session;
  the audience simulator (viewers/likes/subs/gifts/joins) writes real rows into the database,
  which the on-air dashboard, watch page theater and channel Live tab render.

## Security

- Passwords hashed with scrypt, constant-time compare; sessions are 256-bit tokens, HttpOnly,
  `SameSite=Lax`, `Secure` in production; only the SHA-256 hash is stored.
- Sign-up, sign-in, uploads, messages and view counting are rate limited.
- Upload auth via `Origin` header + session; files stored under random ids, never user names.
- A strict Content-Security-Policy plus `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- Parameterised SQL everywhere; ownership checks on the server for every mutation.

## Demo content & credits

The catalogue is public-domain footage from the
[NASA Image and Video Library](https://images.nasa.gov). `scripts/build-media.mjs` cuts the clips
listed in `data/catalog.json`, makes the thumbnails, Shorts crops and channel art, and records the
real durations. To rebuild: `npm run media -- --force` (needs ffmpeg).
Channel names, subscriber counts and comments are fictional. Full credits are on the in-app
**About & credits** page.

## Screenshots

Desktop and phone screenshots live in [`screenshots/`](screenshots/).
