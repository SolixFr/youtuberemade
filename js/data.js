/* Vidora — seed data, procedural art, persistence. */

/* ---------- deterministic RNG ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = typeof seed === 'string' ? hashStr(seed) : seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- formatting ---------- */
function fmtCount(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
  return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
}
function fmtDur(s) {
  s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0');
}
function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  const u = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [s, n] of u) { const v = Math.floor(d / s); if (v >= 1) return `${v} ${n}${v > 1 ? 's' : ''} ago`; }
  return 'just now';
}

/* ---------- procedural art ---------- */
const PALETTES = [
  ['#ff6b6b', '#5f27cd'], ['#1dd1a1', '#0a3d62'], ['#feca57', '#ee5253'], ['#48dbfb', '#341f97'],
  ['#ff9ff3', '#0abde3'], ['#00d2d3', '#222f3e'], ['#f368e0', '#ff9f43'], ['#54a0ff', '#10ac84'],
  ['#c8d6e5', '#576574'], ['#ffd32a', '#05c46b'], ['#ff3f34', '#3c40c6'], ['#0fbcf9', '#f53b57'],
];
function thumbSVG(seed, title = '', opts = {}) {
  const r = rng(seed); const [a, b] = pick(r, PALETTES); const w = opts.w || 320, h = opts.h || 180;
  let shapes = '';
  const kind = Math.floor(r() * 4);
  for (let i = 0; i < 6; i++) {
    const x = r() * w, y = r() * h, s = 20 + r() * (w / 3), o = (0.15 + r() * 0.35).toFixed(2);
    if (kind === 0) shapes += `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="#fff" opacity="${o}"/>`;
    else if (kind === 1) shapes += `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s / 6}" transform="rotate(${r() * 90} ${x} ${y})" fill="#fff" opacity="${o}"/>`;
    else if (kind === 2) shapes += `<path d="M${x} ${y - s / 2}L${x + s / 2} ${y + s / 2}L${x - s / 2} ${y + s / 2}Z" fill="#fff" opacity="${o}"/>`;
    else shapes += `<path d="M0 ${y} Q ${w / 2} ${y - s} ${w} ${y + s / 3}" stroke="#fff" stroke-width="${4 + r() * 10}" fill="none" opacity="${o}"/>`;
  }
  const fs = opts.vertical ? 22 : 24; const maxChars = Math.floor((w - 36) / (fs * 0.8));
  let words = ''; for (const wd of title.toUpperCase().split(' ')) { const t = words ? words + ' ' + wd : wd; if (t.length > maxChars) break; words = t; }
  if (!words) words = title.toUpperCase().slice(0, maxChars);
  const text = title && !opts.noText ? `<text x="${opts.vertical ? w / 2 : 18}" y="${opts.vertical ? h * 0.75 : h - 24}" text-anchor="${opts.vertical ? 'middle' : 'start'}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="${fs}" fill="#fff" stroke="#000" stroke-opacity=".35" stroke-width="1">${esc(words)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${shapes}${text}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function avatarColor(seed) { const r = rng(seed + 'av'); return `hsl(${Math.floor(r() * 360)} 65% 45%)`; }
function avatarHTML(ch, size = 36, extra = '') {
  if (!ch) return '';
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;`;
  if (ch.avatarImg) return `<img class="avatar ${extra}" style="${st}" src="${ch.avatarImg}" alt="">`;
  return `<span class="avatar ${extra}" style="${st}background:${ch.color || avatarColor(ch.id)}">${esc((ch.name || '?')[0].toUpperCase())}</span>`;
}

/* ---------- seed content ---------- */
const CATEGORIES = ['All', 'Music', 'Gaming', 'Live', 'Mixes', 'Podcasts', 'Cooking', 'Tech', 'Science', 'Travel', 'Fitness', 'Comedy', 'News', 'Sports', 'Learning', 'Art', 'Recently uploaded', 'New to you'];

const SEED_CHANNELS = [
  ['ch_byte', 'Byte Lab', 'bytelab', 2_840_000, 'Tech', 'Hands-on reviews, teardown deep-dives and honest takes on gadgets.'],
  ['ch_kitchen', 'Kitchen Atlas', 'kitchenatlas', 1_260_000, 'Cooking', 'Recipes from every corner of the map, cooked in a tiny apartment kitchen.'],
  ['ch_orbit', 'Orbit & Atom', 'orbitatom', 4_100_000, 'Science', 'Big ideas in physics and space, explained with animation.'],
  ['ch_wander', 'Wander North', 'wandernorth', 812_000, 'Travel', 'Slow travel films. Trains, mountains, and quiet places.'],
  ['ch_pixel', 'PixelForge', 'pixelforge', 3_300_000, 'Gaming', 'Speedruns, indie gems and the occasional rage quit.'],
  ['ch_lofi', 'Lumen Beats', 'lumenbeats', 6_700_000, 'Music', 'Chill beats to study, relax and focus to. Live 24/7.'],
  ['ch_fit', 'Core Daily', 'coredaily', 540_000, 'Fitness', 'Short, effective workouts you can do anywhere.'],
  ['ch_laugh', 'Two Chairs Comedy', 'twochairs', 1_900_000, 'Comedy', 'Sketches, improv and very bad ideas.'],
  ['ch_news', 'The Daily Signal Desk', 'signaldesk', 3_050_000, 'News', 'Clear, calm explainers on the stories that matter.'],
  ['ch_court', 'Full Court', 'fullcourt', 1_120_000, 'Sports', 'Breakdowns, highlights and film study.'],
  ['ch_learn', 'Margin Notes', 'marginnotes', 2_200_000, 'Learning', 'History and math, one whiteboard at a time.'],
  ['ch_brush', 'Brush & Bloom', 'brushbloom', 8_400, 'Art', 'Watercolor tutorials for absolute beginners.'],
  ['ch_pod', 'Late Shift Podcast', 'lateshift', 960_000, 'Podcasts', 'Long conversations with interesting people.'],
  ['ch_tiny', 'Tiny Garden Club', 'tinygarden', 3_900, 'Learning', 'Balcony gardening and growing food in small spaces.'],
];

const TITLE_BANK = {
  Tech: ['I Used a Folding Phone for 30 Days', 'This $40 Keyboard Beats Mine', 'Building the Quietest PC Possible', 'Every Port on a Laptop, Explained', 'The Truth About Fast Charging', 'Inside a Smartwatch Factory', 'Why Your Wi-Fi Is Slow (and How to Fix It)'],
  Cooking: ['The Only Ramen Recipe You Need', '5 Breakfasts Under 10 Minutes', 'Street Food Tour: Night Market Edition', 'I Made Bread With 3 Ingredients', 'Perfect Dumplings, Step by Step', 'Cooking a Week of Meals for $25'],
  Science: ['What Happens Inside a Black Hole?', 'The Strangest Moon in the Solar System', 'How Big Is the Universe, Really?', 'Quantum Tunneling in 8 Minutes', 'Why the Sky Is Blue (Not What You Think)', 'Building a Cloud Chamber at Home'],
  Travel: ['48 Hours on the Slowest Train', 'A Quiet Week in the Fjords', 'Hiking to a Hidden Mountain Hut', 'The Island With No Cars', 'Night Ferry Across the Sea'],
  Gaming: ['Beating the Game Without Jumping', 'Top 10 Indie Games You Missed', 'This Speedrun Took 4 Years', 'Building a City With 1 Million People', 'I Played the Hardest Level 500 Times'],
  Music: ['lofi beats to study & relax to 📚', 'rainy night jazz — focus mix', 'synthwave drive 🌆 1 hour', 'acoustic morning coffee playlist', 'deep focus ambient for coding'],
  Fitness: ['10 Minute Full Body Workout (No Equipment)', 'Stretch Routine for Desk Workers', 'Beginner Running Plan: Week 1', '15 Min Core Burn'],
  Comedy: ['When the Group Project Goes Wrong', 'If Apps Were People', 'The Worst Job Interview Ever', 'Every Family Dinner Ever'],
  News: ['The Week Explained in 12 Minutes', 'How Elections Are Counted', 'What Rising Rents Mean for You', 'The Ocean Cleanup, One Year Later'],
  Sports: ['Film Study: The Perfect Fast Break', 'Top 50 Plays of the Season', 'Why This Defense Is Unbeatable', 'Rookie Season Breakdown'],
  Learning: ['The Entire History of Rome in 20 Minutes', 'Why 0.999... Equals 1', 'How Maps Lie to You', 'Learn Calculus in One Video', 'Growing Tomatoes on a Balcony'],
  Art: ['Watercolor Sunset for Beginners', 'Painting Loose Florals', '5 Mistakes Every Beginner Makes'],
  Podcasts: ['Ep. 112 — The Science of Sleep', 'Ep. 113 — Building a Company From Nothing', 'Ep. 114 — The Future of Cities'],
};

const SHORT_TITLES = ['Wait for it… 😂', 'This hack changed my life', 'POV: first day at the gym', 'Tiny kitchen, big flavor', 'Rate this setup 1-10', 'Nobody talks about this trick', 'Satisfying soap cutting', 'Speedrun skip explained in 30s', 'Sunset from the train 🌅', '1 minute physics', 'My cat vs the printer', 'Painting in 60 seconds'];

const COMMENT_BANK = ['This is exactly what I needed today, thank you!', 'The editing on this is incredible.', 'Who else is watching this at 2am? 😅', 'I\'ve been following for years and this might be your best one yet.', 'Can you do a part 2 please?', 'The part at 4:12 had me dying 😂', 'Super clear explanation. Subscribed!', 'Honestly underrated channel.', 'Saving this for later.', 'Watched it twice, still learning new things.', 'The music choice is perfect.', 'More of this kind of content please 🙏'];
const COMMENTERS = ['Aria Lin', 'MaxPower', 'nora.codes', 'Diego R.', 'quietfox', 'Sam Okafor', 'Jules', 'pixel_pilot', 'Hana M.', 'Theo', 'Priya K', 'bluejay'];

function buildSeed() {
  const now = Date.now(); const r = rng('vidora-seed-v1');
  const channels = {};
  SEED_CHANNELS.forEach(([id, name, handle, subs, cat, desc], i) => {
    channels[id] = { id, name, handle: '@' + handle, subs, category: cat, desc, verified: subs > 100000, color: avatarColor(id), joined: now - (400 + i * 170) * 86400000, links: [`${handle}.example`], country: pick(r, ['United States', 'Canada', 'United Kingdom', 'Germany', 'Japan', 'Australia', 'Brazil']) };
  });
  channels.me = { id: 'me', name: 'Your Channel', handle: '@you', subs: 12_480, category: 'Learning', desc: 'Welcome to my channel! Tutorials, vlogs and more.', verified: false, color: '#3ea6ff', joined: now - 900 * 86400000, links: [], country: 'United States', isMe: true };

  const videos = [];
  Object.values(channels).forEach(ch => {
    if (ch.isMe) return;
    const titles = TITLE_BANK[ch.category] || TITLE_BANK.Learning;
    titles.forEach((t, j) => {
      const isLive = ch.category === 'Music' && j === 0;
      const ageDays = Math.pow(r(), 2) * 700;
      videos.push({
        id: 'v_' + hashStr(ch.id + t).toString(36), channelId: ch.id, title: t, type: isLive ? 'live' : 'video',
        desc: `${t}\n\nIn this video we dig into everything you need to know. Thanks for watching — leave a comment with what you want to see next!\n\n0:00 Intro\n1:24 The setup\n4:10 Main part\n9:45 Results\n12:30 Final thoughts\n\n#${ch.category.toLowerCase()} #vidora`,
        duration: isLive ? 0 : Math.floor(120 + r() * (ch.category === 'Podcasts' ? 7200 : 1500)),
        views: Math.floor(ch.subs * (0.02 + r() * (r() > 0.9 ? 3 : 0.6))), likes: 0, uploaded: now - ageDays * 86400000,
        category: ch.category, visibility: 'public', watching: isLive ? Math.floor(5000 + r() * 30000) : 0,
      });
    });
  });
  videos.forEach(v => { v.likes = Math.floor(v.views * (0.02 + rng(v.id)() * 0.05)); });

  // Shorts
  SHORT_TITLES.forEach((t, i) => {
    const ch = Object.values(channels).filter(c => !c.isMe)[i % 13];
    const views = Math.floor(10000 + r() * 9_000_000);
    videos.push({ id: 's_' + i, channelId: ch.id, title: t, type: 'short', desc: t + ' #shorts', duration: 15 + Math.floor(r() * 45), views, likes: Math.floor(views * 0.06), uploaded: now - r() * 60 * 86400000, category: ch.category, visibility: 'public' });
  });

  // My channel videos
  [['How I Organize My Week (Notion Setup)', 'Learning'], ['Desk Setup Tour 2026', 'Tech'], ['My First Watercolor Attempt', 'Art']].forEach(([t, c], i) => {
    videos.push({ id: 'v_me' + i, channelId: 'me', title: t, type: 'video', desc: t, duration: 300 + i * 211, views: 3000 + i * 12000, likes: 200 + i * 700, uploaded: now - (10 + i * 30) * 86400000, category: c, visibility: 'public' });
  });

  // Comments
  const comments = {};
  videos.forEach(v => {
    const cr = rng(v.id + 'c'); const n = 4 + Math.floor(cr() * 6);
    comments[v.id] = Array.from({ length: n }, (_, k) => ({
      id: v.id + '_c' + k, author: pick(cr, COMMENTERS), text: pick(cr, COMMENT_BANK), ts: v.uploaded + cr() * (now - v.uploaded), likes: Math.floor(cr() * 4000), pinned: false, hearted: cr() > 0.8,
      replies: cr() > 0.6 ? [{ id: v.id + '_c' + k + 'r', author: channels[v.channelId].name, text: 'Thanks so much! 🙌', ts: now - cr() * 86400000 * 5, likes: Math.floor(cr() * 300), byCreator: true }] : [],
    }));
  });

  // Community posts
  const posts = [
    { id: 'p1', channelId: 'ch_byte', type: 'poll', text: 'What should the next teardown be?', options: [{ text: 'Foldable phone', votes: 18200 }, { text: 'VR headset', votes: 12400 }, { text: 'Robot vacuum', votes: 9100 }, { text: 'E-reader', votes: 3300 }], ts: now - 2 * 3600000, likes: 8200 },
    { id: 'p2', channelId: 'ch_kitchen', type: 'image', text: 'Tonight\'s experiment: miso caramel brownies. Recipe drops Friday 🍫', ts: now - 26 * 3600000, likes: 15400 },
    { id: 'p3', channelId: 'ch_orbit', type: 'text', text: 'Fun fact while you wait for Sunday\'s video: a teaspoon of neutron star material would weigh about as much as a mountain. Next video is all about them. 🌌', ts: now - 3 * 86400000, likes: 41000 },
    { id: 'p4', channelId: 'ch_pixel', type: 'poll', text: 'Which run do you want to see live?', options: [{ text: 'Any% glitchless', votes: 22000 }, { text: '100% no damage', votes: 31000 }], ts: now - 5 * 86400000, likes: 19000 },
    { id: 'p5', channelId: 'me', type: 'text', text: 'Thank you for 12K subscribers!! 🎉 Stories are now unlocked on the channel, so expect a lot more behind-the-scenes.', ts: now - 4 * 86400000, likes: 640 },
    { id: 'p6', channelId: 'ch_wander', type: 'image', text: 'Snow came early up north. New film next week.', ts: now - 6 * 86400000, likes: 7300 },
  ];
  posts.forEach(p => { p.comments = []; });

  // Stories — only for channels with 10,000+ subscribers
  const STORY_SCENES = [['☕', 'Morning edit session'], ['🎬', 'Behind the scenes!'], ['📦', 'Something new arrived…'], ['🌄', 'View from today\'s shoot'], ['🗳️', 'New video tomorrow — hype?'], ['🎧', 'Now playing in the studio'], ['🍜', 'Testing a recipe for next week'], ['🚆', 'On the road again']];
  const stories = [];
  Object.values(channels).forEach((ch, i) => {
    if (ch.subs < 10000 || i % 3 === 2) return;
    const sr = rng(ch.id + 'story'); const n = 1 + Math.floor(sr() * 3); const slides = [];
    for (let k = 0; k < n; k++) { const [emoji, text] = pick(sr, STORY_SCENES); slides.push({ id: uid('sl'), bg: pick(sr, PALETTES), emoji, text, ts: now - sr() * 6 * 86400000 }); }
    stories.push({ channelId: ch.id, slides });
  });

  const notifications = [
    { id: 'n1', channelId: 'ch_orbit', text: 'Orbit & Atom uploaded: What Happens Inside a Black Hole?', videoId: videos.find(v => v.channelId === 'ch_orbit').id, ts: now - 3600000, read: false },
    { id: 'n2', channelId: 'ch_lofi', text: 'Lumen Beats is live: lofi beats to study & relax to 📚', videoId: videos.find(v => v.type === 'live').id, ts: now - 2 * 3600000, read: false },
    { id: 'n3', channelId: 'ch_byte', text: 'Byte Lab posted: What should the next teardown be?', postId: 'p1', ts: now - 3 * 3600000, read: false },
    { id: 'n4', channelId: 'ch_kitchen', text: 'Kitchen Atlas added to their story', story: 'ch_kitchen', ts: now - 8 * 3600000, read: true },
    { id: 'n5', channelId: 'ch_pixel', text: 'PixelForge uploaded: This Speedrun Took 4 Years', videoId: videos.find(v => v.channelId === 'ch_pixel').id, ts: now - 86400000, read: true },
  ];

  return {
    version: 3, channels, videos, comments, posts, stories, notifications,
    playlists: [{ id: 'pl_fav', name: 'Favorites', videos: [], visibility: 'private', updated: now }],
    user: {
      subscriptions: ['ch_byte', 'ch_kitchen', 'ch_orbit', 'ch_pixel', 'ch_lofi', 'ch_wander', 'ch_learn', 'ch_pod'],
      bells: { ch_orbit: 'all' }, liked: [], disliked: [], watchLater: [], history: [], searchHistory: ['black hole', 'ramen recipe', 'lofi'],
      votes: {}, likedPosts: [], likedComments: [], viewedStories: [], theme: 'dark', autoplay: true, historyPaused: false, signedIn: true,
      progress: {},
    },
  };
}

/* ---------- persistence ---------- */
const STORE_KEY = 'vidora-db-v3';
let DB;
function loadDB() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const d = JSON.parse(raw); if (d.version === 3) { DB = d; return; } } } catch (e) { /* ignore */ }
  DB = buildSeed();
}
let saveTimer;
function saveDB() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { console.warn('save failed', e); } }, 150); }
function resetDB() { localStorage.removeItem(STORE_KEY); DB = buildSeed(); }

/* ---------- IndexedDB for uploaded media blobs ---------- */
const MediaStore = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const req = indexedDB.open('vidora-media', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('blobs');
      req.onsuccess = () => { this.db = req.result; res(this.db); };
      req.onerror = () => rej(req.error);
    });
  },
  async put(key, blob) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
  async get(key) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('blobs'); const q = tx.objectStore('blobs').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async del(key) { const db = await this.open(); return new Promise(res => { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').delete(key); tx.oncomplete = res; }); },
  urls: {},
  async url(key) { if (this.urls[key]) return this.urls[key]; const b = await this.get(key).catch(() => null); if (!b) return null; return (this.urls[key] = URL.createObjectURL(b)); },
};

/* ---------- query helpers ---------- */
const ch = id => DB.channels[id];
const vid = id => DB.videos.find(v => v.id === id);
const publicVideos = () => DB.videos.filter(v => v.visibility === 'public' || v.channelId === 'me');
const thumbOf = v => v.thumbKey && MediaStore.urls[v.thumbKey] ? MediaStore.urls[v.thumbKey] : (v.thumbData || thumbSVG(v.id, v.title, v.type === 'short' ? { w: 180, h: 320, vertical: true } : {}));
const isSubbed = id => DB.user.subscriptions.includes(id);
const STORY_TTL = 7 * 86400000;
const activeStories = () => DB.stories.map(s => ({ ...s, slides: s.slides.filter(sl => Date.now() - sl.ts < STORY_TTL) })).filter(s => s.slides.length && ch(s.channelId) && ch(s.channelId).subs >= 10000);
const storyUnseen = s => s.slides.some(sl => !DB.user.viewedStories.includes(sl.id));
