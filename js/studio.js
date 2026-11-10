/* Vidora Studio — dashboard, content, upload, edit, analytics, comments, live, customization. */
function pageStudio(tab = 'dashboard', arg) {
  const me = ch('me');
  const nav = [['dashboard', 'dashboard', 'Dashboard'], ['content', 'content', 'Content'], ['analytics', 'analytics', 'Analytics'], ['comments', 'comment', 'Comments'], ['stories', 'story', 'Stories'], ['live', 'live', 'Go live'], ['customize', 'edit', 'Customization']];
  $('#page').innerHTML = `<div class="studio"><nav class="studio-nav"><div class="me">${avatarHTML(me, 112)}<b>Your channel</b><span class="muted">${esc(me.name)}</span></div>
    ${nav.map(([k, ic, l]) => `<a href="#/studio/${k}" class="${tab === k || (tab === 'edit' && k === 'content') ? 'on' : ''}" title="${l}">${icon(ic)}<span>${l}</span></a>`).join('')}
    <a href="#/channel/me" title="View channel">${icon('myvideos')}<span>View channel</span></a></nav>
    <div class="studio-main" id="studio-main"></div></div>`;
  const main = $('#studio-main');
  ({ dashboard: studioDashboard, content: studioContent, analytics: studioAnalytics, comments: studioComments, stories: studioStories, live: studioLive, customize: studioCustomize, edit: () => studioEdit(main, arg) }[tab] || studioDashboard)(main);
  document.title = 'Channel dashboard - Vidora Studio';
}
const myVideos = () => DB.videos.filter(v => v.channelId === 'me').sort((a, b) => b.uploaded - a.uploaded);

function studioDashboard(main) {
  const me = ch('me'); const vids = myVideos(); const latest = vids[0];
  const views28 = vids.reduce((n, v) => n + Math.round(v.views * 0.3), 0);
  main.innerHTML = `<h1>Channel dashboard <span style="margin-left:auto;display:flex;gap:8px"><button class="pill sm" onclick="openUploadDialog()">${icon('upload', 'sm')} Upload</button><button class="pill sm" onclick="go('#/studio/live')">${icon('live', 'sm')} Go live</button><button class="pill sm" onclick="openPostComposer()">${icon('post', 'sm')} Post</button><button class="pill sm" onclick="openStoryEditor()">${icon('story', 'sm')} Story</button></span></h1>
  <div class="dash">
    <div class="s-card">${latest ? `<h3>Latest video performance</h3><div class="thumb" style="margin-bottom:12px"><img src="${thumbOf(latest)}" alt=""></div><b>${esc(latest.title)}</b><div class="row" style="margin-top:12px"><span>Views</span><b>${latest.views.toLocaleString()}</b></div><div class="row"><span>Likes</span><b>${latest.likes.toLocaleString()}</b></div><div class="row"><span>Comments</span><b>${(DB.comments[latest.id] || []).length}</b></div><a class="text-btn" href="#/studio/analytics">Go to video analytics</a>` : `<div class="upload-drop"><div class="circle">${icon('upload')}</div><p>Want to see metrics on your recent video?<br>Upload and publish a video to get started.</p><button class="pill blue" onclick="openUploadDialog()">Upload videos</button></div>`}</div>
    <div class="s-card"><h3>Channel analytics</h3><div class="muted">Current subscribers</div><div class="big">${me.subs.toLocaleString()}</div><div style="color:#2ba640">+${Math.round(me.subs * .04).toLocaleString()} in last 28 days</div><hr style="border:0;border-top:1px solid var(--divider);margin:16px 0"><b>Summary</b> <span class="muted">Last 28 days</span><div class="row"><span>Views</span><b>${views28.toLocaleString()}</b></div><div class="row"><span>Watch time (hours)</span><b>${Math.round(views28 * 0.07).toLocaleString()}</b></div><a class="text-btn" href="#/studio/analytics">Go to channel analytics</a></div>
    <div class="s-card"><h3>Stories ${me.subs >= 10000 ? '<span class="pill-tag">Unlocked</span>' : ''}</h3>${storyGate()}<p class="muted">Share quick behind-the-scenes moments with your subscribers. Stories appear at the top of your viewers' feeds and expire after 7 days.</p><button class="pill blue" ${me.subs < 10000 ? 'disabled' : ''} onclick="openStoryEditor()">Create story</button></div>
    <div class="s-card"><h3>Latest comments</h3>${vids.flatMap(v => (DB.comments[v.id] || []).slice(0, 2).map(c => ({ c, v }))).slice(0, 4).map(({ c, v }) => `<div style="display:flex;gap:12px;margin-bottom:12px">${avatarHTML({ id: c.author, name: c.author }, 32)}<div><b style="font-size:13px">${esc(c.author)}</b> <span class="muted" style="font-size:12px">${timeAgo(c.ts)}</span><div>${esc(c.text)}</div><div class="muted" style="font-size:12px">on ${esc(v.title)}</div></div></div>`).join('') || '<p class="muted">No comments yet</p>'}<a class="text-btn" href="#/studio/comments">View more</a></div>
    <div class="s-card"><h3>Creator Insider</h3><div class="thumb" style="margin-bottom:12px"><img src="${thumbSVG('insider', 'Stories are back')}" alt=""></div><b>Stories are back for channels with 10K+ subscribers</b><p class="muted">Post photos and short text updates that disappear after 7 days. Viewers can react and reply.</p></div>
  </div>`;
}
function storyGate() {
  const me = ch('me'); const pct = Math.min(100, me.subs / 100);
  return `<div class="gate"><div>${icon(me.subs >= 10000 ? 'check' : 'lock')}</div><div style="flex:1"><b>${me.subs >= 10000 ? 'You can post Stories' : 'Stories unlock at 10,000 subscribers'}</b><div class="muted" style="font-size:12px;margin:4px 0 6px">${me.subs.toLocaleString()} / 10,000 subscribers</div><div class="meter"><i style="width:${pct}%"></i></div></div></div>`;
}

function studioContent(main) {
  let tab = main.dataset.tab || 'videos';
  const render = () => {
    const vids = myVideos().filter(v => tab === 'videos' ? v.type === 'video' : tab === 'shorts' ? v.type === 'short' : tab === 'live' ? v.type === 'live' : false);
    const posts = DB.posts.filter(p => p.channelId === 'me');
    main.innerHTML = `<h1>Channel content <button class="pill blue sm" style="margin-left:auto" onclick="openUploadDialog()">${icon('upload', 'sm')} Upload</button></h1>
      <nav class="tabs" style="position:static;margin-bottom:8px">${[['videos', 'Videos'], ['shorts', 'Shorts'], ['live', 'Live'], ['posts', 'Posts'], ['playlists', 'Playlists']].map(([k, l]) => `<a href="#" data-ct="${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
      ${tab === 'posts' ? posts.map(postHTML).join('') + `<button class="pill" onclick="openPostComposer()">${icon('plus', 'sm')} Create post</button>` :
        tab === 'playlists' ? `<table class="s-table"><tr><th>Playlist</th><th>Visibility</th><th>Videos</th></tr>${DB.playlists.map(p => `<tr><td><a href="#/playlist/${p.id}">${esc(p.name)}</a></td><td>${p.visibility}</td><td>${p.videos.length}</td></tr>`).join('')}</table>` :
        vids.length ? `<div style="overflow-x:auto"><table class="s-table"><tr><th>Video</th><th>Visibility</th><th class="hide-m">Restrictions</th><th class="hide-m">Date</th><th>Views</th><th class="hide-m">Comments</th><th class="hide-m">Likes</th></tr>
        ${vids.map(v => `<tr><td><div class="vcell"><a class="thumb" href="#/studio/edit/${v.id}"><img src="${thumbOf(v)}" alt="">${durBadge(v)}</a><div style="min-width:0"><b style="display:block;font-weight:500">${esc(v.title)}</b><span class="muted" style="font-size:12px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden">${esc(v.desc.split('\n')[0] || 'Add description')}</span>
          <div class="acts"><a class="icon-btn" href="#/studio/edit/${v.id}" title="Details">${icon('edit')}</a><a class="icon-btn" href="#/studio/analytics" title="Analytics">${icon('analytics')}</a><a class="icon-btn" href="#/studio/comments" title="Comments">${icon('comment')}</a><a class="icon-btn" href="${v.type === 'short' ? '#/shorts/' : '#/watch/'}${v.id}" title="View on Vidora">${icon('play')}</a><button class="icon-btn" data-del="${v.id}" title="Delete forever">${icon('trash')}</button></div></div></div></td>
          <td><span class="vis">${icon(v.visibility === 'public' ? 'eye' : v.visibility === 'unlisted' ? 'link' : 'lock', 'sm')} ${v.visibility[0].toUpperCase() + v.visibility.slice(1)}</span></td><td class="hide-m">None</td><td class="hide-m">${new Date(v.uploaded).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}<div class="muted" style="font-size:12px">Published</div></td><td>${v.views.toLocaleString()}</td><td class="hide-m">${(DB.comments[v.id] || []).length}</td><td class="hide-m">${v.likes.toLocaleString()}</td></tr>`).join('')}</table></div>` :
        `<div class="upload-drop" style="margin-top:24px"><div class="circle">${icon('upload')}</div><p>No content available</p><button class="pill blue" onclick="openUploadDialog(${tab === 'shorts' ? '{short:true}' : ''})">Upload ${tab === 'shorts' ? 'a Short' : 'videos'}</button></div>`}`;
    main.querySelector('.tabs').onclick = e => { const a = e.target.closest('[data-ct]'); if (!a) return; e.preventDefault(); tab = main.dataset.tab = a.dataset.ct; render(); };
    bindPosts(main);
    main.onclick = async e => { const d = e.target.closest('[data-del]'); if (!d) return; const v = vid(d.dataset.del); if (await confirmDialog('Permanently delete this video?', `"${v.title}" will be deleted forever. This can't be undone.`, 'Delete forever')) { DB.videos = DB.videos.filter(x => x !== v); if (v.mediaKey) MediaStore.del(v.mediaKey); saveDB(); render(); toast('Video deleted'); } };
  };
  render();
}

function studioEdit(main, id) {
  const v = vid(id); if (!v || v.channelId !== 'me') { main.innerHTML = '<div class="empty"><h2>Video not found</h2></div>'; return; }
  main.innerHTML = `<h1><a class="icon-btn" href="#/studio/content">${icon('back')}</a> Video details <span style="margin-left:auto;display:flex;gap:8px"><a class="pill sm" href="#/watch/${v.id}">View</a><button class="pill blue sm" id="ed-save">Save</button></span></h1>
    <div class="upload-grid"><div>
      <div class="field-box"><label>Title (required)</label><input id="ed-t" maxlength="100" value="${esc(v.title)}"><span class="count"></span></div>
      <div class="field-box"><label>Description</label><textarea id="ed-d" rows="8" maxlength="5000">${esc(v.desc)}</textarea></div>
      <b>Thumbnail</b><div class="thumb-picks" id="ed-thumbs" style="margin-top:8px"><label class="upl">${icon('image', 'sm')}Upload file<input type="file" accept="image/*" hidden id="ed-tf"></label><div class="on"><img src="${thumbOf(v)}" alt=""></div></div>
      <div class="field-box"><label>Category</label><select id="ed-c">${CATEGORIES.slice(1, 16).filter(c => !['Live', 'Mixes', 'Recently uploaded'].includes(c)).map(c => `<option ${c === v.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </div><div><div class="upload-preview"><div class="vp" id="ed-prev"></div><div class="inf"><div class="muted">Video link</div><a href="#/watch/${v.id}">${location.origin}${location.pathname}#/watch/${v.id}</a></div></div>
      <div class="field-box" style="margin-top:16px"><label>Visibility</label><select id="ed-v">${['public', 'unlisted', 'private'].map(x => `<option value="${x}" ${x === v.visibility ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div></div></div>`;
  createPlayer($('#ed-prev'), v, { autoplay: false, resume: false }).then(p => { p.root.style.borderRadius = 0; });
  let thumb = null;
  $('#ed-tf').onchange = async e => { const f = e.target.files[0]; if (!f) return; thumb = await fileToDataURL(f, 1280); $('#ed-thumbs .on img').src = thumb; };
  $('#ed-save').onclick = () => { v.title = $('#ed-t').value.trim() || v.title; v.desc = $('#ed-d').value; v.category = $('#ed-c').value; v.visibility = $('#ed-v').value; if (thumb) v.thumbData = thumb; saveDB(); toast('Changes saved'); };
}

function studioAnalytics(main) {
  const vids = myVideos(); const me = ch('me'); let metric = 'views';
  const series = k => { const r = rng('an' + k); let base = { views: 900, watch: 70, subs: 18 }[k]; return Array.from({ length: 28 }, () => (base = Math.max(1, base * (0.9 + r() * 0.22)))); };
  const render = () => {
    const s = series(metric); const max = Math.max(...s); const W = 800, H = 220;
    const pts = s.map((y, i) => [i / (s.length - 1) * W, H - 20 - (y / max) * (H - 40)]);
    const d = 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' L');
    const sum = s.reduce((a, b) => a + b, 0);
    main.innerHTML = `<h1>Channel analytics</h1>
      <div class="s-card"><p style="text-align:center;font-size:20px;margin:0 0 16px">Your channel got ${Math.round(series('views').reduce((a, b) => a + b, 0)).toLocaleString()} views in the last 28 days</p>
      <div class="kpis">${[['views', 'Views', Math.round(series('views').reduce((a, b) => a + b, 0)).toLocaleString()], ['watch', 'Watch time (hours)', Math.round(series('watch').reduce((a, b) => a + b, 0)).toLocaleString()], ['subs', 'Subscribers', '+' + Math.round(series('subs').reduce((a, b) => a + b, 0))]].map(([k, l, val]) => `<button data-k="${k}" class="${metric === k ? 'on' : ''}"><small>${l}</small><b>${val}</b></button>`).join('')}</div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${[0, 1, 2, 3].map(i => `<line x1="0" x2="${W}" y1="${20 + i * (H - 40) / 3}" y2="${20 + i * (H - 40) / 3}"/>`).join('')}<path class="area" d="${d} L${W},${H - 20} L0,${H - 20} Z"/><path class="line" d="${d}"/></svg>
      <div class="muted" style="display:flex;justify-content:space-between;font-size:12px"><span>28 days ago</span><span>Today</span></div><p class="muted">Total: ${Math.round(sum).toLocaleString()}</p></div>
      <div class="dash" style="margin-top:24px"><div class="s-card"><h3>Realtime</h3><div class="big">${me.subs.toLocaleString()}</div><div class="muted">Subscribers</div><div class="row" style="margin-top:12px"><span>Views · Last 48 hours</span><b>${Math.round(s[27] * 1.8).toLocaleString()}</b></div></div>
      <div class="s-card"><h3>Your top content in this period</h3>${vids.slice().sort((a, b) => b.views - a.views).slice(0, 5).map((v, i) => `<div class="row"><span>${i + 1}. ${esc(v.title)}</span><b>${v.views.toLocaleString()}</b></div>`).join('') || '<p class="muted">No content yet</p>'}</div>
      <div class="s-card"><h3>Story views</h3>${(DB.stories.find(s2 => s2.channelId === 'me')?.slides || []).map((sl, i) => `<div class="row"><span>${sl.emoji || '🖼️'} ${esc(sl.text || 'Photo')}</span><b>${(sl.views || 0) + Math.round(me.subs * .08 + i * 37)}</b></div>`).join('') || '<p class="muted">No active stories</p>'}</div></div>`;
    main.querySelector('.kpis').onclick = e => { const b = e.target.closest('[data-k]'); if (b) { metric = b.dataset.k; render(); } };
  };
  render();
}

function studioComments(main) {
  const rows = myVideos().flatMap(v => (DB.comments[v.id] || []).map(c => ({ c, v }))).sort((a, b) => b.c.ts - a.c.ts);
  main.innerHTML = `<h1>Channel comments</h1><nav class="tabs" style="position:static;margin-bottom:16px"><a class="on">Comments</a><a>Mentions</a></nav>
    ${rows.map(({ c, v }) => `<div class="comment" data-v="${v.id}" data-c="${c.id}">${avatarHTML(c.me ? ch('me') : { id: c.author, name: c.author }, 40)}<div class="body"><div class="who">${esc(c.author)} <span class="when">${timeAgo(c.ts)}</span></div><div class="txt">${esc(c.text)}</div>
      <div class="acts"><button class="text-btn" style="font-size:12px" data-a="reply">Reply</button><span>${c.replies.length} replies</span><button class="icon-btn ${c.hearted ? 'on' : ''}" data-a="heart" title="Heart">${icon('heart')}</button><button class="icon-btn" data-a="pin" title="Pin">${icon('flag')}</button><button class="icon-btn" data-a="del" title="Remove">${icon('trash')}</button></div><div class="reply-box"></div></div>
      <a href="#/watch/${v.id}" style="width:120px;flex-shrink:0"><div class="thumb" style="border-radius:4px"><img src="${thumbOf(v)}" alt=""></div><div class="muted" style="font-size:12px;margin-top:4px">${esc(v.title)}</div></a></div>`).join('') || '<div class="empty"><h2>No comments yet</h2></div>'}`;
  main.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const row = b.closest('[data-c]'); const list = DB.comments[row.dataset.v]; const c = list.find(x => x.id === row.dataset.c);
    if (b.dataset.a === 'heart') { c.hearted = !c.hearted; b.classList.toggle('on', c.hearted); }
    if (b.dataset.a === 'pin') { list.forEach(x => x.pinned = false); c.pinned = true; toast('Comment pinned'); }
    if (b.dataset.a === 'del') { list.splice(list.indexOf(c), 1); row.remove(); toast('Comment removed'); }
    if (b.dataset.a === 'reply') { const box = row.querySelector('.reply-box'); box.innerHTML = `<div class="c-new" style="margin:8px 0">${avatarHTML(ch('me'), 24)}<div class="field"><textarea rows="1" placeholder="Reply as creator…"></textarea><div class="row"><button class="pill blue sm">Reply</button></div></div></div>`; box.querySelector('button').onclick = () => { const t = box.querySelector('textarea').value.trim(); if (!t) return; c.replies.push({ id: uid('r'), author: ch('me').name, me: true, byCreator: true, text: t, ts: Date.now(), likes: 0 }); saveDB(); studioComments(main); toast('Reply posted'); }; }
    saveDB(); };
}

function studioStories(main) {
  const me = ch('me'); const mine = DB.stories.find(s => s.channelId === 'me'); const slides = mine ? mine.slides : [];
  main.innerHTML = `<h1>Stories <span class="pill-tag">Back</span> <button class="pill blue sm" style="margin-left:auto" ${me.subs < 10000 ? 'disabled' : ''} onclick="openStoryEditor()">${icon('plus', 'sm')} Create story</button></h1>
    ${storyGate()}
    <p class="muted">Stories are short, mobile-first updates that appear at the top of your subscribers' feeds and on your channel. Each story expires 7 days after posting.</p>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">${slides.map(sl => { const left = Math.max(0, STORY_TTL - (Date.now() - sl.ts)); return `<div style="width:180px"><div style="aspect-ratio:9/16;border-radius:12px;overflow:hidden;position:relative;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:${sl.img ? `url(${sl.img}) center/cover` : `linear-gradient(160deg,${sl.bg[0]},${sl.bg[1]})`}"><span style="font-size:48px">${sl.img ? '' : sl.emoji}</span><b style="padding:8px;text-shadow:0 1px 6px rgba(0,0,0,.4)">${esc(sl.text)}</b></div>
      <div style="font-size:12px;margin-top:6px" class="muted">${left > 0 ? `Expires in ${Math.ceil(left / 864e5)} day(s)` : 'Expired'} · ${(sl.views || 0) + Math.round(me.subs * .08)} views · ${(sl.likes || 0)} ❤</div>
      <div style="display:flex;gap:4px;margin-top:4px"><button class="pill sm" data-view>View</button><button class="pill sm" data-sdel="${sl.id}">${icon('trash', 'sm')}</button></div></div>`; }).join('') || `<div class="empty" style="width:100%">${icon('story')}<h2>No stories yet</h2></div>`}</div>`;
  main.onclick = async e => { if (e.target.closest('[data-view]')) openStoryViewer('me'); const d = e.target.closest('[data-sdel]'); if (d && await confirmDialog('Delete story', 'Delete this story? It will be removed for everyone.')) { mine.slides = mine.slides.filter(s => s.id !== d.dataset.sdel); if (!mine.slides.length) DB.stories = DB.stories.filter(s => s !== mine); saveDB(); studioStories(main); } };
}

let liveStream = null, liveTimer = null;
function studioLive(main) {
  main.innerHTML = `<h1>Go live</h1><div class="live-setup"><div>
      <div class="cam" id="cam"><div style="text-align:center">${icon('camera')}<p>Allow camera access to preview your stream</p><button class="pill blue" id="cam-on">Turn on camera</button></div></div>
      <div class="field-box" style="margin-top:16px"><label>Title (required)</label><input id="lv-t" maxlength="100" value="Live Q&A — ask me anything!"></div>
      <div class="field-box"><label>Description</label><textarea id="lv-d" rows="3">Come hang out and ask questions.</textarea></div>
      <div style="display:flex;gap:8px;align-items:center"><button class="pill blue" id="lv-go">${icon('live', 'sm')} Go live</button><span class="muted" id="lv-status">Not streaming</span></div></div>
    <div class="live-chat"><div style="padding:12px 16px;border-bottom:1px solid var(--divider);font-weight:500">Live chat</div><div class="msgs" id="lv-msgs"><div class="muted">Chat will appear when you're live.</div></div><form id="lv-form"><input placeholder="Chat publicly as ${esc(ch('me').name)}…" maxlength="200"><button class="icon-btn">${icon('send')}</button></form></div></div>`;
  const cam = $('#cam');
  $('#cam-on').onclick = async () => {
    try { liveStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); const vEl = document.createElement('video'); vEl.srcObject = liveStream; vEl.muted = true; vEl.autoplay = true; vEl.playsInline = true; cam.innerHTML = ''; cam.appendChild(vEl); }
    catch (err) { cam.innerHTML = `<div style="text-align:center;padding:16px">${icon('camera')}<p>Camera unavailable (${esc(err.name || 'blocked')}). You can still go live with a test pattern.</p></div>`; }
  };
  let live = false, started = 0;
  const msgs = $('#lv-msgs'); const say = (who, t) => { msgs.insertAdjacentHTML('beforeend', `<div><b>${esc(who)}</b>${esc(t)}</div>`); msgs.scrollTop = msgs.scrollHeight; };
  $('#lv-form').onsubmit = e => { e.preventDefault(); const i = e.target.querySelector('input'); if (!i.value.trim()) return; say(ch('me').name, i.value.trim()); i.value = ''; };
  $('#lv-go').onclick = () => {
    if (!live) {
      live = true; started = Date.now(); $('#lv-go').innerHTML = `${icon('close', 'sm')} End stream`; cam.insertAdjacentHTML('beforeend', '<span class="onair">LIVE</span>'); msgs.innerHTML = '';
      const r = rng('chat'); liveTimer = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); $('#lv-status').textContent = `Live · ${fmtDur(s)} · ${Math.floor(3 + s * 1.7)} watching`; if (r() > .55) say(pick(r, COMMENTERS), pick(r, ['hi from Brazil 👋', 'first!', 'love the content', 'what camera do you use?', '🔥🔥🔥', 'can you say hi to me?', 'just subscribed', 'audio is great'])); }, 1200);
      toast('You\'re live!');
    } else {
      live = false; clearInterval(liveTimer); liveStream && liveStream.getTracks().forEach(t => t.stop()); liveStream = null;
      const dur = Math.max(5, Math.floor((Date.now() - started) / 1000));
      DB.videos.unshift({ id: uid('v'), channelId: 'me', title: $('#lv-t').value.trim() || 'Live stream', desc: $('#lv-d').value, type: 'video', duration: dur, views: Math.floor(3 + dur * 1.7), likes: 0, uploaded: Date.now(), category: 'Learning', visibility: 'public', wasLive: true });
      saveDB(); toast('Stream ended — the replay is saved to your content', { label: 'View', fn: () => go('#/studio/content') }); studioLive(main);
    }
  };
}
function cleanupLive() { clearInterval(liveTimer); liveStream && liveStream.getTracks().forEach(t => t.stop()); liveStream = null; }

function studioCustomize(main) {
  const me = ch('me');
  main.innerHTML = `<h1>Channel customization <span style="margin-left:auto;display:flex;gap:8px"><a class="pill sm" href="#/channel/me">View channel</a><button class="pill blue sm" id="cu-save">Publish</button></span></h1>
    <div style="max-width:760px">
      <h3>Picture</h3><div style="display:flex;gap:24px;align-items:center;margin-bottom:24px"><span id="cu-av">${avatarHTML(me, 96)}</span><div><p class="muted">Your profile picture will appear where your channel is presented on Vidora.</p><label class="pill sm" style="cursor:pointer">Change<input type="file" accept="image/*" hidden id="cu-avf"></label> <button class="pill sm" id="cu-avr">Remove</button></div></div>
      <h3>Banner image</h3><div style="display:flex;gap:24px;align-items:center;margin-bottom:24px"><div id="cu-bn" style="width:260px;aspect-ratio:6.2/1;border-radius:8px;background:url('${me.bannerData || thumbSVG('mebanner', '', { w: 1240, h: 200, noText: true })}') center/cover"></div><label class="pill sm" style="cursor:pointer">Change<input type="file" accept="image/*" hidden id="cu-bnf"></label></div>
      <div class="field-box"><label>Name</label><input id="cu-n" maxlength="50" value="${esc(me.name)}"></div>
      <div class="field-box"><label>Handle</label><input id="cu-h" maxlength="30" value="${esc(me.handle)}"></div>
      <div class="field-box"><label>Description</label><textarea id="cu-d" rows="5" maxlength="1000">${esc(me.desc)}</textarea></div>
      <div class="field-box"><label>Links (one per line)</label><textarea id="cu-l" rows="3">${esc(me.links.join('\n'))}</textarea></div>
      <h3>Demo: subscriber count</h3><p class="muted">Stories unlock at 10,000 subscribers. Adjust your demo channel's count to test the gate.</p>
      <div class="field-box"><label>Subscribers</label><input id="cu-s" type="number" min="0" value="${me.subs}"></div>
    </div>`;
  let av = me.avatarImg, bn = me.bannerData;
  $('#cu-avf').onchange = async e => { const f = e.target.files[0]; if (!f) return; av = await fileToDataURL(f, 256); $('#cu-av').innerHTML = `<img class="avatar" style="width:96px;height:96px" src="${av}">`; };
  $('#cu-avr').onclick = () => { av = null; $('#cu-av').innerHTML = avatarHTML({ ...me, avatarImg: null }, 96); };
  $('#cu-bnf').onchange = async e => { const f = e.target.files[0]; if (!f) return; bn = await fileToDataURL(f, 1600); $('#cu-bn').style.backgroundImage = `url(${bn})`; };
  $('#cu-save').onclick = () => { me.name = $('#cu-n').value.trim() || me.name; let h = $('#cu-h').value.trim().replace(/\s/g, ''); me.handle = h.startsWith('@') ? h : '@' + h; me.desc = $('#cu-d').value; me.links = $('#cu-l').value.split('\n').map(s => s.trim()).filter(Boolean); me.subs = Math.max(0, parseInt($('#cu-s').value) || 0); me.avatarImg = av; me.bannerData = bn; saveDB(); renderMasthead(); renderBottomNav(); toast('Changes published'); pageStudio('customize'); };
}

/* ---------- Upload dialog ---------- */
function openUploadDialog(opts = {}) {
  const m = modal(`<div class="upload-drop" id="drop"><div class="circle">${icon('upload')}</div><p style="font-size:15px">Drag and drop ${opts.short ? 'a vertical video (up to 60 s)' : 'video files'} to upload</p><p class="muted" style="font-size:13px">Your videos will be private until you publish them.</p><label class="pill blue" style="cursor:pointer">Select files<input type="file" accept="video/*" hidden id="up-file"></label>
    <p class="muted" style="font-size:12px;margin-top:32px">No video handy? <a href="#" id="up-demo" style="color:var(--link)">Generate a sample clip</a></p></div>`, { title: opts.short ? 'Upload a Short' : 'Upload videos', width: 960, sticky: true });
  const drop = $('#drop', m.el);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('video/')) startUpload(m, f, opts); else toast('Please choose a video file'); });
  $('#up-file', m.el).onchange = e => { const f = e.target.files[0]; if (f) startUpload(m, f, opts); };
  $('#up-demo', m.el).onclick = async e => { e.preventDefault(); e.target.textContent = 'Generating…'; const f = await generateSampleVideo(opts.short); if (f) startUpload(m, f, opts); else toast('Your browser can\'t record a sample clip'); };
}
async function generateSampleVideo(vertical) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const c = document.createElement('canvas'); c.width = vertical ? 360 : 640; c.height = vertical ? 640 : 360; const x = c.getContext('2d');
  const stream = c.captureStream(30); const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) return null;
  const rec = new MediaRecorder(stream, { mimeType: mime }); const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const t0 = performance.now(); let raf;
  const draw = () => { const t = (performance.now() - t0) / 1000; const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, `hsl(${t * 60 % 360} 80% 55%)`); g.addColorStop(1, `hsl(${(t * 60 + 120) % 360} 80% 45%)`); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(c.width / 2 + Math.cos(t * 2 + i) * c.width * .3, c.height / 2 + Math.sin(t * 2 + i * 1.3) * c.height * .3, 24 + i * 6, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.fillText('My Vidora clip', c.width / 2, c.height / 2); x.font = '20px Arial'; x.fillText(t.toFixed(1) + 's', c.width / 2, c.height / 2 + 36); raf = requestAnimationFrame(draw); };
  draw(); rec.start(200);
  await new Promise(r => setTimeout(r, 4000)); rec.stop(); cancelAnimationFrame(raf); await new Promise(r => rec.onstop = r);
  return new File(chunks, 'my-vidora-clip.webm', { type: mime.split(';')[0] });
}
async function extractFrames(url) {
  return new Promise(res => {
    const v = document.createElement('video'); v.src = url; v.muted = true; v.preload = 'auto'; v.playsInline = true; const frames = []; let meta = { duration: 0, w: 16, h: 9 };
    const fallback = setTimeout(() => res({ frames, meta }), 6000);
    v.onloadedmetadata = async () => {
      let d = v.duration; if (!isFinite(d)) { v.currentTime = 1e9; await new Promise(r => v.ontimeupdate = r); v.ontimeupdate = null; d = v.duration; v.currentTime = 0; }
      meta = { duration: isFinite(d) ? d : 0, w: v.videoWidth, h: v.videoHeight };
      const c = document.createElement('canvas'); const s = 320 / Math.max(1, v.videoWidth); c.width = 320; c.height = Math.max(1, Math.round(v.videoHeight * s)) || 180;
      for (const f of [0.15, 0.5, 0.85]) { await new Promise(r => { v.onseeked = r; v.currentTime = Math.max(0.05, meta.duration * f); setTimeout(r, 1500); }); try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); frames.push(c.toDataURL('image/jpeg', .8)); } catch (e) { /* ignore */ } }
      clearTimeout(fallback); res({ frames, meta });
    };
    v.onerror = () => { clearTimeout(fallback); res({ frames, meta }); };
  });
}
async function startUpload(m, file, opts) {
  const key = uid('media'); const url = URL.createObjectURL(file); MediaStore.urls[key] = url;
  const draft = { id: uid('v'), channelId: 'me', title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 100), desc: '', type: opts.short ? 'short' : 'video', duration: 0, views: 0, likes: 0, uploaded: Date.now(), category: 'Learning', visibility: 'private', mediaKey: key };
  let step = 0, thumbs = [], thumbSel = 0, customThumb = null, uploaded = 0, stored = false, kids = 'no', schedule = '';
  m.el.querySelector('.modal-head span').textContent = draft.title;
  // simulated upload progress + real IndexedDB store
  MediaStore.put(key, file).then(() => { stored = true; }).catch(() => { stored = 'mem'; toast('Saved for this session only (storage unavailable)'); });
  const prog = setInterval(() => { uploaded = Math.min(100, uploaded + 7 + Math.random() * 12); const el = $('#up-prog', m.el); if (el) { el.firstChild.style.width = uploaded + '%'; $('#up-prog-t', m.el).textContent = uploaded >= 100 ? (stored ? 'Upload complete · Checks complete. No issues found.' : 'Processing…') : `Uploading ${Math.round(uploaded)}%…`; } if (uploaded >= 100 && stored) clearInterval(prog); }, 300);
  extractFrames(url).then(({ frames, meta }) => { thumbs = frames; draft.duration = Math.round(meta.duration) || 10; if (meta.h > meta.w && meta.duration <= 180) draft.type = 'short'; if (step === 0 || step === 1) render(); });
  const steps = ['Details', 'Video elements', 'Checks', 'Visibility'];
  const render = () => {
    const body = m.body; const stepsHTML = `<div class="steps">${steps.map((s, i) => `<div class="st ${i === step ? 'on' : i < step ? 'done' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>`;
    const preview = `<div class="upload-preview"><div class="vp"><video src="${url}" controls playsinline muted></video></div><div class="inf"><div class="muted">Video link</div><a>${location.origin}${location.pathname}#/watch/${draft.id}</a><div class="muted" style="margin-top:8px">Filename</div><div>${esc(file.name)}</div><div class="muted" style="margin-top:8px">Format</div><div>${draft.type === 'short' ? 'Short (vertical)' : 'Video'} · ${draft.duration ? fmtDur(draft.duration) : '…'}</div></div></div>`;
    let inner = '';
    if (step === 0) inner = `<div class="upload-grid"><div><h2 style="margin-top:0">Details</h2>
      <div class="field-box"><label>Title (required)</label><input id="u-t" maxlength="100" value="${esc(draft.title)}"><span class="count">${draft.title.length}/100</span></div>
      <div class="field-box"><label>Description</label><textarea id="u-d" rows="5" maxlength="5000" placeholder="Tell viewers about your video (type @ to mention a channel)">${esc(draft.desc)}</textarea></div>
      <b>Thumbnail</b><p class="muted" style="font-size:12px;margin:4px 0 8px">Set a thumbnail that stands out and draws viewers' attention.</p>
      <div class="thumb-picks" id="u-thumbs"><label class="upl">${icon('image', 'sm')}Upload file<input type="file" accept="image/*" hidden id="u-tf"></label>${customThumb ? `<div class="${thumbSel === -1 ? 'on' : ''}" data-ti="-1"><img src="${customThumb}"></div>` : ''}${thumbs.length ? thumbs.map((t, i) => `<div class="${thumbSel === i ? 'on' : ''}" data-ti="${i}"><img src="${t}"></div>`).join('') : '<div class="upl">Generating…</div>'}</div>
      <b>Playlists</b><div class="field-box" style="margin-top:8px"><label>Add to playlist</label><select id="u-pl"><option value="">Select</option>${DB.playlists.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <b>Audience</b><div class="radio-card" style="margin-top:8px"><label><input type="radio" name="kids" value="yes" ${kids === 'yes' ? 'checked' : ''}><span>Yes, it's made for kids</span></label><label><input type="radio" name="kids" value="no" ${kids === 'no' ? 'checked' : ''}><span>No, it's not made for kids</span></label></div>
      <div class="field-box"><label>Category</label><select id="u-c">${['Learning', 'Tech', 'Cooking', 'Science', 'Travel', 'Gaming', 'Music', 'Fitness', 'Comedy', 'News', 'Sports', 'Art', 'Podcasts'].map(c => `<option ${c === draft.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <label class="check-row"><input type="checkbox" id="u-short" ${draft.type === 'short' ? 'checked' : ''}> Publish as a Short</label></div>${preview}</div>`;
    if (step === 1) inner = `<div class="upload-grid"><div><h2 style="margin-top:0">Video elements</h2><p class="muted">Use cards and an end screen to show viewers related videos, websites, and calls to action.</p>
      ${[['Add subtitles', 'Reach a broader audience by adding subtitles to your video', 'cc'], ['Add an end screen', 'Promote related content at the end of your video', 'myvideos'], ['Add cards', 'Promote related content during your video', 'post']].map(([t, d, ic]) => `<div class="radio-card" style="display:flex;gap:16px;align-items:center">${icon(ic)}<div style="flex:1"><b>${t}</b><small class="muted" style="display:block">${d}</small></div><button class="pill sm" onclick="this.textContent='Added ✓'">Add</button></div>`).join('')}</div>${preview}</div>`;
    if (step === 2) inner = `<div class="upload-grid"><div><h2 style="margin-top:0">Checks</h2><p class="muted">We'll check your video for issues that may restrict its visibility and then you will have the opportunity to fix issues before publishing your video.</p>
      <div class="radio-card"><b>Copyright</b><div style="display:flex;gap:8px;align-items:center;margin-top:8px;color:#2ba640">${icon('check')} No issues found</div></div>
      <div class="radio-card"><b>Ad suitability</b><div style="display:flex;gap:8px;align-items:center;margin-top:8px;color:#2ba640">${icon('check')} No issues found</div></div>
      <p class="muted" style="font-size:12px">Remember: These check results aren't final. Issues may come up in the future that impact your video.</p></div>${preview}</div>`;
    if (step === 3) inner = `<div class="upload-grid"><div><h2 style="margin-top:0">Visibility</h2><p class="muted">Choose when to publish and who can see your video</p>
      <div class="radio-card"><b>Save or publish</b>${[['private', 'Private', 'Only you and people you choose can watch your video'], ['unlisted', 'Unlisted', 'Anyone with the video link can watch your video'], ['public', 'Public', 'Everyone can watch your video']].map(([k, l, d]) => `<label><input type="radio" name="vis" value="${k}" ${draft.visibility === k ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
        <label class="check-row" style="padding-left:36px"><input type="checkbox" id="u-premiere"> Set as instant Premiere</label></div>
      <div class="radio-card"><b>Schedule</b><small>Select a date to make your video public.</small><input type="datetime-local" id="u-sched" value="${schedule}" style="margin-top:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:8px"></div>
      <div class="radio-card"><b>Also share</b><label><input type="checkbox" id="u-post" checked><span>Post to Posts tab<small>Let subscribers know about your new video</small></span></label><label><input type="checkbox" id="u-story" ${ch('me').subs >= 10000 ? '' : 'disabled'}><span>Share to your Story ${ch('me').subs >= 10000 ? '' : '🔒'}<small>${ch('me').subs >= 10000 ? 'A 7-day story slide linking to this video' : 'Requires 10,000 subscribers'}</small></span></label></div></div>${preview}</div>`;
    body.innerHTML = stepsHTML + inner;
    const foot = m.el.querySelector('.modal-foot') || (() => { const f = document.createElement('div'); f.className = 'modal-foot'; m.el.querySelector('.modal').appendChild(f); return f; })();
    foot.style.justifyContent = 'space-between';
    const status = uploaded >= 100 ? (stored ? 'Upload complete · Checks complete. No issues found.' : 'Processing…') : `Uploading ${Math.round(uploaded)}%…`;
    foot.innerHTML = `<div style="flex:1;max-width:420px"><div class="muted" style="font-size:12px" id="up-prog-t">${status}</div><div class="progress-line" id="up-prog"><i style="width:${uploaded}%"></i></div></div><div style="display:flex;gap:8px">${step ? '<button class="text-btn" data-back>Back</button>' : ''}<button class="pill blue" data-next>${step === 3 ? (draft.visibility === 'private' ? 'Save' : 'Publish') : 'Next'}</button></div>`;
    // bind
    const t = $('#u-t', body); if (t) t.oninput = () => { draft.title = t.value; body.querySelector('.count').textContent = t.value.length + '/100'; m.el.querySelector('.modal-head span').textContent = t.value || 'Untitled'; };
    const d = $('#u-d', body); if (d) d.oninput = () => draft.desc = d.value;
    const c = $('#u-c', body); if (c) c.onchange = () => draft.category = c.value;
    const sh = $('#u-short', body); if (sh) sh.onchange = () => { draft.type = sh.checked ? 'short' : 'video'; };
    const pl = $('#u-pl', body); if (pl) pl.onchange = () => draft.playlist = pl.value;
    $$('input[name=kids]', body).forEach(r => r.onchange = () => kids = r.value);
    const tf = $('#u-tf', body); if (tf) tf.onchange = async e => { const f = e.target.files[0]; if (!f) return; customThumb = await fileToDataURL(f, 1280); thumbSel = -1; render(); };
    const tp = $('#u-thumbs', body); if (tp) tp.onclick = e => { const x = e.target.closest('[data-ti]'); if (x) { thumbSel = +x.dataset.ti; render(); } };
    $$('input[name=vis]', body).forEach(r => r.onchange = () => { draft.visibility = r.value; foot.querySelector('[data-next]').textContent = r.value === 'private' ? 'Save' : 'Publish'; });
    const sc = $('#u-sched', body); if (sc) sc.onchange = () => schedule = sc.value;
    foot.querySelector('[data-back]') && (foot.querySelector('[data-back]').onclick = () => { step--; render(); });
    foot.querySelector('[data-next]').onclick = () => {
      if (step === 0 && !draft.title.trim()) return toast('Add a title to continue');
      if (step < 3) { step++; render(); return; }
      publish();
    };
  };
  const publish = () => {
    const shareStory = $('#u-story', m.body)?.checked, sharePost = $('#u-post', m.body)?.checked;
    if (thumbSel === -1 && customThumb) draft.thumbData = customThumb; else if (thumbs[thumbSel]) draft.thumbData = thumbs[thumbSel];
    draft.title = draft.title.trim(); draft.uploaded = schedule ? Math.min(Date.now(), new Date(schedule).getTime()) : Date.now();
    if (draft.type === 'short' && !/#shorts/i.test(draft.desc)) draft.desc = (draft.desc + ' #shorts').trim();
    DB.videos.unshift(draft); DB.comments[draft.id] = [];
    if (draft.playlist) { const p = DB.playlists.find(x => x.id === draft.playlist); p && p.videos.unshift(draft.id); }
    if (sharePost && draft.visibility === 'public') DB.posts.unshift({ id: uid('p'), channelId: 'me', type: 'text', text: `New ${draft.type === 'short' ? 'Short' : 'video'} is up! ▶ ${draft.title}`, ts: Date.now(), likes: 0, comments: [] });
    if (shareStory) addStorySlide({ bg: ['#ff5a36', '#e3125f'], emoji: '🎬', text: 'New video: ' + draft.title, img: draft.thumbData, link: draft.id });
    saveDB(); clearInterval(prog); m.close();
    const link = (draft.type === 'short' ? '#/shorts/' : '#/watch/') + draft.id;
    const done = modal(`<p>${draft.visibility === 'private' ? 'Your video was saved as private.' : 'Your video is now ' + draft.visibility + '!'}</p><div class="thumb" style="margin-bottom:12px"><img src="${thumbOf(draft)}" alt=""></div><div class="copy-row"><input readonly value="${location.origin}${location.pathname}${link}"><button class="pill blue" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.previousElementSibling.value);toast('Link copied')">Copy</button></div>`, { title: draft.visibility === 'private' ? 'Video saved' : 'Video published', width: 420, foot: `<a class="text-btn" href="#/studio/content" onclick="this.closest('.modal-back').remove();document.body.classList.remove('no-scroll')">Go to content</a><a class="pill blue" href="${link}" onclick="this.closest('.modal-back').remove();document.body.classList.remove('no-scroll')">Watch</a>` });
    if (currentRoute.parts[0] === 'studio') rerender();
  };
  render();
}
