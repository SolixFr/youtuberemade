/* Vidora — shared UI: chrome, cards, menus, modals, actions. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isMobile = () => matchMedia('(max-width: 792px)').matches;
const go = h => { location.hash = h; };

/* ---------- toast ---------- */
let toastT;
function toast(msg, action) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { action.fn(); t.classList.remove('show'); };
  t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ---------- masthead ---------- */
function renderMasthead() {
  const me = ch('me'); const unread = DB.notifications.filter(n => !n.read).length;
  $('#masthead').innerHTML = `
    <div class="mh-start">
      <button class="icon-btn" id="guide-btn" aria-label="Guide">${icon('menu')}</button>
      <a class="logo" href="#/" title="Vidora Home">${logoSVG()}</a>
    </div>
    <div class="mh-center">
      <button class="icon-btn back-btn" id="msearch-back" aria-label="Back">${icon('back')}</button>
      <form class="search-form" id="search-form" role="search" autocomplete="off">
        <div class="search-box"><input id="search-input" name="q" placeholder="Search" aria-label="Search"></div>
        <button class="search-btn" aria-label="Search">${icon('search')}</button>
        <div class="suggest" id="suggest" hidden></div>
      </form>
      <button class="icon-btn mic-btn" id="mic-btn" title="Search with your voice">${icon('mic')}</button>
    </div>
    <div class="mh-end">
      <button class="icon-btn mh-mobile-search" id="msearch-btn" aria-label="Search">${icon('search')}</button>
      <button class="pill create-btn" id="create-btn" title="Create">${icon('plus')} Create</button>
      <button class="icon-btn" id="notif-btn" aria-label="Notifications">${icon('bell')}${unread ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
      <button class="avatar-btn" id="avatar-btn" aria-label="Account menu">${avatarHTML(me, 32)}</button>
    </div>`;
  $('#guide-btn').onclick = toggleGuide;
  $('#create-btn').onclick = e => openCreateMenu(e.currentTarget);
  $('#notif-btn').onclick = e => openNotifications(e.currentTarget);
  $('#avatar-btn').onclick = e => openAccountMenu(e.currentTarget);
  $('#msearch-btn').onclick = () => { document.body.classList.add('msearch'); $('#search-input').focus(); showSuggest(); };
  $('#msearch-back').onclick = () => { document.body.classList.remove('msearch'); $('#suggest').hidden = true; };
  $('#mic-btn').onclick = voiceSearch;
  const input = $('#search-input'); const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q'); if (q) input.value = q;
  input.addEventListener('focus', showSuggest);
  input.addEventListener('input', showSuggest);
  input.addEventListener('keydown', e => {
    const items = $$('#suggest a'); let i = items.findIndex(a => a.classList.contains('hl'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[i]?.classList.remove('hl'); i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length; items[i]?.classList.add('hl'); if (items[i]) input.value = items[i].dataset.q; }
    if (e.key === 'Escape') { $('#suggest').hidden = true; input.blur(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-form')) $('#suggest').hidden = true; });
  $('#search-form').onsubmit = e => { e.preventDefault(); doSearch(input.value); };
}
function doSearch(q) {
  q = q.trim(); if (!q) return; const h = DB.user.searchHistory; const i = h.indexOf(q); if (i >= 0) h.splice(i, 1); h.unshift(q); DB.user.searchHistory = h.slice(0, 12); saveDB();
  $('#suggest').hidden = true; $('#search-input').blur(); document.body.classList.remove('msearch'); go('#/results?q=' + encodeURIComponent(q));
}
function showSuggest() {
  const input = $('#search-input'); const q = input.value.trim().toLowerCase(); const box = $('#suggest');
  let items = [];
  const hist = DB.user.searchHistory.filter(s => s.toLowerCase().includes(q)).slice(0, q ? 3 : 10).map(s => ({ s, h: true }));
  if (q) {
    const pool = new Set(); publicVideos().forEach(v => { const t = v.title.toLowerCase(); if (t.includes(q)) pool.add(t.replace(/[^\w\s'&-]/g, '').trim().split(' ').slice(0, 6).join(' ')); });
    Object.values(DB.channels).forEach(c => { if (c.name.toLowerCase().includes(q)) pool.add(c.name.toLowerCase()); });
    items = hist.concat([...pool].filter(s => !hist.some(h => h.s === s)).slice(0, 10 - hist.length).map(s => ({ s })));
  } else items = hist;
  if (!items.length) { box.hidden = true; return; }
  box.innerHTML = items.map(it => `<a href="#" data-q="${esc(it.s)}">${icon(it.h ? 'history' : 'search', 'sm')}<span>${esc(it.s)}</span>${it.h ? '<span class="rm" data-rm="1">Remove</span>' : ''}</a>`).join('');
  box.hidden = false;
  box.onclick = e => { e.preventDefault(); const a = e.target.closest('a'); if (!a) return;
    if (e.target.dataset.rm) { DB.user.searchHistory = DB.user.searchHistory.filter(s => s !== a.dataset.q); saveDB(); showSuggest(); return; }
    input.value = a.dataset.q; doSearch(a.dataset.q); };
}
function voiceSearch() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const m = modal(`<div style="text-align:center;padding:24px 8px"><div style="width:96px;height:96px;border-radius:50%;background:#e3123f;color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 24px">${icon('mic')}</div><h2 id="vs-text" style="font-weight:400">${SR ? 'Listening…' : 'Voice search isn\'t supported in this browser'}</h2></div>`, { title: 'Search with your voice', width: 560 });
  if (!SR) return;
  const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true;
  rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(''); $('#vs-text').textContent = t; if (e.results[e.results.length - 1].isFinal) { m.close(); doSearch(t); } };
  rec.onerror = () => { $('#vs-text').textContent = "Didn't hear that. Try again."; };
  rec.start(); m.onClose = () => rec.abort();
}

/* ---------- guide ---------- */
function guideItem(href, ic, label, active, extra = '') { return `<a class="g-item ${active ? 'active' : ''}" href="${href}" title="${esc(label)}">${ic}<span class="lbl">${esc(label)}</span>${extra}</a>`; }
function renderGuide() {
  const r = currentRoute; const p = r.parts[0] || '';
  const live = DB.videos.filter(v => v.type === 'live').map(v => v.channelId);
  const subs = DB.user.subscriptions.map(ch).filter(Boolean);
  const subsHTML = subs.slice(0, 7).map(c => guideItem('#/channel/' + c.id, avatarHTML(c, 24), c.name, p === 'channel' && r.parts[1] === c.id, live.includes(c.id) ? icon('live', 'live-ic') : (hasNewUploads(c.id) ? '<span class="dot"></span>' : ''))).join('');
  $('#guide').innerHTML = `
    <div class="drawer-head"><button class="icon-btn" onclick="toggleGuide()">${icon('menu')}</button><a class="logo" href="#/">${logoSVG()}</a></div>
    <div class="g-section">
      ${guideItem('#/', icon('home'), 'Home', p === '')}
      ${guideItem('#/shorts', icon('shorts'), 'Shorts', p === 'shorts')}
      ${guideItem('#/subscriptions', icon('subs'), 'Subscriptions', p === 'subscriptions')}
      <span class="mini-only"></span>
      ${guideItem('#/you', icon('you'), 'You', p === 'you')}
    </div>
    <div class="g-section full">
      <a class="g-title" href="#/you">You ${icon('chevronRight', 'sm')}</a>
      ${guideItem('#/channel/me', icon('myvideos'), 'Your channel', p === 'channel' && r.parts[1] === 'me')}
      ${guideItem('#/history', icon('history'), 'History', p === 'history')}
      ${guideItem('#/playlists', icon('playlist'), 'Playlists', p === 'playlists')}
      ${guideItem('#/studio/content', icon('myvideos'), 'Your videos', false)}
      ${guideItem('#/playlist/WL', icon('clock'), 'Watch later', p === 'playlist' && r.parts[1] === 'WL')}
      ${guideItem('#/playlist/LL', icon('like'), 'Liked videos', p === 'playlist' && r.parts[1] === 'LL')}
    </div>
    <div class="g-section full">
      <div class="g-title">Subscriptions</div>
      ${subsHTML || '<div class="muted" style="padding:8px 12px">Subscribe to channels to see them here.</div>'}
      ${subs.length > 7 ? `<a class="g-item" href="#/channels">${icon('chevronDown')}<span class="lbl">Show ${subs.length - 7} more</span></a>` : ''}
      ${guideItem('#/channels', icon('playlist'), 'All subscriptions', p === 'channels')}
    </div>
    <div class="g-section full">
      <div class="g-title">Explore</div>
      ${[['trending', 'trending', 'Trending'], ['music', 'music', 'Music'], ['live', 'live', 'Live'], ['gaming', 'gaming', 'Gaming'], ['news', 'news', 'News'], ['sports', 'sports', 'Sports'], ['learning', 'learning', 'Learning'], ['podcasts', 'podcast', 'Podcasts']].map(([k, ic, l]) => guideItem('#/feed/' + k, icon(ic), l, p === 'feed' && r.parts[1] === k)).join('')}
    </div>
    <div class="g-section full">
      ${guideItem('#/studio', icon('studio'), 'Vidora Studio', false)}
      ${guideItem('#/settings', icon('settings'), 'Settings', p === 'settings')}
      ${guideItem('#/history', icon('flag'), 'Report history', false)}
      ${guideItem('#/help', icon('help'), 'Help', p === 'help')}
      <a class="g-item" href="#" onclick="openFeedback();return false">${icon('feedback')}<span class="lbl">Send feedback</span></a>
    </div>
    <div class="g-footer">
      <div><a href="#/help">About</a><a href="#/help">Press</a><a href="#/help">Copyright</a><a href="#/help">Contact us</a><a href="#/help">Creators</a><a href="#/help">Developers</a></div>
      <div style="margin-top:8px"><a href="#/help">Terms</a><a href="#/help">Privacy</a><a href="#/help">Policy &amp; Safety</a><a href="#/help">Test new features</a></div>
      <div style="margin-top:12px;opacity:.7">© 2026 Vidora — an original demo project</div>
    </div>`;
  if (document.body.classList.contains('guide-mini')) {
    $$('#guide .g-section:not(.full) .g-item').forEach(a => a.title = a.textContent.trim());
  }
}
function hasNewUploads(cid) { return DB.videos.some(v => v.channelId === cid && Date.now() - v.uploaded < 3 * 86400000); }

let guidePref = localStorage.getItem('vidora-guide') || 'full';
function applyGuideMode() {
  const b = document.body; b.classList.remove('guide-mini', 'guide-none', 'guide-drawer', 'drawer-open');
  const w = innerWidth; const route = currentRoute.parts[0];
  if (route === 'watch' || route === 'studio' || route === 'shorts' && w < 1100) b.classList.add('guide-drawer');
  else if (w < 1312 && w > 792) b.classList.add(guidePref === 'none' ? 'guide-drawer' : 'guide-mini');
  else if (w > 792 && guidePref === 'mini') b.classList.add('guide-mini');
  if (route === 'studio') b.classList.add('studio-mode'); else b.classList.remove('studio-mode');
}
function toggleGuide() {
  const b = document.body;
  if (b.classList.contains('guide-drawer')) { b.classList.toggle('drawer-open'); return; }
  if (innerWidth < 1312) { guidePref = 'none'; }
  else { guidePref = b.classList.contains('guide-mini') ? 'full' : 'mini'; }
  localStorage.setItem('vidora-guide', guidePref); applyGuideMode(); renderGuide();
  if (innerWidth < 1312 && innerWidth > 792) { b.classList.add('drawer-open'); }
}

/* ---------- bottom nav (mobile) ---------- */
function renderBottomNav() {
  const p = currentRoute.parts[0] || '';
  $('#bottom-nav').innerHTML = `
    <a href="#/" class="${p === '' ? 'on' : ''}">${icon('home')}<span>Home</span></a>
    <a href="#/shorts" class="${p === 'shorts' ? 'on' : ''}">${icon('shorts')}<span>Shorts</span></a>
    <button class="bn-create" aria-label="Create"><span class="c">${icon('plus')}</span></button>
    <a href="#/subscriptions" class="${p === 'subscriptions' ? 'on' : ''}">${icon('subs')}<span>Subscriptions</span></a>
    <a href="#/you" class="${p === 'you' || p === 'channel' && currentRoute.parts[1] === 'me' ? 'on' : ''}">${avatarHTML(ch('me'), 24)}<span>You</span></a>`;
  $('#bottom-nav .bn-create').onclick = e => openCreateMenu(e.currentTarget, true);
}

/* ---------- menus ---------- */
let openMenuEl = null;
function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
function menu(anchor, html, opts = {}) {
  closeMenu(); const m = document.createElement('div'); m.className = 'menu ' + (opts.cls || '') + (isMobile() && opts.sheet !== false ? ' sheet' : ''); m.innerHTML = html;
  document.body.appendChild(m); openMenuEl = m;
  const r = anchor.getBoundingClientRect(); const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = opts.alignLeft ? r.left : r.right - mw; left = Math.max(8, Math.min(innerWidth - mw - 8, left));
  let top = r.bottom + 4; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target) || e.target.closest('[data-close]')) { if (m === openMenuEl) closeMenu(); document.removeEventListener('click', off, true); } }, true), 0);
  return m;
}
function openCreateMenu(anchor, mobile) {
  const m = menu(anchor, `
    ${mobile ? '<div style="padding:8px 16px;font-size:16px;font-weight:500">Create</div>' : ''}
    <button data-close data-a="upload">${icon('upload')} Upload video</button>
    <button data-close data-a="short">${icon('shorts')} Create a Short</button>
    <button data-close data-a="live">${icon('live')} Go live</button>
    <button data-close data-a="post">${icon('post')} Create post</button>
    <button data-close data-a="story">${icon('story')} Create story <span class="pill-tag" style="margin-left:auto">Back!</span></button>`, { cls: '' });
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'upload') openUploadDialog(); else if (a === 'short') openUploadDialog({ short: true }); else if (a === 'live') go('#/studio/live'); else if (a === 'post') openPostComposer(); else if (a === 'story') openStoryEditor(); };
}
function openNotifications(anchor) {
  const items = DB.notifications.slice().sort((a, b) => b.ts - a.ts);
  const m = menu(anchor, `<div class="nh"><span>Notifications</span><button class="icon-btn" data-set>${icon('settings')}</button></div>
    ${items.length ? items.map(n => { const v = n.videoId && vid(n.videoId); return `<div class="notif ${n.read ? '' : 'unread'}" data-n="${n.id}">${avatarHTML(ch(n.channelId), 48)}<div class="t">${esc(n.text)}<small>${timeAgo(n.ts)}</small></div>${v ? `<img src="${thumbOf(v)}" alt="">` : ''}<button class="icon-btn" data-dots="${n.id}">${icon('dots')}</button></div>`; }).join('') : '<div class="empty" style="padding:48px">' + icon('bell') + '<h2>Your notifications live here</h2><p>Subscribe to your favorite channels to get notified about their latest videos.</p></div>'}`, { cls: 'notif-menu' });
  m.onclick = e => {
    if (e.target.closest('[data-set]')) { closeMenu(); go('#/settings'); return; }
    const d = e.target.closest('[data-dots]'); if (d) { e.stopPropagation(); DB.notifications = DB.notifications.filter(n => n.id !== d.dataset.dots); saveDB(); closeMenu(); renderMasthead(); toast('Notification hidden'); return; }
    const el = e.target.closest('[data-n]'); if (!el) return; const n = DB.notifications.find(x => x.id === el.dataset.n); n.read = true; saveDB(); closeMenu(); renderMasthead();
    if (n.videoId) go('#/watch/' + n.videoId); else if (n.postId) go('#/post/' + n.postId); else if (n.story) openStoryViewer(n.story);
  };
  setTimeout(() => { DB.notifications.forEach(n => n.read = true); saveDB(); }, 1500);
}
function openAccountMenu(anchor) {
  const me = ch('me'); const dark = DB.user.theme === 'dark';
  const m = menu(anchor, `
    <div class="menu-head">${avatarHTML(me, 40)}<div class="mh-txt"><span class="n">${esc(me.name)}</span><span>${esc(me.handle)}</span><a href="#/channel/me" data-close>View your channel</a></div></div><hr>
    <button data-close data-a="switch">${icon('switch')} Switch account ${icon('chevronRight', 'sm chev')}</button>
    <button data-close data-a="out">${icon('logout')} Sign out</button><hr>
    <a href="#/studio" data-close>${icon('studio')} Vidora Studio</a>
    <a href="#/settings" data-close>${icon('money')} Purchases and memberships</a><hr>
    <button data-a="theme">${icon(dark ? 'moon' : 'sun')} Appearance: ${dark ? 'Dark' : 'Light'} theme ${icon('chevronRight', 'sm chev')}</button>
    <button data-close data-a="lang">${icon('globe')} Language: English ${icon('chevronRight', 'sm chev')}</button>
    <button data-close data-a="keys">${icon('keyboard')} Keyboard shortcuts</button><hr>
    <a href="#/settings" data-close>${icon('settings')} Settings</a>
    <a href="#/help" data-close>${icon('help')} Help</a>
    <button data-close data-a="fb">${icon('feedback')} Send feedback</button>`, { sheet: true });
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'theme') { setTheme(dark ? 'light' : 'dark'); closeMenu(); openAccountMenu(anchor); }
    if (a === 'keys') openShortcuts(); if (a === 'fb') openFeedback();
    if (a === 'out') toast('This demo keeps you signed in so you can try every feature.');
    if (a === 'switch') toast('Only one account in this demo');
    if (a === 'lang') toast('More languages coming soon'); };
}
function setTheme(t) { DB.user.theme = t; saveDB(); document.documentElement.dataset.theme = t; $('meta[name=theme-color]').content = t === 'dark' ? '#0f0f0f' : '#ffffff'; }

function videoMenu(anchor, v) {
  const inWL = DB.user.watchLater.includes(v.id); const mine = v.channelId === 'me';
  const m = menu(anchor, `
    <button data-close data-a="queue">${icon('playlist')} Add to queue</button>
    <button data-close data-a="wl">${icon('clock')} ${inWL ? 'Remove from' : 'Save to'} Watch later</button>
    <button data-close data-a="save">${icon('save')} Save to playlist</button>
    <button data-close data-a="dl">${icon('download')} Download</button>
    <button data-close data-a="share">${icon('share')} Share</button><hr>
    ${mine ? `<button data-close data-a="edit">${icon('edit')} Edit in Studio</button>` : `<button data-close data-a="ni">${icon('close')} Not interested</button><button data-close data-a="dr">${icon('flag')} Don't recommend channel</button><button data-close data-a="rep">${icon('flag')} Report</button>`}`);
  m.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'wl') toggleWatchLater(v.id); if (a === 'save') openSaveDialog(v.id); if (a === 'share') openShare(v);
    if (a === 'queue') { Queue.push(v.id); toast('Added to queue'); }
    if (a === 'dl') fakeDownload(v);
    if (a === 'edit') go('#/studio/edit/' + v.id);
    if (a === 'ni') { hidden.add(v.id); toast('Video removed', { label: 'Undo', fn: () => { hidden.delete(v.id); rerender(); } }); rerender(); }
    if (a === 'dr') { hiddenCh.add(v.channelId); toast('We won\'t recommend this channel to you again', { label: 'Undo', fn: () => { hiddenCh.delete(v.channelId); rerender(); } }); rerender(); }
    if (a === 'rep') openReport(); };
}
const hidden = new Set(); const hiddenCh = new Set();
const Queue = [];

/* ---------- modal ---------- */
function modal(html, opts = {}) {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal" style="width:${opts.width || 520}px" role="dialog" aria-modal="true">${opts.title !== undefined ? `<div class="modal-head"><span>${esc(opts.title)}</span><button class="icon-btn" data-x aria-label="Close">${icon('close')}</button></div>` : ''}<div class="modal-body">${html}</div>${opts.foot ? `<div class="modal-foot">${opts.foot}</div>` : ''}</div>`;
  $('#overlay-root').appendChild(back); document.body.classList.add('no-scroll');
  const api = { el: back, body: back.querySelector('.modal-body'), close() { back.remove(); if (!$('#overlay-root').children.length) document.body.classList.remove('no-scroll'); api.onClose && api.onClose(); } };
  back.addEventListener('mousedown', e => { if (e.target === back && !opts.sticky) api.close(); });
  back.querySelector('[data-x]') && (back.querySelector('[data-x]').onclick = () => api.close());
  return api;
}
function confirmDialog(title, text, okLabel = 'Delete') {
  return new Promise(res => { const m = modal(`<p class="muted">${esc(text)}</p>`, { title, width: 420, foot: `<button class="text-btn" data-no>Cancel</button><button class="text-btn" data-ok>${esc(okLabel)}</button>` });
    m.el.querySelector('[data-no]').onclick = () => { m.close(); res(false); }; m.el.querySelector('[data-ok]').onclick = () => { m.close(); res(true); }; });
}
function openShare(v, opts = {}) {
  const url = location.origin + location.pathname + (opts.url || '#/watch/' + v.id);
  const nets = [['Embed', '#555', '&lt;&gt;'], ['WhatsApp', '#25d366', 'W'], ['Facebook', '#1877f2', 'f'], ['X', '#000', 'X'], ['Email', '#888', '@'], ['KakaoTalk', '#fbe300', 'K'], ['Reddit', '#ff4500', 'r'], ['VK', '#0077ff', 'vk'], ['Pinterest', '#e60023', 'P'], ['LinkedIn', '#0a66c2', 'in']];
  const m = modal(`<div class="share-row">${nets.map(([n, c, l]) => `<button class="s" data-n="${n}"><span class="c" style="background:${c}">${l}</span>${n}</button>`).join('')}</div>
    <div class="copy-row"><input readonly value="${esc(url)}" id="share-url"><button class="pill blue" id="copy-btn">Copy</button></div>
    ${v && v.duration && !opts.url ? `<label class="check-row" style="margin-top:12px"><input type="checkbox" id="share-ts"> Start at <span>${fmtDur(currentPlayer ? currentPlayer.src.currentTime : 0)}</span></label>` : ''}`, { title: 'Share', width: 520 });
  const inp = $('#share-url', m.el);
  $('#share-ts', m.el) && ($('#share-ts', m.el).onchange = e => { inp.value = url + (e.target.checked ? '?t=' + Math.floor(currentPlayer ? currentPlayer.src.currentTime : 0) : ''); });
  $('#copy-btn', m.el).onclick = () => { navigator.clipboard?.writeText(inp.value).catch(() => {}); inp.select(); toast('Link copied to clipboard'); };
  m.el.querySelector('.share-row').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; if (navigator.share && b.dataset.n !== 'Embed') navigator.share({ title: v ? v.title : 'Vidora', url: inp.value }).catch(() => {}); else if (b.dataset.n === 'Embed') { inp.value = `<iframe width="560" height="315" src="${url}" frameborder="0" allowfullscreen></iframe>`; } else toast('Shared to ' + b.dataset.n); };
}
function openSaveDialog(vidId) {
  const render = () => `${[{ id: 'WL', name: 'Watch later', has: DB.user.watchLater.includes(vidId), vis: 'private' }].concat(DB.playlists.map(p => ({ id: p.id, name: p.name, has: p.videos.includes(vidId), vis: p.visibility }))).map(p => `<label class="check-row"><input type="checkbox" data-pl="${p.id}" ${p.has ? 'checked' : ''}><span style="flex:1">${esc(p.name)}</span>${icon(p.vis === 'public' ? 'globe' : 'lock', 'sm')}</label>`).join('')}
    <div id="newpl" style="margin-top:12px"><button class="pill" id="newpl-btn" style="width:100%;justify-content:center">${icon('plus')} New playlist</button></div>`;
  const m = modal(render(), { title: 'Save video to…', width: 320 });
  const bind = () => {
    m.body.onchange = e => { const c = e.target.closest('[data-pl]'); if (!c) return; const id = c.dataset.pl;
      if (id === 'WL') toggleWatchLater(vidId, true); else { const p = DB.playlists.find(x => x.id === id); if (c.checked) p.videos.unshift(vidId); else p.videos = p.videos.filter(x => x !== vidId); p.updated = Date.now(); saveDB(); toast((c.checked ? 'Saved to ' : 'Removed from ') + p.name); } };
    $('#newpl-btn', m.el).onclick = () => { $('#newpl', m.el).innerHTML = `<div class="field-box"><label>Title</label><input id="pl-name" maxlength="150" placeholder="Choose a title"></div><div class="field-box"><label>Visibility</label><select id="pl-vis"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="text-btn" id="pl-cancel">Cancel</button><button class="text-btn" id="pl-create">Create</button></div>`; $('#pl-name', m.el).focus();
      $('#pl-cancel', m.el).onclick = () => { m.body.innerHTML = render(); bind(); };
      $('#pl-create', m.el).onclick = () => { const n = $('#pl-name', m.el).value.trim(); if (!n) return; DB.playlists.push({ id: uid('pl'), name: n, videos: [vidId], visibility: $('#pl-vis', m.el).value, updated: Date.now() }); saveDB(); toast('Saved to ' + n); m.close(); renderGuide(); }; };
  };
  bind();
}
function toggleWatchLater(id, quiet) { const wl = DB.user.watchLater; const i = wl.indexOf(id); if (i >= 0) wl.splice(i, 1); else wl.unshift(id); saveDB(); toast(i >= 0 ? 'Removed from Watch later' : 'Saved to Watch later', i >= 0 ? null : { label: 'Undo', fn: () => toggleWatchLater(id) }); }
function fakeDownload(v) {
  const m = modal(`<p class="muted" style="margin-top:0">Choose download quality</p>${['Full HD (1080p)', 'High (720p)', 'Medium (360p)', 'Low (144p)'].map((q, i) => `<label class="check-row"><input type="radio" name="dq" ${i === 1 ? 'checked' : ''}> ${q}</label>`).join('')}<div class="progress-line" style="margin-top:16px" hidden><i style="width:0"></i></div>`, { title: 'Download video', width: 380, foot: '<button class="text-btn" data-x2>Cancel</button><button class="pill blue" data-go>Download</button>' });
  m.el.querySelector('[data-x2]').onclick = () => m.close();
  m.el.querySelector('[data-go]').onclick = async () => {
    if (v.mediaKey) { const url = await MediaStore.url(v.mediaKey); const a = document.createElement('a'); a.href = url; a.download = v.title + '.mp4'; a.click(); m.close(); return; }
    const pl = $('.progress-line', m.el); pl.hidden = false; let p = 0; const t = setInterval(() => { p += 9; pl.firstChild.style.width = Math.min(100, p) + '%'; if (p >= 100) { clearInterval(t); m.close(); DB.user.downloads = [...new Set([v.id, ...(DB.user.downloads || [])])]; saveDB(); toast('Downloaded — find it in You › Downloads'); } }, 120);
  };
}
function openReport() {
  const m = modal(['Sexual content', 'Violent or repulsive content', 'Hateful or abusive content', 'Harassment or bullying', 'Harmful or dangerous acts', 'Misinformation', 'Child abuse', 'Promotes terrorism', 'Spam or misleading', 'Legal issue', 'Captions issue'].map(r => `<label class="check-row"><input type="radio" name="rr"> ${r}</label>`).join(''), { title: 'Report video', width: 420, foot: '<button class="text-btn" data-x2>Cancel</button><button class="text-btn" data-ok>Next</button>' });
  m.el.querySelector('[data-x2]').onclick = () => m.close(); m.el.querySelector('[data-ok]').onclick = () => { m.close(); toast('Thanks for reporting'); };
}
function openFeedback() {
  const m = modal(`<div class="field-box"><label>Tell us what prompted this feedback…</label><textarea rows="5"></textarea></div><p class="muted" style="font-size:12px">Please don't include any sensitive information.</p>`, { title: 'Send feedback to Vidora', width: 440, foot: '<button class="pill blue" data-ok>Send</button>' });
  m.el.querySelector('[data-ok]').onclick = () => { m.close(); toast('Thanks for the feedback!'); };
}
function openShortcuts() {
  const rows = [['k / Space', 'Toggle play/pause'], ['j', 'Rewind 10 seconds'], ['l', 'Fast forward 10 seconds'], ['← / →', 'Seek 5 seconds'], ['m', 'Toggle mute'], ['f', 'Toggle full screen'], ['t', 'Toggle theater mode'], ['i', 'Toggle miniplayer'], ['c', 'Toggle captions'], ['0-9', 'Seek to 0%–90%'], ['Shift+N', 'Next video'], ['/', 'Go to search box'], ['Shift+?', 'Show shortcuts']];
  modal(`<table style="width:100%;border-collapse:collapse">${rows.map(([k, d]) => `<tr><td style="padding:8px 0">${d}</td><td style="text-align:right"><code style="background:var(--bg-chip);padding:2px 8px;border-radius:4px">${k}</code></td></tr>`).join('')}</table>`, { title: 'Keyboard shortcuts', width: 460 });
}

/* ---------- actions ---------- */
function subscribe(cid, btnHost) {
  const s = DB.user.subscriptions; const i = s.indexOf(cid);
  if (i >= 0) {
    return confirmDialog('', `Unsubscribe from ${ch(cid).name}?`, 'Unsubscribe').then(ok => { if (!ok) return; s.splice(i, 1); ch(cid).subs = Math.max(0, ch(cid).subs - 1); delete DB.user.bells[cid]; saveDB(); renderGuide(); rerenderSubscribe(cid); toast('Subscription removed'); });
  }
  s.push(cid); ch(cid).subs++; DB.user.bells[cid] = 'personalized'; saveDB(); renderGuide(); rerenderSubscribe(cid); toast('Subscription added'); return Promise.resolve();
}
function subscribeBtnHTML(cid) {
  if (cid === 'me') return `<a class="pill" href="#/studio/customize">Customize channel</a><a class="pill" href="#/studio/content">Manage videos</a>`;
  if (!isSubbed(cid)) return `<button class="pill inverse sub-btn" data-sub="${cid}">Subscribe</button>`;
  const b = DB.user.bells[cid] || 'personalized';
  return `<button class="pill sub-btn" data-sub-menu="${cid}">${icon(b === 'all' ? 'bellOn' : b === 'none' ? 'bellOff' : 'bell')} Subscribed ${icon('chevronDown', 'sm')}</button>`;
}
function rerenderSubscribe(cid) { $$(`[data-subwrap="${cid}"]`).forEach(w => w.innerHTML = subscribeBtnHTML(cid)); $$(`[data-subcount="${cid}"]`).forEach(e => e.textContent = fmtCount(ch(cid).subs) + ' subscribers'); }
document.addEventListener('click', e => {
  const s = e.target.closest('[data-sub]'); if (s) { e.preventDefault(); e.stopPropagation(); subscribe(s.dataset.sub); return; }
  const sm = e.target.closest('[data-sub-menu]');
  if (sm) { e.preventDefault(); e.stopPropagation(); const cid = sm.dataset.subMenu; const b = DB.user.bells[cid] || 'personalized';
    const m = menu(sm, `<button data-close data-b="all">${icon('bellOn')} All ${b === 'all' ? icon('check', 'sm chev') : ''}</button><button data-close data-b="personalized">${icon('bell')} Personalized ${b === 'personalized' ? icon('check', 'sm chev') : ''}</button><button data-close data-b="none">${icon('bellOff')} None ${b === 'none' ? icon('check', 'sm chev') : ''}</button><button data-close data-b="unsub">${icon('close')} Unsubscribe</button>`, { alignLeft: true });
    m.onclick = ev => { const x = ev.target.closest('[data-b]'); if (!x) return; if (x.dataset.b === 'unsub') subscribe(cid); else { DB.user.bells[cid] = x.dataset.b; saveDB(); rerenderSubscribe(cid); toast(x.dataset.b === 'all' ? "You'll get all notifications" : x.dataset.b === 'none' ? "You won't get notifications" : "You'll get personalized notifications"); } }; }
  const more = e.target.closest('[data-vmenu]'); if (more) { e.preventDefault(); e.stopPropagation(); videoMenu(more, vid(more.dataset.vmenu)); return; }
  const wl = e.target.closest('[data-wl]'); if (wl) { e.preventDefault(); e.stopPropagation(); toggleWatchLater(wl.dataset.wl); return; }
  const q = e.target.closest('[data-queue]'); if (q) { e.preventDefault(); e.stopPropagation(); Queue.push(q.dataset.queue); toast('Added to queue'); return; }
  const sb = e.target.closest('[data-story]'); if (sb) { e.preventDefault(); e.stopPropagation(); openStoryViewer(sb.dataset.story); return; }
});
function rate(v, kind) {
  const L = DB.user.liked, D = DB.user.disliked; const inL = L.includes(v.id), inD = D.includes(v.id);
  DB.user.liked = L.filter(x => x !== v.id); DB.user.disliked = D.filter(x => x !== v.id); if (inL) v.likes--;
  if (kind === 'like' && !inL) { DB.user.liked.unshift(v.id); v.likes++; toast('Added to Liked videos'); }
  if (kind === 'dislike' && !inD) { DB.user.disliked.push(v.id); toast('You dislike this video'); }
  if (kind === 'like' && inL) toast('Removed from Liked videos');
  saveDB();
}

/* ---------- cards ---------- */
function durBadge(v) {
  if (v.type === 'live') return `<span class="dur live">${icon('live', 'xs')} LIVE</span>`;
  if (v.type === 'short') return '';
  return `<span class="dur">${fmtDur(v.duration)}</span>`;
}
function progBar(v) { const p = DB.user.progress[v.id]; return p > 0.02 ? `<div class="prog"><span style="width:${Math.min(100, p * 100)}%"></span></div>` : ''; }
function viewsLine(v) { if (v.type === 'live') return `${fmtCount(v.watching)} watching`; return `${fmtCount(v.views)} views • ${timeAgo(v.uploaded)}`; }
function chName(c) { return `<a class="ch-name" href="#/channel/${c.id}" onclick="event.stopPropagation()">${esc(c.name)}${c.verified ? icon('verified', 'vchk') : ''}</a>`; }
function videoCard(v) {
  const c = ch(v.channelId);
  return `<div class="card" data-href="#/watch/${v.id}">
    <a class="thumb" href="#/watch/${v.id}"><img loading="lazy" src="${thumbOf(v)}" alt="">${durBadge(v)}${progBar(v)}
      <span class="hover-actions"><button data-wl="${v.id}" title="Watch later">${icon('clock')}</button><button data-queue="${v.id}" title="Add to queue">${icon('playlist')}</button></span></a>
    <div class="meta">
      <a href="#/channel/${c.id}" onclick="event.stopPropagation()" class="${activeStories().some(s => s.channelId === c.id) ? '' : ''}">${avatarHTML(c, 36)}</a>
      <div class="meta-text"><h3 class="v-title" title="${esc(v.title)}">${esc(v.title)}</h3>
        <div class="v-sub">${chName(c)}<span class="line2">${viewsLine(v)}</span></div>
        ${v.type === 'live' ? `<span class="badge-live">${icon('live', 'xs')} LIVE</span>` : Date.now() - v.uploaded < 2 * 86400000 ? '<span class="badge-new">New</span>' : ''}</div>
      <button class="icon-btn more" data-vmenu="${v.id}" aria-label="Action menu">${icon('dots')}</button>
    </div></div>`;
}
function shortCard(v) {
  return `<div class="short-card" data-href="#/shorts/${v.id}"><div class="thumb"><img loading="lazy" src="${thumbOf(v)}" alt=""></div>
    <h3 class="v-title">${esc(v.title)}</h3><div class="v-sub">${fmtCount(v.views)} views</div></div>`;
}
function compactCard(v) {
  const c = ch(v.channelId);
  return `<div class="compact" data-href="#/watch/${v.id}"><div class="thumb"><img loading="lazy" src="${thumbOf(v)}" alt="">${durBadge(v)}${progBar(v)}</div>
    <div style="display:flex;min-width:0;flex:1"><span class="compact-av">${avatarHTML(c, 36)}</span><div class="meta-text"><h3 class="v-title">${esc(v.title)}</h3><div class="v-sub">${chName(c)}<span class="line2">${viewsLine(v)}</span></div></div></div>
    <button class="icon-btn more" data-vmenu="${v.id}">${icon('dots')}</button></div>`;
}
function listItem(v, small) {
  const c = ch(v.channelId);
  return `<div class="list-item ${small ? 'small' : ''}" data-href="${v.type === 'short' ? '#/shorts/' : '#/watch/'}${v.id}"><div class="thumb"><img loading="lazy" src="${thumbOf(v)}" alt="">${durBadge(v)}${progBar(v)}</div>
    <div class="meta-text"><h3 class="v-title">${esc(v.title)}</h3><div class="v-sub">${small ? `${esc(c.name)} • ` : ''}${viewsLine(v)}</div>
      ${small ? '' : `<div class="ch-line">${avatarHTML(c, 24)}${chName(c)}</div><div class="snippet">${esc((v.desc || '').split('\n').filter(Boolean).slice(1, 2).join(' '))}</div>`}</div>
    <button class="icon-btn more" data-vmenu="${v.id}">${icon('dots')}</button></div>`;
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-href]'); if (!c) return; if (e.target.closest('a,button')) { const a = e.target.closest('a'); if (a && a.closest('[data-href]') === c && a.classList.contains('thumb')) { e.preventDefault(); go(c.dataset.href); } return; }
  go(c.dataset.href);
});

/* ---------- stories row ---------- */
function storiesRow(opts = {}) {
  const st = activeStories().filter(s => opts.all || isSubbed(s.channelId) || s.channelId === 'me');
  const me = ch('me'); const mine = st.find(s => s.channelId === 'me');
  const eligible = me.subs >= 10000;
  const others = st.filter(s => s.channelId !== 'me').sort((a, b) => storyUnseen(b) - storyUnseen(a));
  const bubble = (s) => { const c = ch(s.channelId); return `<button class="story-bubble" data-story="${c.id}"><span class="ring ${storyUnseen(s) ? 'unseen' : ''}">${avatarHTML(c, 64)}</span><span class="name">${esc(c.name)}</span></button>`; };
  const myBubble = eligible ? `<button class="story-bubble" ${mine ? `data-story="me"` : 'onclick="openStoryEditor()"'}><span class="ring ${mine && storyUnseen(mine) ? 'unseen' : ''}">${avatarHTML(me, 64)}<span class="add" onclick="event.stopPropagation();openStoryEditor()">${icon('plus')}</span></span><span class="name">Your story</span></button>` : '';
  if (!others.length && !myBubble) return '';
  return `<div class="stories-wrap"><div class="stories-title">Stories <span class="pill-tag">Back</span></div><div class="stories-row">${myBubble}${others.map(bubble).join('')}</div></div>`;
}
