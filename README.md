# Vidora

A video-sharing web app built with **Next.js 16, React 19 and TypeScript**, with a desktop layout and a phone layout. It runs entirely in the browser: there's no backend or account, and everything you create is stored locally.

The interface follows the conventions people know from large video platforms and uses the same open building blocks: [Material Symbols](https://fonts.google.com/icons) icons and the [Roboto](https://fonts.google.com/specimen/Roboto) typeface. The name, logo, code and Shorts glyph are original.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
# or: npm run build && npm start
```

Checks: `npm run lint`, `npm run typecheck`.

## What works

- **Home:** topic chips built from the catalogue, a recency-weighted feed, a Shorts shelf, a Stories row and muted hover previews.
- **Watch:** a custom player with these controls:
  - chapter-segmented progress bar with frame previews while hovering
  - speed, loop, sleep timer and ambient mode
  - captions from an uploaded `.vtt` file
  - theater mode, miniplayer, fullscreen, press-and-hold for 2×, double-tap seek on phones, and keyboard shortcuts (`?` lists them)

  Under the player:
  - like/dislike, subscribe with a notification bell
  - Share (with an optional start time), Download (the actual file), Clip (a looping start–end link) and Save to playlist
  - a description with clickable timestamps and chapters
  - comments: sort, reply, like, edit and delete; on your own videos you can also pin and heart
  - Up next with autoplay, a queue and playlists
- **Shorts:** a snap-scrolling vertical feed where only the visible Short plays, with comments, share and subscribe.
- **Stories:** channels with 10,000+ subscribers can post a photo or camera shot with text, optionally linked to one of their videos. Stories expire after 7 days. The viewer has progress bars, tap/arrow/swipe navigation, pause and likes. Stories show on Home, Subscriptions, channel pages and in Studio. Your own subscriber count can be changed in Studio → Customization to test the gate.
- **Create:**
  - Upload video or Short: drag and drop; thumbnails taken from the file's frames or an image you upload; chapters from description timestamps; subtitles; visibility; scheduling; share to your story
  - Go live: webcam preview, recorded with `MediaRecorder` and published as a video when you end the stream
  - Posts: text, image, poll or a linked video
- **Library:**
  - History: search, pause, clear, filter by Videos/Shorts
  - Watch later, Liked videos, Downloads
  - Playlists: create, edit, delete, play all, shuffle
- **Search:** suggestions and history, voice search (Web Speech API), and filters for type, upload date, duration and sort order.
- **Channels:** banner, a story ring on the avatar, Home/Videos/Shorts/Playlists/Posts/Stories tabs, an About dialog and in-channel search.
- **Studio:** dashboard, content manager (edit/delete), analytics charted from real local playback, comment moderation, a Stories manager and channel customization.
- **Notifications:** derived from your subscriptions' recent uploads, posts and stories, with a per-channel bell setting.
- **Theme:** dark, light or device.

## Demo content

The catalogue is public-domain footage from the [NASA Image and Video Library](https://images.nasa.gov). `scripts/build-media.mjs` cuts the clips listed in `data/catalog.json`, makes the thumbnails, the vertical Shorts crops and the channel art, and records the real durations. Run it again with `npm run media -- --force` (needs ffmpeg). The channels, their subscriber counts and the viewer comments are fictional. Full credits are on the in-app **About & credits** page.

## Layout

```
app/                 routes: /, /watch?v=, /shorts/[id], /@handle/[tab], /results, /feed/*, /playlist?list=, /post/[id], /studio/*, /account, /about
components/          shell, chrome (header/sidebar/bottom nav), player, cards, social (comments/posts/subscribe), stories, upload, dialogs, ui kit
lib/                 types, seed data, store (localStorage + useSyncExternalStore), media (IndexedDB), actions, formatting
data/                catalog.json (clip list and credits), durations.json (measured)
scripts/             build-media.mjs
public/media/        encoded clips, thumbnails, stills
screenshots/         desktop and phone screenshots
```
