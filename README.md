# Vidora

An original, full-featured video-sharing web app with a desktop **and** mobile UI, built from scratch in plain HTML, CSS and JavaScript (no frameworks, no build step).

> Vidora is an independent project. It is not affiliated with, and does not use code, logos or assets from, any existing video platform. The layout follows familiar conventions for this kind of app, and all code, icons, branding and artwork are original.

## Run it

```bash
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

Everything is stored locally in your browser: app data in `localStorage`, uploaded video files in IndexedDB. Use **Settings → Reset demo data** to start over.

## Features

| Area | What you can do |
| --- | --- |
| **Home** | Category chips, video grid, Shorts shelf, Stories row, hover actions (Watch later / queue), "Not interested" |
| **Watch** | Custom player (play/pause, seek with chapter preview, volume, speed, quality, captions, loop, theater, miniplayer, fullscreen, keyboard shortcuts), like/dislike, subscribe + notification bell, Share (with timestamp/embed), Download, Thanks, Clip, Save to playlist, expandable description with clickable timestamps and chapters, comments (sort, reply, like, edit, delete, pin, heart), Up next with autoplay and queue |
| **Shorts** | Vertical snap-scrolling feed, auto play/pause, like/dislike/comment/share, subscribe |
| **Stories** ✨ | The returning **Stories** feature. Only channels with **10,000+ subscribers** can post; slides expire after **7 days**. Includes a full-screen viewer (progress bars, tap/arrow-key navigation, hold to pause, swipe between channels, replies, likes, view counts) and a creator with text, backgrounds, stickers, photo upload, camera capture and video links |
| **Create** | Upload video (drag & drop, 4-step wizard: details, auto-generated or custom thumbnails, elements, checks, visibility, schedule, share to Posts/Story), Create a Short, Go live (webcam preview with simulated live chat; the replay is saved), Create post (text / image / poll / video), Create story |
| **Channels** | Banner, avatar with story ring, Home / Videos / Shorts / Live / Playlists / Posts / Stories / About tabs |
| **Posts** | Text, image and poll posts with voting, likes, comments, sharing and deleting |
| **Library** | You page, History (search, pause, clear), Watch later, Liked videos, Downloads, custom playlists (create, rename, change visibility, delete, play all, shuffle) |
| **Search** | Suggestions and search history, voice search (Web Speech API), type/date/sort filters, channel and post results |
| **Studio** | Dashboard, Content manager (edit/delete), Analytics charts, Comment moderation, Stories manager, Go live, Channel customization (name, handle, avatar, banner, links, demo subscriber count to test the Stories gate) |
| **Other** | Notifications panel, account menu, dark/light theme, Explore feeds (Trending, Music, Gaming…), settings, feedback, report dialogs |
| **Mobile** | Compact header, full-screen search, bottom navigation with a Create button, bottom-sheet menus and dialogs, sticky player, collapsed comments teaser, full-bleed Shorts and Stories, mobile Studio nav |

## Keyboard shortcuts

`k`/`Space` play/pause · `j`/`l` ±10 s · `←`/`→` ±5 s · `m` mute · `f` fullscreen · `t` theater · `i` miniplayer · `c` captions · `0–9` seek · `Shift+N` next · `/` search · `?` shortcuts

## Project layout

```
index.html        app shell
css/styles.css    all styles (dark/light themes, desktop + mobile breakpoints)
js/icons.js       original line icon set + logo
js/data.js        seed data, procedural thumbnails/avatars, persistence, IndexedDB media store
js/player.js      custom video player (real <video> for uploads, animated canvas for demo videos)
js/ui.js          header, sidebar, bottom nav, menus, modals, cards, shared actions
js/pages.js       home, watch, shorts, subscriptions, channel, posts, search, library pages
js/studio.js      Studio + upload wizard + go live
js/stories.js     Stories viewer and creator
js/app.js         hash router, boot, keyboard shortcuts
screenshots/      desktop and mobile screenshots
```
