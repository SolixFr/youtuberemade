/* Vidora — pages. Each page fn renders into #page. */
let currentPlayer = null; let miniPlayer = null;
const shuffleBy = (arr, seed) => { const r = rng(seed); return arr.map(x => [r(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]); };
const feedPool = () => publicVideos().filter(v => !hidden.has(v.id) && !hiddenCh.has(v.channelId) && v.visibility === 'public');

/* ---------- HOME ---------- */
let homeChip = 'All';
function pageHome() {
  const all = feedPool(); let vids = all.filter(v => v.type !== 'short');
  if (homeChip === 'Live') vids = vids.filter(v => v.type === 'live');
  else if (homeChip === 'Recently uploaded') vids = vids.slice().sort((a, b) => b.uploaded - a.uploaded);
  else if (homeChip === 'New to you') vids = vids.filter(v => !isSubbed(v.channelId));
  else if (homeChip === 'Mixes') vids = vids.filter(v => v.category === 'Music');
  else if (homeChip !== 'All') vids = vids.filter(v => v.category === homeChip);
  if (homeChip === 'All') vids = shuffleBy(vids, 'home' + new Date().toDateString());
  const shorts = shuffleBy(all.filter(v => v.type === 'short'), 'sh').slice(0, isMobile() ? 4 : 6);
  const firstRow = isMobile() ? 2 : 8;
  $('#page').innerHTML = `
    <div class="chips" id="chips">${isMobile() ? `<a class="chip explore-chip" href="#/feed/trending">${icon('explore', 'sm')}</a>` : ''}${CATEGORIES.map(c => `<button class="chip ${c === homeChip ? 'on' : ''}" data-chip="${c}">${c}</button>`).join('')}</div>
    <div class="content">
      ${isMobile() ? storiesRow() : ''}
      ${vids.length ? `<div class="grid">${vids.slice(0, firstRow).map(videoCard).join('')}</div>
      ${homeChip === 'All' ? `<section class="shelf"><div class="shelf-head">${icon('shorts')} Shorts</div><div class="shorts-row">${shorts.map(shortCard).join('')}</div></section>` : ''}
      ${!isMobile() && homeChip === 'All' ? `<section class="shelf" style="padding-bottom:0">${storiesRow()}</section>` : ''}
      <div class="grid" style="padding-top:24px">${vids.slice(firstRow).map(videoCard).join('')}</div>` : `<div class="empty">${icon('search')}<h2>No videos in ${esc(homeChip)} yet</h2></div>`}
    </div>`;
  $('#chips').onclick = e => { const b = e.target.closest('[data-chip]'); if (!b) return; homeChip = b.dataset.chip; pageHome(); scrollTo(0, 0); };
}

/* ---------- WATCH ---------- */
async function pageWatch(id, params) {
  const v = vid(id); if (!v) return pageNotFound();
  const c = ch(v.channelId);
  if (miniPlayer && miniPlayer.v.id === id) closeMini(true);
  if (!DB.user.historyPaused) { DB.user.history = [{ id, ts: Date.now() }, ...DB.user.history.filter(h => h.id !== id)].slice(0, 200); }
  v.views++; saveDB();
  const related = shuffleBy(feedPool().filter(x => x.id !== id && x.type !== 'short'), id).sort((a, b) => (b.channelId === v.channelId) - (a.channelId === v.channelId) || 0);
  const relatedSorted = [...related.filter(x => x.category === v.category), ...related.filter(x => x.category !== v.category)];
  const liked = DB.user.liked.includes(id), disliked = DB.user.disliked.includes(id);
  const comments = DB.comments[id] = DB.comments[id] || [];
  const chapters = chaptersOf(v);
  const upnext = Queue.length ? Queue.map(vid).filter(Boolean) : [];
  $('#page').innerHTML = `
    <div class="watch">
      <div class="watch-main">
        <div class="watch-player-wrap"><div id="player-host" class="player" style="background:#000"></div></div>
        <div class="watch-info">
          <h1 class="w-title">${esc(v.title)}</h1>
          <div class="w-meta-m">${v.type === 'live' ? fmtCount(v.watching) + ' watching now' : fmtCount(v.views) + ' views'} · ${timeAgo(v.uploaded)} <b data-more-desc>...more</b></div>
          <div class="w-actions">
            <div class="w-owner"><a href="#/channel/${c.id}" ${activeStories().some(s => s.channelId === c.id) ? `data-story="${c.id}"` : ''}>${avatarHTML(c, 40)}</a>
              <div class="info"><a class="name" href="#/channel/${c.id}">${esc(c.name)}${c.verified ? icon('verified', 'vchk') : ''}</a><div class="subs" data-subcount="${c.id}">${fmtCount(c.subs)} subscribers</div></div>
              <span data-subwrap="${c.id}">${subscribeBtnHTML(c.id)}</span></div>
            <div class="w-btns">
              <div class="seg" id="rate-seg"><button id="like-btn" class="${liked ? 'on' : ''}" title="I like this">${icon('like')} <span>${fmtCount(v.likes)}</span></button><button id="dislike-btn" class="${disliked ? 'on' : ''}" title="I dislike this">${icon('dislike')}</button></div>
              <button class="pill" id="share-btn">${icon('share')} Share</button>
              <button class="pill" id="dl-btn">${icon('download')} Download</button>
              <button class="pill" id="thanks-btn">${icon('thanks')} Thanks</button>
              <button class="pill" id="clip-btn">${icon('clip')} Clip</button>
              <button class="pill" id="save-btn">${icon('save')} Save</button>
              <button class="icon-btn" style="background:var(--bg-chip)" data-vmenu="${v.id}">${icon('dotsH')}</button>
            </div>
          </div>
          <div class="desc-box mobile-hide" id="desc">
            <div class="stats">${v.type === 'live' ? fmtCount(v.watching) + ' watching now' : fmtCount(v.views) + ' views'} &nbsp;${timeAgo(v.uploaded)} &nbsp;<span class="tag">#${esc(v.category.toLowerCase())}</span></div>
            <div class="body">${linkify(v.desc)}</div>
            ${chapters.length ? `<div class="chapters" hidden id="chapters">${chapters.map(ch2 => `<div class="chapter-item" data-t="${ch2.t}"><img src="${thumbSVG(v.id + ch2.t, '', { noText: true })}" alt=""><div><b>${esc(ch2.title)}</b><div class="muted">${fmtDur(ch2.t)}</div></div></div>`).join('')}</div>` : ''}
            <div class="desc-extra" hidden style="margin-top:16px"><a href="#/channel/${c.id}" style="display:flex;gap:12px;align-items:center">${avatarHTML(c, 48)}<div><b>${esc(c.name)}</b><div class="muted">${fmtCount(c.subs)} subscribers</div></div></a>
              <div style="display:flex;gap:8px;margin-top:12px"><a class="pill outline" href="#/channel/${c.id}/videos">${icon('myvideos', 'sm')} Videos</a><a class="pill outline" href="#/channel/${c.id}/about">About</a></div></div>
            <span class="morebtn">...more</span>
          </div>
          <section class="comments ${isMobile() ? 'mobile-collapsed' : ''}" id="comments"></section>
        </div>
      </div>
      <aside class="watch-side">
        ${upnext.length ? `<div class="s-card" style="padding:12px;margin-bottom:12px"><b>Queue</b> <span class="muted">· ${upnext.length} videos</span><div style="margin-top:8px">${upnext.map(compactCard).join('')}</div><button class="text-btn" id="clear-q">Clear queue</button></div>` : ''}
        <div class="autoplay-row"><span>Autoplay</span><button class="switch ${DB.user.autoplay ? 'on' : ''}" id="ap-switch" aria-label="Autoplay"></button></div>
        <div class="up-next"><div class="chips"><button class="chip on">All</button><button class="chip">From ${esc(c.name)}</button><button class="chip">${esc(v.category)}</button><button class="chip">Related</button><button class="chip">Recently uploaded</button></div>
        <div id="related">${relatedSorted.slice(0, 20).map(compactCard).join('')}</div></div>
      </aside>
    </div>`;
  document.title = v.title + ' - Vidora';
  // player
  if (currentPlayer) { currentPlayer.destroy(); currentPlayer = null; }
  const next = () => { const q = Queue.shift(); const n = q || relatedSorted[0]?.id; if (n) go('#/watch/' + n); };
  currentPlayer = await createPlayer($('#player-host'), v, {
    onNext: next, onMini: () => { openMini(v, currentPlayer.src.currentTime); history.back(); },
    onEnded: p => { if (v.type === 'short') return; DB.user.progress[v.id] = 1; saveDB(); if (!DB.user.autoplay && !Queue.length) return; const n = vid(Queue[0] || relatedSorted[0]?.id); if (!n) return;
      const end = document.createElement('div'); end.className = 'p-end'; end.innerHTML = `<div class="muted" style="color:#ddd">Up next in <b id="cd">5</b></div><div class="next-card"><img src="${thumbOf(n)}"><div><b>${esc(n.title)}</b><div style="color:#ccc">${esc(ch(n.channelId).name)}</div></div></div><div style="display:flex;gap:8px"><button class="pill" id="end-cancel" style="background:rgba(255,255,255,.15);color:#fff">Cancel</button><button class="pill inverse" id="end-play" style="background:#fff;color:#000">Play now</button></div>`;
      p.root.appendChild(end); let s = 5; const t = setInterval(() => { s--; const cd = $('#cd'); if (cd) cd.textContent = s; if (s <= 0) { clearInterval(t); next(); } }, 1000);
      $('#end-cancel').onclick = () => { clearInterval(t); end.remove(); }; $('#end-play').onclick = () => { clearInterval(t); next(); }; },
  });
  if (params.get('t')) currentPlayer.seek(+params.get('t'));
  // actions
  const seg = () => { const L = DB.user.liked.includes(id), D = DB.user.disliked.includes(id); $('#like-btn').className = L ? 'on' : ''; $('#dislike-btn').className = D ? 'on' : ''; $('#like-btn span').textContent = fmtCount(v.likes); };
  $('#like-btn').onclick = () => { rate(v, 'like'); seg(); }; $('#dislike-btn').onclick = () => { rate(v, 'dislike'); seg(); };
  $('#share-btn').onclick = () => openShare(v); $('#save-btn').onclick = () => openSaveDialog(v.id); $('#dl-btn').onclick = () => fakeDownload(v);
  $('#thanks-btn').onclick = () => openThanks(v); $('#clip-btn').onclick = () => openClip(v);
  $('#ap-switch').onclick = e => { DB.user.autoplay = !DB.user.autoplay; saveDB(); e.currentTarget.classList.toggle('on', DB.user.autoplay); toast('Autoplay is ' + (DB.user.autoplay ? 'on' : 'off')); };
  $('#clear-q') && ($('#clear-q').onclick = () => { Queue.length = 0; pageWatch(id, params); });
  const desc = $('#desc');
  const openDesc = () => { desc.classList.add('open'); $('.morebtn', desc).textContent = 'Show less'; $('.desc-extra', desc).hidden = false; if ($('#chapters')) $('#chapters').hidden = false; };
  desc.onclick = e => {
    const ts = e.target.closest('.ts-link'); if (ts) { e.stopPropagation(); currentPlayer.seek(+ts.dataset.t); currentPlayer.play(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const chp = e.target.closest('.chapter-item'); if (chp) { currentPlayer.seek(+chp.dataset.t); currentPlayer.play(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.classList.contains('morebtn') && desc.classList.contains('open')) { desc.classList.remove('open'); $('.morebtn', desc).textContent = '...more'; $('.desc-extra', desc).hidden = true; if ($('#chapters')) $('#chapters').hidden = true; return; }
    if (!desc.classList.contains('open')) openDesc();
  };
  $('[data-more-desc]').onclick = () => openMobileSheet('Description', $('#desc').outerHTML.replace('mobile-hide', 'open'), { onBind: el => { const d = el.querySelector('.desc-box'); d.querySelector('.desc-extra').hidden = false; const cps = d.querySelector('#chapters'); if (cps) cps.hidden = false; d.querySelector('.morebtn').remove(); d.onclick = e => { const t = e.target.closest('[data-t]'); if (t) { currentPlayer.seek(+t.dataset.t); } }; } });
  $('.up-next .chips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $$('.up-next .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); const i = $$('.up-next .chip').indexOf(b);
    let list = relatedSorted; if (i === 1) list = feedPool().filter(x => x.channelId === v.channelId && x.id !== id && x.type !== 'short'); if (i === 2) list = related.filter(x => x.category === v.category); if (i === 4) list = related.slice().sort((a, b2) => b2.uploaded - a.uploaded);
    $('#related').innerHTML = list.slice(0, 20).map(compactCard).join('') || '<p class="muted">Nothing here yet.</p>'; };
  renderComments(v);
}
function linkify(text) {
  return esc(text).replace(/(^|\n)(\d+):(\d{2})/g, (m, pre, mm, ss) => `${pre}<span class="ts-link" data-t="${+mm * 60 + +ss}">${mm}:${ss}</span>`).replace(/#(\w+)/g, '<span class="tag">#$1</span>').replace(/(https?:\/\/[^\s<]+)/g, '<a class="tag" href="$1" target="_blank" rel="noopener">$1</a>');
}
function openMobileSheet(title, html, opts = {}) { const m = modal(html, { title, width: 640 }); opts.onBind && opts.onBind(m.body); return m; }
function openThanks(v) {
  const amts = [2, 5, 10, 20, 50]; let sel = 5;
  const m = modal(`<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:8px 0"><div style="width:100%;border-radius:12px;padding:24px;text-align:center;background:linear-gradient(135deg,#1dd1a1,#0abde3);color:#fff"><div style="font-size:48px">💚</div><b style="font-size:28px" id="th-amt">$5.00</b></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${amts.map(a => `<button class="chip ${a === sel ? 'on' : ''}" data-a="${a}">$${a}</button>`).join('')}</div>
    <div class="field-box" style="width:100%"><label>Add a comment (optional)</label><input id="th-msg" maxlength="200" placeholder="Thanks for the great video!"></div>
    <p class="muted" style="font-size:12px;margin:0">Demo only — no payment is taken.</p></div>`, { title: `Say thanks to ${ch(v.channelId).name}`, width: 420, foot: '<button class="pill blue" data-buy>Buy and send</button>' });
  m.body.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; sel = +b.dataset.a; $$('[data-a]', m.body).forEach(x => x.classList.toggle('on', x === b)); $('#th-amt').textContent = '$' + sel.toFixed(2); };
  m.el.querySelector('[data-buy]').onclick = () => { const msg = $('#th-msg').value.trim(); (DB.comments[v.id] = DB.comments[v.id] || []).unshift({ id: uid('c'), author: ch('me').name, me: true, text: msg || 'Thanks!', thanks: sel, ts: Date.now(), likes: 0, replies: [] }); saveDB(); m.close(); renderComments(v); toast(`Sent $${sel} Thanks to ${ch(v.channelId).name}`); };
}
function openClip(v) {
  const now = currentPlayer ? Math.floor(currentPlayer.src.currentTime) : 0;
  const m = modal(`<div class="field-box"><label>Clip title</label><input id="clip-t" maxlength="140" placeholder="Add a title (required)"></div>
    <div style="display:flex;gap:12px"><div class="field-box" style="flex:1"><label>Start (s)</label><input id="clip-s" type="number" value="${now}"></div><div class="field-box" style="flex:1"><label>Length (5–60 s)</label><input id="clip-l" type="number" value="15" min="5" max="60"></div></div>`, { title: 'Create clip', width: 460, foot: '<button class="text-btn" data-x2>Cancel</button><button class="pill blue" data-share>Share clip</button>' });
  m.el.querySelector('[data-x2]').onclick = () => m.close();
  m.el.querySelector('[data-share]').onclick = () => { const t = $('#clip-t').value.trim(); if (!t) return toast('Add a clip title'); m.close(); openShare(v, { url: `#/watch/${v.id}?t=${+$('#clip-s').value || 0}` }); };
}

/* comments */
let commentSort = 'top';
function renderComments(v) {
  const host = $('#comments'); if (!host) return; const list = DB.comments[v.id] || [];
  const sorted = list.slice().sort((a, b) => (b.pinned - a.pinned) || (commentSort === 'top' ? b.likes - a.likes : b.ts - a.ts));
  const total = list.reduce((n, c) => n + 1 + c.replies.length, 0);
  const me = ch('me'); const creator = v.channelId === 'me';
  const one = (c, isReply, parent) => { const liked = DB.user.likedComments.includes(c.id);
    const authorCh = c.me ? me : c.byCreator ? ch(v.channelId) : { id: c.author, name: c.author };
    return `<div class="comment" data-cid="${c.id}">${avatarHTML(authorCh, isReply ? 24 : 40)}<div class="body">
      ${c.pinned ? `<div class="pinned">${icon('flag', 'xs')} Pinned by ${esc(ch(v.channelId).name)}</div>` : ''}
      <div class="who">${c.byCreator ? `<span class="creator">${esc(ch(v.channelId).handle)}</span>` : `<span>@${esc(c.author.toLowerCase().replace(/[^a-z0-9._]/g, ''))}</span>`}<span class="when">${timeAgo(c.ts)}${c.edited ? ' (edited)' : ''}</span></div>
      ${c.thanks ? `<div style="display:inline-block;background:#0abde3;color:#fff;border-radius:12px;padding:2px 10px;font-size:12px;margin:4px 0">💚 Thanks $${c.thanks}</div>` : ''}
      <div class="txt">${esc(c.text)}</div>
      <div class="acts"><button class="icon-btn ${liked ? 'on' : ''}" data-clike="${c.id}">${icon('like')}</button><span>${c.likes ? fmtCount(c.likes + (liked ? 1 : 0)) : liked ? 1 : ''}</span><button class="icon-btn" data-cdis>${icon('dislike')}</button>
        ${c.hearted ? `<span class="heart" title="Hearted by creator">${avatarHTML(ch(v.channelId), 16)}${icon('heart')}</span>` : ''}
        <button class="text-btn" style="color:var(--text);font-size:12px" data-reply="${parent || c.id}">Reply</button>
        <button class="icon-btn" data-cmenu="${c.id}" data-parent="${parent || ''}" style="margin-left:auto">${icon('dots')}</button></div>
      <div class="reply-box"></div>
      ${!isReply && c.replies.length ? `<button class="replies-toggle" data-toggle-replies="${c.id}">${icon('chevronDown', 'sm')} ${c.replies.length} ${c.replies.length > 1 ? 'replies' : 'reply'}</button><div class="replies" hidden>${c.replies.map(r => one(r, true, c.id)).join('')}</div>` : ''}
    </div></div>`; };
  host.innerHTML = `
    <div class="c-teaser"><b>Comments</b> <span class="muted">${fmtCount(total)}</span>${sorted[0] ? `<div class="row">${avatarHTML({ id: sorted[0].author, name: sorted[0].author }, 24)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sorted[0].text)}</span></div>` : '<div class="row muted">Add a comment…</div>'}</div>
    <div class="c-head"><h2>${fmtCount(total)} Comments</h2><button class="pill" style="background:none" id="c-sort">${icon('sort')} Sort by</button></div>
    <div class="c-new">${avatarHTML(me, 40)}<div class="field"><textarea id="c-input" rows="1" placeholder="Add a comment…"></textarea><div class="row" hidden id="c-row"><button class="pill" style="background:none" id="c-cancel">Cancel</button><button class="pill blue" id="c-send" disabled>Comment</button></div></div></div>
    ${sorted.map(c => one(c)).join('')}`;
  const inp = $('#c-input');
  inp.onfocus = () => $('#c-row').hidden = false;
  inp.oninput = () => { $('#c-send').disabled = !inp.value.trim(); inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
  $('#c-cancel').onclick = () => { inp.value = ''; $('#c-row').hidden = true; };
  $('#c-send').onclick = () => { list.unshift({ id: uid('c'), author: me.name, me: true, text: inp.value.trim(), ts: Date.now(), likes: 0, replies: [], byCreator: creator }); DB.comments[v.id] = list; saveDB(); renderComments(v); };
  $('.c-teaser', host).onclick = () => { host.classList.remove('mobile-collapsed'); host.scrollIntoView({ behavior: 'smooth' }); };
  $('#c-sort').onclick = e => { const m = menu(e.currentTarget, `<button data-close data-s="top">Top comments</button><button data-close data-s="new">Newest first</button>`, { alignLeft: true, sheet: false }); m.onclick = ev => { const b = ev.target.closest('[data-s]'); if (b) { commentSort = b.dataset.s; renderComments(v); } }; };
  host.onclick = e => {
    const lk = e.target.closest('[data-clike]'); if (lk) { const l = DB.user.likedComments; const i = l.indexOf(lk.dataset.clike); if (i >= 0) l.splice(i, 1); else l.push(lk.dataset.clike); saveDB(); renderComments(v); return; }
    const tg = e.target.closest('[data-toggle-replies]'); if (tg) { const r = tg.nextElementSibling; r.hidden = !r.hidden; tg.innerHTML = icon(r.hidden ? 'chevronDown' : 'chevronDown', 'sm') + ' ' + (r.hidden ? tg.textContent.trim() : 'Hide replies'); return; }
    const rp = e.target.closest('[data-reply]'); if (rp) { const box = rp.closest('.body').querySelector('.reply-box'); box.innerHTML = `<div class="c-new" style="margin:8px 0 16px">${avatarHTML(me, 24)}<div class="field"><textarea rows="1" placeholder="Add a reply…"></textarea><div class="row"><button class="pill" style="background:none" data-rc>Cancel</button><button class="pill blue" data-rs>Reply</button></div></div></div>`; const ta = box.querySelector('textarea'); ta.focus();
      box.querySelector('[data-rc]').onclick = () => box.innerHTML = ''; box.querySelector('[data-rs]').onclick = () => { if (!ta.value.trim()) return; const parent = list.find(c => c.id === rp.dataset.reply); parent.replies.push({ id: uid('r'), author: me.name, me: true, text: ta.value.trim(), ts: Date.now(), likes: 0, byCreator: creator }); saveDB(); renderComments(v); }; return; }
    const cm = e.target.closest('[data-cmenu]'); if (cm) { const cid = cm.dataset.cmenu, pid = cm.dataset.parent; const arr = pid ? list.find(c => c.id === pid).replies : list; const c = arr.find(x => x.id === cid);
      const m = menu(cm, `${creator && !pid ? `<button data-close data-o="pin">${icon('flag')} ${c.pinned ? 'Unpin' : 'Pin'}</button><button data-close data-o="heart">${icon('heart')} ${c.hearted ? 'Remove heart' : 'Heart'}</button>` : ''}${c.me ? `<button data-close data-o="edit">${icon('edit')} Edit</button><button data-close data-o="del">${icon('trash')} Delete</button>` : `<button data-close data-o="rep">${icon('flag')} Report</button>`}`, { sheet: false });
      m.onclick = async ev => { const o = ev.target.closest('[data-o]')?.dataset.o; if (!o) return;
        if (o === 'pin') { list.forEach(x => { if (x !== c) x.pinned = false; }); c.pinned = !c.pinned; }
        if (o === 'heart') c.hearted = !c.hearted;
        if (o === 'del') { if (!(await confirmDialog('Delete comment', 'Delete your comment permanently?'))) return; arr.splice(arr.indexOf(c), 1); }
        if (o === 'edit') { const el = host.querySelector(`[data-cid="${cid}"] .txt`); el.innerHTML = `<textarea class="line-input">${esc(c.text)}</textarea><div style="text-align:right"><button class="pill blue sm" data-save>Save</button></div>`; el.querySelector('[data-save]').onclick = () => { c.text = el.querySelector('textarea').value.trim() || c.text; c.edited = true; saveDB(); renderComments(v); }; return; }
        if (o === 'rep') { openReport(); return; }
        saveDB(); renderComments(v); }; }
  };
}

/* ---------- mini player ---------- */
async function openMini(v, t) {
  closeMini(true); const box = $('#mini-player'); box.hidden = false;
  box.innerHTML = `<button class="icon-btn mp-expand" title="Expand">${icon('fullscreen', 'sm')}</button><button class="icon-btn mp-close" title="Close">${icon('close')}</button><div class="mp-host"></div><div class="mp-info"><div class="t"><b>${esc(v.title)}</b><span class="muted">${esc(ch(v.channelId).name)}</span></div><button class="icon-btn mp-pp">${icon('pause')}</button></div>`;
  if (currentPlayer) { currentPlayer.destroy(); currentPlayer = null; }
  miniPlayer = await createPlayer($('.mp-host', box), v, { resume: false }); miniPlayer.seek(t || 0);
  $('.mp-close', box).onclick = e => { e.stopPropagation(); closeMini(); };
  $('.mp-pp', box).onclick = e => { e.stopPropagation(); miniPlayer.toggle(); $('.mp-pp', box).innerHTML = icon(miniPlayer.src.paused ? 'play' : 'pause'); };
  const expand = () => { const time = miniPlayer.src.currentTime; const id = v.id; closeMini(); go(`#/watch/${id}?t=${Math.floor(time)}`); };
  $('.mp-expand', box).onclick = e => { e.stopPropagation(); expand(); };
  $('.mp-info', box).onclick = expand;
}
function closeMini(silent) { if (miniPlayer) { miniPlayer.destroy(); miniPlayer = null; } const b = $('#mini-player'); b.hidden = true; b.innerHTML = ''; }

/* ---------- SHORTS ---------- */
let shortsObserver = null; const shortPlayers = new Map();
function pageShorts(id) {
  let list = shuffleBy(feedPool().filter(v => v.type === 'short'), 'shorts');
  if (id) { const v = vid(id); if (v) list = [v, ...list.filter(x => x.id !== id)]; }
  $('#page').innerHTML = `<div class="shorts-page" id="shorts">${list.map(v => { const c = ch(v.channelId); const liked = DB.user.liked.includes(v.id), dis = DB.user.disliked.includes(v.id);
    return `<div class="short-slot" data-id="${v.id}">
      <div class="short-player"><div class="sp-host" style="width:100%;height:100%"><img src="${thumbOf(v)}" style="width:100%;height:100%;object-fit:cover" alt=""></div>
        <div class="short-top"><button class="icon-btn sp-pp">${icon('pause')}</button><button class="icon-btn sp-mute">${icon('volume')}</button></div>
        <div class="short-overlay"><div class="who"><a href="#/channel/${c.id}">${avatarHTML(c, 32)}</a><a href="#/channel/${c.id}">${esc(c.handle)}</a><span data-subwrap="${c.id}">${subscribeBtnHTML(c.id)}</span></div><div class="t">${esc(v.title)}</div></div>
        <div class="short-progress"><span style="width:0"></span></div></div>
      <div class="short-actions">
        <div class="sa"><button class="icon-btn ${liked ? 'on' : ''}" data-sl="${v.id}">${icon('like')}</button><span>${fmtCount(v.likes)}</span></div>
        <div class="sa"><button class="icon-btn ${dis ? 'on' : ''}" data-sd="${v.id}">${icon('dislike')}</button><span>Dislike</span></div>
        <div class="sa"><button class="icon-btn" data-sc="${v.id}">${icon('comment')}</button><span>${fmtCount((DB.comments[v.id] || []).length)}</span></div>
        <div class="sa"><button class="icon-btn" data-ss="${v.id}">${icon('share')}</button><span>Share</span></div>
        <div class="sa"><button class="icon-btn" data-vmenu="${v.id}">${icon('dotsH')}</button></div>
        <a href="#/channel/${c.id}"><img class="sound-tile" src="${thumbSVG(c.id, '', { noText: true, w: 40, h: 40 })}" alt=""></a>
      </div></div>`; }).join('')}</div>
    <div class="shorts-nav"><button class="icon-btn" id="sh-up">${icon('chevronDown', '')}</button><button class="icon-btn" id="sh-down">${icon('chevronDown')}</button></div>`;
  $('#sh-up').firstChild.style.transform = 'rotate(180deg)';
  const page = $('#shorts');
  $('#sh-up').onclick = () => page.scrollBy({ top: -page.clientHeight, behavior: 'smooth' });
  $('#sh-down').onclick = () => page.scrollBy({ top: page.clientHeight, behavior: 'smooth' });
  shortsObserver && shortsObserver.disconnect();
  shortsObserver = new IntersectionObserver(entries => entries.forEach(async en => {
    const slot = en.target, sid = slot.dataset.id;
    if (en.isIntersecting && en.intersectionRatio > 0.6) {
      history.replaceState(null, '', '#/shorts/' + sid);
      if (!shortPlayers.has(sid)) { const v = vid(sid); const src = await makeSource(v); src.el.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'; const host = slot.querySelector('.sp-host'); host.innerHTML = ''; host.appendChild(src.el); src.volume = PlayerPrefs.volume; src.muted = PlayerPrefs.muted;
        if (src instanceof CanvasSource) src.on('ended', () => src.play()); src.on('timeupdate', () => { slot.querySelector('.short-progress span').style.width = (src.currentTime / src.duration * 100) + '%'; });
        shortPlayers.set(sid, src); host.onclick = () => { src.paused ? src.play() : src.pause(); slot.querySelector('.sp-pp').innerHTML = icon(src.paused ? 'play' : 'pause'); };
        slot.querySelector('.sp-pp').onclick = host.onclick; slot.querySelector('.sp-mute').onclick = () => { src.muted = !src.muted; PlayerPrefs.muted = src.muted; slot.querySelector('.sp-mute').innerHTML = icon(src.muted ? 'mute' : 'volume'); };
        if (!DB.user.historyPaused) { DB.user.history = [{ id: sid, ts: Date.now() }, ...DB.user.history.filter(h => h.id !== sid)]; saveDB(); } }
      shortPlayers.get(sid).play(); slot.querySelector('.sp-pp').innerHTML = icon('pause');
    } else if (shortPlayers.has(sid)) shortPlayers.get(sid).pause();
  }), { root: page, threshold: [0, 0.6, 1] });
  $$('.short-slot', page).forEach(s => shortsObserver.observe(s));
  page.onclick = e => {
    const l = e.target.closest('[data-sl]'), d = e.target.closest('[data-sd]'), c = e.target.closest('[data-sc]'), s = e.target.closest('[data-ss]');
    if (l || d) { const v = vid((l || d).dataset.sl || (l || d).dataset.sd); rate(v, l ? 'like' : 'dislike'); const slot = (l || d).closest('.short-slot'); slot.querySelector('[data-sl]').classList.toggle('on', DB.user.liked.includes(v.id)); slot.querySelector('[data-sd]').classList.toggle('on', DB.user.disliked.includes(v.id)); slot.querySelector('[data-sl] + span').textContent = fmtCount(v.likes); }
    if (c) { const v = vid(c.dataset.sc); const m = modal('<section class="comments" id="comments" style="margin-top:0"></section>', { title: 'Comments', width: 480 }); renderComments(v); m.onClose = () => {}; }
    if (s) openShare(vid(s.dataset.ss), { url: '#/shorts/' + s.dataset.ss });
  };
  page.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); $('#sh-down').click(); } if (e.key === 'ArrowUp') { e.preventDefault(); $('#sh-up').click(); } });
  page.tabIndex = 0; page.focus({ preventScroll: true });
}
function cleanupShorts() { shortsObserver && shortsObserver.disconnect(); shortPlayers.forEach(p => p.destroy()); shortPlayers.clear(); }

/* ---------- SUBSCRIPTIONS ---------- */
function pageSubscriptions() {
  const vids = feedPool().filter(v => isSubbed(v.channelId) && v.type !== 'short').sort((a, b) => b.uploaded - a.uploaded);
  const shorts = feedPool().filter(v => isSubbed(v.channelId) && v.type === 'short').slice(0, 6);
  const subs = DB.user.subscriptions.map(ch).filter(Boolean);
  $('#page').innerHTML = `<div class="content">
    ${isMobile() ? `<div class="stories-row" style="padding:12px">${subs.map(c => `<a class="story-bubble" href="#/channel/${c.id}">${avatarHTML(c, 56)}<span class="name">${esc(c.name)}</span></a>`).join('')}</div>` : ''}
    ${storiesRow()}
    <div class="sec-head content-pad"><h2>Latest</h2><a class="text-btn" href="#/channels">Manage</a></div>
    ${shorts.length ? `<section class="shelf" style="border-top:0;margin-top:0;padding-top:0"><div class="shelf-head">${icon('shorts')} Shorts</div><div class="shorts-row">${shorts.map(shortCard).join('')}</div></section>` : ''}
    ${vids.length ? `<div class="grid">${vids.map(videoCard).join('')}</div>` : `<div class="empty">${icon('subs')}<h2>Don't miss new videos</h2><p>Subscribe to channels to see their latest videos here.</p></div>`}
  </div>`;
}
function pageChannels() {
  const subs = DB.user.subscriptions.map(ch).filter(Boolean);
  $('#page').innerHTML = `<div class="content" style="max-width:1100px;margin:0 auto"><h1 class="page-title">All subscriptions</h1>
    ${subs.map(c => `<div class="channel-result"><a class="pic" href="#/channel/${c.id}">${avatarHTML(c, 136)}</a><div class="info"><h3><a href="#/channel/${c.id}">${esc(c.name)}</a>${c.verified ? icon('verified', 'vchk') : ''}</h3><div class="muted">${esc(c.handle)} • ${fmtCount(c.subs)} subscribers</div><p class="muted">${esc(c.desc)}</p></div><span data-subwrap="${c.id}">${subscribeBtnHTML(c.id)}</span></div>`).join('') || '<div class="empty"><h2>No subscriptions yet</h2></div>'}</div>`;
}

/* ---------- CHANNEL ---------- */
function pageChannel(cid, tab = 'home') {
  const c = ch(cid); if (!c) return pageNotFound();
  const vids = DB.videos.filter(v => v.channelId === cid && (cid === 'me' || v.visibility === 'public'));
  const longs = vids.filter(v => v.type === 'video').sort((a, b) => b.uploaded - a.uploaded), shorts = vids.filter(v => v.type === 'short'), lives = vids.filter(v => v.type === 'live');
  const posts = DB.posts.filter(p => p.channelId === cid).sort((a, b) => b.ts - a.ts);
  const story = activeStories().find(s => s.channelId === cid);
  const pls = cid === 'me' ? DB.playlists : [];
  const tabs = [['home', 'Home'], ['videos', 'Videos'], ['shorts', 'Shorts'], ['live', 'Live'], ['playlists', 'Playlists'], ['posts', 'Posts'], ['stories', 'Stories'], ['about', 'About']];
  let body = '';
  const featured = longs.slice().sort((a, b) => b.views - a.views)[0];
  if (tab === 'home') body = `${featured ? `<div class="featured"><a class="thumb" href="#/watch/${featured.id}"><img src="${thumbOf(featured)}" alt="">${durBadge(featured)}</a><div class="ftxt"><h3>${esc(featured.title)}</h3><div class="muted">${viewsLine(featured)}</div><p class="muted" style="white-space:pre-wrap">${esc((featured.desc || '').slice(0, 220))}</p></div></div>` : ''}
    ${story ? `<div class="sec-head content-pad"><h2>Stories</h2></div><div class="content-pad">${storyStrip(story)}</div>` : ''}
    <div class="sec-head content-pad"><h2>Videos</h2><a class="text-btn" href="#/channel/${cid}/videos">Play all</a></div><div class="h-scroll content-pad">${longs.slice(0, 12).map(videoCard).join('') || '<p class="muted">No videos yet.</p>'}</div>
    ${shorts.length ? `<div class="sec-head content-pad"><h2>${icon('shorts')} Shorts</h2></div><div class="shorts-row content-pad">${shorts.map(shortCard).join('')}</div>` : ''}
    ${posts.length ? `<div class="sec-head content-pad"><h2>Posts</h2></div>${posts.slice(0, 2).map(postHTML).join('')}` : ''}`;
  else if (tab === 'videos') body = `<div class="chips" style="position:static;padding:12px 0"><button class="chip on">Latest</button><button class="chip">Popular</button><button class="chip">Oldest</button></div><div class="grid" id="ch-grid">${longs.map(videoCard).join('') || '<div class="empty">This channel has no videos.</div>'}</div>`;
  else if (tab === 'shorts') body = `<div class="shorts-row" style="padding-top:16px">${shorts.map(shortCard).join('') || '<div class="empty">No Shorts yet.</div>'}</div>`;
  else if (tab === 'live') body = `<div class="grid">${lives.map(videoCard).join('') || '<div class="empty">No live streams.</div>'}</div>`;
  else if (tab === 'playlists') body = pls.length ? `<div class="grid">${pls.map(p => `<a class="card" href="#/playlist/${p.id}"><div class="thumb"><img src="${p.videos[0] ? thumbOf(vid(p.videos[0])) : thumbSVG(p.id, p.name)}" alt=""><span class="dur">${icon('playlist', 'xs')} ${p.videos.length} videos</span></div><h3 class="v-title">${esc(p.name)}</h3><div class="v-sub">View full playlist</div></a>`).join('')}</div>` : '<div class="empty">This channel has no playlists.</div>';
  else if (tab === 'posts') body = `${cid === 'me' ? `<div class="post" style="cursor:pointer" onclick="openPostComposer()">${avatarHTML(c, 40)}<div class="body"><div class="muted" style="padding:10px 0">Share a sneak peek, poll, or update with your audience…</div><div style="display:flex;gap:8px"><span class="pill sm">${icon('image', 'sm')} Image</span><span class="pill sm">${icon('poll', 'sm')} Poll</span></div></div></div>` : ''}${posts.map(postHTML).join('') || '<div class="empty">This channel hasn\'t posted yet.</div>'}`;
  else if (tab === 'stories') body = c.subs < 10000 ? `<div class="empty">${icon('story')}<h2>Stories unlock at 10,000 subscribers</h2><p>${esc(c.name)} has ${fmtCount(c.subs)} subscribers.</p></div>` : story ? `<div style="padding:16px 0">${storyStrip(story)}</div>` : `<div class="empty">${icon('story')}<h2>No active stories</h2><p>Stories disappear after 7 days.</p>${cid === 'me' ? '<button class="pill blue" onclick="openStoryEditor()">Create story</button>' : ''}</div>`;
  else if (tab === 'about') body = `<div style="max-width:720px;padding:24px 0" class="content-pad"><h2>Description</h2><p style="white-space:pre-wrap">${esc(c.desc)}</p><h2>Channel details</h2>
    <div style="display:grid;gap:14px">${c.links.map(l => `<div style="display:flex;gap:16px">${icon('link')}<a class="tag" style="color:var(--link)">${esc(l)}</a></div>`).join('')}<div style="display:flex;gap:16px">${icon('globe')} vidora.example/${esc(c.handle)}</div><div style="display:flex;gap:16px">${icon('subs')} ${fmtCount(c.subs)} subscribers</div><div style="display:flex;gap:16px">${icon('myvideos')} ${vids.length} videos</div><div style="display:flex;gap:16px">${icon('trending')} ${vids.reduce((n, v) => n + v.views, 0).toLocaleString()} views</div><div style="display:flex;gap:16px">${icon('clock')} Joined ${new Date(c.joined).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div><div style="display:flex;gap:16px">${icon('globe')} ${esc(c.country)}</div></div>
    <div style="display:flex;gap:8px;margin-top:24px"><button class="pill" onclick="openShare(null,{url:'#/channel/${cid}'})">${icon('share')} Share channel</button><button class="pill" onclick="openReport()">${icon('flag')} Report user</button></div></div>`;
  $('#page').innerHTML = `<div class="channel">
    <div class="banner" style="background-image:url('${c.bannerData || thumbSVG(cid + 'banner', '', { w: 1240, h: 200, noText: true })}')"></div>
    <div class="ch-head"><div class="top-row"><span class="ring ${story ? (storyUnseen(story) ? 'unseen' : 'seen') : ''}" ${story ? `data-story="${cid}" title="View story"` : ''}>${avatarHTML(c, 160)}</span>${isMobile() ? `<div><h1>${esc(c.name)}${c.verified ? icon('verified', 'vchk') : ''}</h1><div class="line"><b>${esc(c.handle)}</b><br><span data-subcount="${cid}">${fmtCount(c.subs)} subscribers</span> • ${vids.length} videos</div></div>` : ''}</div>
      <div>${isMobile() ? '' : `<h1>${esc(c.name)}${c.verified ? icon('verified', 'vchk') : ''}</h1><div class="line"><b>${esc(c.handle)}</b> • <span data-subcount="${cid}">${fmtCount(c.subs)} subscribers</span> • ${vids.length} videos</div>`}
        <div class="desc-line" onclick="go('#/channel/${cid}/about')">${esc(c.desc.slice(0, 90))}${c.desc.length > 90 ? '…' : ''} ${icon('chevronRight', 'sm')}</div>
        <div class="btns"><span data-subwrap="${cid}" style="display:contents">${subscribeBtnHTML(cid)}</span>${cid !== 'me' ? `<button class="pill" onclick="toast('Memberships aren\\'t available in this demo')">Join</button>` : `<button class="pill" onclick="openStoryEditor()">${icon('story', 'sm')} Add story</button>`}</div></div></div>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/channel/${cid}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}<a href="#" onclick="event.preventDefault();$('#search-input').focus()">${icon('search', 'sm')}</a></nav>
    <div class="ch-body">${body}</div></div>`;
  document.title = c.name + ' - Vidora';
  const chips = $('.ch-body .chips'); if (chips) chips.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $$('.chip', chips).forEach(x => x.classList.toggle('on', x === b)); const i = $$('.chip', chips).indexOf(b); const l = longs.slice().sort((a, b2) => i === 1 ? b2.views - a.views : i === 2 ? a.uploaded - b2.uploaded : b2.uploaded - a.uploaded); $('#ch-grid').innerHTML = l.map(videoCard).join(''); };
  bindPosts($('.ch-body'));
}
function storyStrip(story) {
  return `<div style="display:flex;gap:12px;overflow-x:auto">${story.slides.map((sl, i) => `<button data-story="${story.channelId}" data-idx="${i}" style="width:120px;aspect-ratio:9/16;border-radius:12px;flex-shrink:0;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:${sl.img ? `url(${sl.img}) center/cover` : `linear-gradient(160deg,${sl.bg[0]},${sl.bg[1]})`};opacity:${DB.user.viewedStories.includes(sl.id) ? .6 : 1}"><span style="font-size:36px">${sl.img ? '' : sl.emoji}</span><span style="font-size:11px;padding:0 6px">${esc(sl.text).slice(0, 40)}</span><span style="font-size:10px;opacity:.8">${timeAgo(sl.ts)}</span></button>`).join('')}</div>`;
}

/* ---------- POSTS ---------- */
function postHTML(p) {
  const c = ch(p.channelId); const liked = DB.user.likedPosts.includes(p.id); const myVote = DB.user.votes[p.id];
  const total = p.options ? p.options.reduce((n, o) => n + o.votes, 0) + (myVote !== undefined ? 1 : 0) : 0;
  return `<div class="post" data-post="${p.id}">${avatarHTML(c, 40)}<div class="body">
    <div class="who"><a href="#/channel/${c.id}"><b>${esc(c.name)}</b></a><a class="muted" href="#/post/${p.id}">${timeAgo(p.ts)}</a></div>
    <div class="txt">${linkify(p.text)}</div>
    ${p.type === 'image' ? `<div class="pimg"><img src="${p.img || thumbSVG(p.id, '', { w: 400, h: 400, noText: true })}" alt=""></div>` : ''}
    ${p.type === 'poll' ? `<div class="muted" style="font-size:12px;margin-bottom:8px">${fmtCount(total)} votes</div>${p.options.map((o, i) => { const n = o.votes + (myVote === i ? 1 : 0); const pct = total ? Math.round(n / total * 100) : 0; return `<div class="poll-opt ${myVote === i ? 'mine' : ''}" data-vote="${i}">${myVote !== undefined ? `<i class="bar" style="width:${pct}%"></i>` : ''}<span>${myVote === i ? '✓ ' : ''}${esc(o.text)}</span>${myVote !== undefined ? `<span>${pct}%</span>` : ''}</div>`; }).join('')}` : ''}
    <div class="acts"><button class="icon-btn ${liked ? 'on' : ''}" data-plike>${icon('like', 'sm')}</button><span>${fmtCount(p.likes + (liked ? 1 : 0))}</span><button class="icon-btn" data-pdis>${icon('dislike', 'sm')}</button><a class="icon-btn" href="#/post/${p.id}">${icon('comment', 'sm')}</a><span>${p.comments.length || ''}</span><button class="icon-btn" data-pshare>${icon('share', 'sm')}</button>
      ${p.channelId === 'me' ? `<button class="icon-btn" data-pdel style="margin-left:auto" title="Delete">${icon('trash', 'sm')}</button>` : ''}</div>
  </div></div>`;
}
function bindPosts(root) {
  if (!root) return;
  root.addEventListener('click', async e => {
    const el = e.target.closest('[data-post]'); if (!el) return; const p = DB.posts.find(x => x.id === el.dataset.post); if (!p) return;
    const rerenderPost = () => { el.outerHTML = postHTML(p); };
    const v = e.target.closest('[data-vote]'); if (v) { const i = +v.dataset.vote; if (DB.user.votes[p.id] === i) delete DB.user.votes[p.id]; else DB.user.votes[p.id] = i; saveDB(); rerenderPost(); return; }
    if (e.target.closest('[data-plike]')) { const l = DB.user.likedPosts; const i = l.indexOf(p.id); if (i >= 0) l.splice(i, 1); else l.push(p.id); saveDB(); rerenderPost(); return; }
    if (e.target.closest('[data-pshare]')) { openShare(null, { url: '#/post/' + p.id }); return; }
    if (e.target.closest('[data-pdel]')) { if (await confirmDialog('Delete post', 'Delete this post permanently?')) { DB.posts = DB.posts.filter(x => x !== p); saveDB(); el.remove(); toast('Post deleted'); } }
  });
}
function pagePost(id) {
  const p = DB.posts.find(x => x.id === id); if (!p) return pageNotFound(); const me = ch('me');
  $('#page').innerHTML = `<div class="content" style="max-width:900px;margin:0 auto;padding-top:24px"><div id="post-wrap">${postHTML(p)}</div>
    <h3 class="content-pad">${p.comments.length} Comments</h3><div class="c-new content-pad">${avatarHTML(me, 40)}<div class="field"><textarea id="pc-in" rows="1" placeholder="Add a comment…"></textarea><div class="row"><button class="pill blue" id="pc-send">Comment</button></div></div></div>
    <div class="content-pad">${p.comments.map(c => `<div class="comment">${avatarHTML(me, 40)}<div class="body"><div class="who">@${esc(c.author.toLowerCase().replace(/\s/g, ''))} <span class="when">${timeAgo(c.ts)}</span></div><div class="txt">${esc(c.text)}</div></div></div>`).join('')}</div></div>`;
  bindPosts($('#post-wrap'));
  $('#pc-send').onclick = () => { const t = $('#pc-in').value.trim(); if (!t) return; p.comments.unshift({ id: uid('pc'), author: me.name, text: t, ts: Date.now() }); saveDB(); pagePost(id); };
}
function openPostComposer() {
  let type = 'text', opts = ['', ''], img = null;
  const m = modal(`<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${avatarHTML(ch('me'), 40)}<b>${esc(ch('me').name)}</b><span class="muted" style="margin-left:auto;font-size:12px">Visibility: Public</span></div>
    <textarea id="pt" class="line-input" rows="4" maxlength="1500" placeholder="What's on your mind? Tease an upcoming video, share a thought, or ask a question…" style="font-size:16px"></textarea>
    <div id="pextra" style="margin-top:12px"></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="pill sm" data-t="image">${icon('image', 'sm')} Image</button><button class="pill sm" data-t="poll">${icon('poll', 'sm')} Poll</button><button class="pill sm" data-t="video">${icon('myvideos', 'sm')} Video</button></div>`,
    { title: 'Create post', width: 600, foot: `<button class="text-btn" data-x2>Cancel</button><button class="pill blue" data-pub>Post</button>` });
  const extra = $('#pextra', m.el);
  const renderExtra = () => {
    if (type === 'poll') { extra.innerHTML = opts.map((o, i) => `<div class="field-box" style="margin-bottom:8px"><label>Option ${i + 1}</label><input data-oi="${i}" maxlength="65" value="${esc(o)}"></div>`).join('') + (opts.length < 5 ? `<button class="text-btn" id="addopt">${icon('plus', 'sm')} Add option</button>` : '') + `<button class="text-btn" data-clear style="color:var(--text-2)">Remove poll</button>`; $('#addopt', m.el) && ($('#addopt', m.el).onclick = () => { opts.push(''); renderExtra(); }); extra.oninput = e => { if (e.target.dataset.oi) opts[+e.target.dataset.oi] = e.target.value; }; }
    else if (type === 'image') { extra.innerHTML = img ? `<div style="position:relative;max-width:300px"><img src="${img}" style="width:100%;border-radius:8px"><button class="icon-btn" data-clear style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff">${icon('close')}</button></div>` : `<label class="upload-drop" style="display:block;padding:24px;cursor:pointer">${icon('image')}<div>Drag an image or click to browse</div><input type="file" accept="image/*" hidden id="pimg"></label>`; $('#pimg', m.el) && ($('#pimg', m.el).onchange = async e => { const f = e.target.files[0]; if (f) { img = await fileToDataURL(f, 900); renderExtra(); } }); }
    else if (type === 'video') { const mine = DB.videos.filter(v => v.channelId === 'me'); extra.innerHTML = `<div class="field-box"><label>Attach one of your videos</label><select id="pvid">${mine.map(v => `<option value="${v.id}">${esc(v.title)}</option>`).join('')}</select></div><button class="text-btn" data-clear style="color:var(--text-2)">Remove</button>`; }
    else extra.innerHTML = '';
    const clr = extra.querySelector('[data-clear]'); if (clr) clr.onclick = () => { type = 'text'; img = null; renderExtra(); };
  };
  m.el.querySelector('.modal-body').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; renderExtra(); } });
  m.el.querySelector('[data-x2]').onclick = () => m.close();
  m.el.querySelector('[data-pub]').onclick = () => {
    const text = $('#pt', m.el).value.trim();
    if (!text && type !== 'image') return toast('Write something first');
    const p = { id: uid('p'), channelId: 'me', type: type === 'video' ? 'text' : type, text, ts: Date.now(), likes: 0, comments: [] };
    if (type === 'poll') { const o = opts.map(s => s.trim()).filter(Boolean); if (o.length < 2) return toast('Add at least 2 options'); p.options = o.map(t => ({ text: t, votes: 0 })); }
    if (type === 'image') { if (!img) return toast('Choose an image'); p.img = img; }
    if (type === 'video') { const v = vid($('#pvid', m.el).value); p.text += (p.text ? '\n\n' : '') + '▶ ' + v.title; }
    DB.posts.unshift(p); saveDB(); m.close(); toast('Post published', { label: 'View', fn: () => go('#/post/' + p.id) }); if (currentRoute.parts[0] === 'channel') rerender();
  };
  setTimeout(() => $('#pt', m.el).focus(), 50);
}
function fileToDataURL(file, max = 1280) {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .85)); }; img.onerror = () => res(fr.result); img.src = fr.result; }; fr.readAsDataURL(file); });
}

/* ---------- SEARCH ---------- */
function pageResults(params) {
  const q = (params.get('q') || '').trim(); const ql = q.toLowerCase(); const type = params.get('type') || 'all', sort = params.get('sort') || 'rel', date = params.get('date') || 'any';
  const terms = ql.split(/\s+/).filter(Boolean);
  const score = v => { const t = (v.title + ' ' + v.desc + ' ' + ch(v.channelId).name + ' ' + v.category).toLowerCase(); return terms.reduce((s, w) => s + (v.title.toLowerCase().includes(w) ? 3 : 0) + (t.includes(w) ? 1 : 0), 0); };
  let vids = publicVideos().filter(v => v.visibility === 'public').map(v => [score(v), v]).filter(x => x[0] > 0);
  const lim = { hour: 3600e3, today: 86400e3, week: 604800e3, month: 2592e6, year: 31536e6 }[date]; if (lim) vids = vids.filter(([, v]) => Date.now() - v.uploaded < lim);
  if (type === 'video') vids = vids.filter(([, v]) => v.type === 'video'); if (type === 'short') vids = vids.filter(([, v]) => v.type === 'short'); if (type === 'live') vids = vids.filter(([, v]) => v.type === 'live');
  vids.sort((a, b) => sort === 'date' ? b[1].uploaded - a[1].uploaded : sort === 'views' ? b[1].views - a[1].views : b[0] - a[0] || b[1].views - a[1].views);
  const chans = Object.values(DB.channels).filter(c => terms.some(w => (c.name + ' ' + c.handle).toLowerCase().includes(w)));
  const posts = DB.posts.filter(p => terms.some(w => p.text.toLowerCase().includes(w)));
  const link = (k, v) => { const p = new URLSearchParams(params); if (p.get(k) === v) p.delete(k); else p.set(k, v); return '#/results?' + p.toString(); };
  const f = (k, v, l) => `<a href="${link(k, v)}" class="${(params.get(k) || '') === v ? 'on' : ''}">${l}</a>`;
  $('#page').innerHTML = `<div class="content" style="max-width:1280px;margin:0 auto;padding-top:12px">
    <div class="chips" style="padding-left:0;padding-right:0;top:56px">${[['all', 'All'], ['video', 'Videos'], ['short', 'Shorts'], ['live', 'Live'], ['channel', 'Channels'], ['post', 'Posts']].map(([k, l]) => `<a class="chip ${type === k ? 'on' : ''}" style="display:flex;align-items:center" href="#/results?q=${encodeURIComponent(q)}&type=${k}">${l}</a>`).join('')}<button class="chip" id="filters-btn" style="margin-left:auto">${icon('filter', 'sm')} Filters</button></div>
    <div class="filters-panel" id="filters" hidden>
      <div><h4>Upload date</h4>${f('date', 'hour', 'Last hour')}${f('date', 'today', 'Today')}${f('date', 'week', 'This week')}${f('date', 'month', 'This month')}${f('date', 'year', 'This year')}</div>
      <div><h4>Type</h4>${f('type', 'video', 'Video')}${f('type', 'short', 'Shorts')}${f('type', 'channel', 'Channel')}${f('type', 'post', 'Post')}</div>
      <div><h4>Duration</h4><a>Under 4 minutes</a><a>4–20 minutes</a><a>Over 20 minutes</a></div>
      <div><h4>Features</h4>${f('type', 'live', 'Live')}<a>4K</a><a>HD</a><a>Subtitles/CC</a></div>
      <div><h4>Sort by</h4>${f('sort', 'rel', 'Relevance')}${f('sort', 'date', 'Upload date')}${f('sort', 'views', 'View count')}</div>
    </div>
    ${(type === 'all' || type === 'channel') ? chans.map(c => `<div class="channel-result"><a class="pic" href="#/channel/${c.id}">${avatarHTML(c, 136)}</a><div class="info"><h3><a href="#/channel/${c.id}">${esc(c.name)}</a>${c.verified ? icon('verified', 'vchk') : ''}</h3><div class="muted">${esc(c.handle)} • ${fmtCount(c.subs)} subscribers</div><p class="muted">${esc(c.desc)}</p></div><span data-subwrap="${c.id}">${subscribeBtnHTML(c.id)}</span></div>`).join('') : ''}
    ${type === 'post' || type === 'all' ? posts.slice(0, type === 'all' ? 1 : 50).map(postHTML).join('') : ''}
    ${type !== 'channel' && type !== 'post' ? vids.map(([, v]) => listItem(v)).join('') : ''}
    ${!vids.length && !chans.length && !posts.length ? `<div class="empty">${icon('search')}<h2>No results found</h2><p>Try different keywords or remove search filters</p></div>` : ''}
  </div>`;
  $('#filters-btn').onclick = () => { $('#filters').hidden = !$('#filters').hidden; };
  bindPosts($('#page'));
  document.title = q + ' - Vidora';
}

/* ---------- LIBRARY-ish pages ---------- */
function pageHistory() {
  const items = DB.user.history.map(h => ({ ...h, v: vid(h.id) })).filter(h => h.v);
  const groups = {}; items.forEach(h => { const d = new Date(h.ts); const today = new Date().toDateString(); const y = new Date(Date.now() - 864e5).toDateString(); const k = d.toDateString() === today ? 'Today' : d.toDateString() === y ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); (groups[k] = groups[k] || []).push(h.v); });
  $('#page').innerHTML = `<div class="content two-col" style="max-width:1300px;margin:0 auto">
    <div style="flex:1;min-width:0"><h1 class="page-title">Watch history</h1>
      ${Object.keys(groups).length ? Object.entries(groups).map(([k, vs]) => `<h3 class="content-pad">${k}</h3>${vs.map(v => listItem(v, true)).join('')}`).join('') : `<div class="empty">${icon('history')}<h2>${DB.user.historyPaused ? 'Watch history is paused' : 'This list has no videos.'}</h2></div>`}</div>
    <div class="side content-pad" style="padding-top:80px"><div style="border-bottom:1px solid var(--divider);padding-bottom:12px;margin-bottom:12px"><input class="line-input" placeholder="Search watch history" id="hsearch"></div>
      <button class="pill" style="background:none;width:100%" id="hclear">${icon('trash')} Clear all watch history</button>
      <button class="pill" style="background:none;width:100%;margin-top:4px" id="hpause">${icon(DB.user.historyPaused ? 'play' : 'pause')} ${DB.user.historyPaused ? 'Turn on' : 'Pause'} watch history</button>
      <button class="pill" style="background:none;width:100%;margin-top:4px" onclick="go('#/settings')">${icon('settings')} Manage all history</button></div></div>`;
  $('#hclear').onclick = async () => { if (await confirmDialog('Clear watch history?', 'Your watch history will be cleared from all Vidora apps on all devices.', 'Clear watch history')) { DB.user.history = []; DB.user.progress = {}; saveDB(); pageHistory(); toast('Watch history cleared'); } };
  $('#hpause').onclick = () => { DB.user.historyPaused = !DB.user.historyPaused; saveDB(); pageHistory(); toast(DB.user.historyPaused ? 'Watch history paused' : 'Watch history turned on'); };
  $('#hsearch').oninput = e => { const q = e.target.value.toLowerCase(); $$('.list-item').forEach(el => { el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none'; }); };
}
function pagePlaylist(id) {
  let name, ids, vis = 'private', custom = null;
  if (id === 'WL') { name = 'Watch later'; ids = DB.user.watchLater; } else if (id === 'LL') { name = 'Liked videos'; ids = DB.user.liked; } else if (id === 'DL') { name = 'Downloads'; ids = DB.user.downloads || []; }
  else { custom = DB.playlists.find(p => p.id === id); if (!custom) return pageNotFound(); name = custom.name; ids = custom.videos; vis = custom.visibility; }
  const vids = ids.map(vid).filter(Boolean);
  $('#page').innerHTML = `<div class="content two-col" style="max-width:1400px;margin:0 auto">
    <div class="side"><div class="pl-hero" style="${vids[0] ? `background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.85)),url('${thumbOf(vids[0])}') center/cover` : ''}">
      <div class="thumb"><img src="${vids[0] ? thumbOf(vids[0]) : thumbSVG(id, name)}" alt=""></div>
      <h1>${esc(name)}</h1><div><b>${esc(ch('me').name)}</b></div><div style="opacity:.8;font-size:12px;margin-top:4px">${vids.length} videos • ${icon(vis === 'public' ? 'globe' : 'lock', 'xs')} ${vis[0].toUpperCase() + vis.slice(1)}</div>
      <div class="btns"><button class="pill inverse" id="pl-play">${icon('play', 'sm')} Play all</button><button class="pill" id="pl-shuffle">${icon('shuffle', 'sm')} Shuffle</button></div>
      ${custom ? `<div class="btns" style="margin-top:8px"><button class="pill" id="pl-share">${icon('share', 'sm')}</button><button class="pill" id="pl-rename">${icon('edit', 'sm')}</button><button class="pill" id="pl-del">${icon('trash', 'sm')}</button></div>` : ''}</div></div>
    <div style="flex:1;min-width:0">${vids.map((v, i) => `<div class="pl-row" data-href="#/watch/${v.id}"><span class="idx">${i + 1}</span><div class="thumb"><img src="${thumbOf(v)}" alt="">${durBadge(v)}${progBar(v)}</div><div class="meta-text" style="flex:1;min-width:0"><h3 class="v-title">${esc(v.title)}</h3><div class="v-sub">${esc(ch(v.channelId).name)} • ${viewsLine(v)}</div></div><button class="icon-btn" data-rm="${v.id}" title="Remove">${icon('close')}</button></div>`).join('') || `<div class="empty">${icon('playlist')}<h2>No videos in this playlist yet</h2></div>`}</div></div>`;
  $('#pl-play').onclick = () => { if (!vids.length) return; Queue.length = 0; Queue.push(...vids.slice(1).map(v => v.id)); go('#/watch/' + vids[0].id); };
  $('#pl-shuffle').onclick = () => { if (!vids.length) return; const s = shuffleBy(vids, Math.random() * 1e9 | 0); Queue.length = 0; Queue.push(...s.slice(1).map(v => v.id)); go('#/watch/' + s[0].id); };
  $('#page').addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (!r) return; e.stopPropagation(); const i = ids.indexOf(r.dataset.rm); if (i >= 0) ids.splice(i, 1); if (id === 'LL') { const v = vid(r.dataset.rm); if (v) v.likes--; } saveDB(); pagePlaylist(id); toast('Removed from ' + name); }, { capture: true });
  if (custom) {
    $('#pl-share').onclick = () => openShare(null, { url: '#/playlist/' + id });
    $('#pl-rename').onclick = () => { const m = modal(`<div class="field-box"><label>Title</label><input id="rn" value="${esc(custom.name)}"></div><div class="field-box"><label>Visibility</label><select id="rv">${['private', 'unlisted', 'public'].map(x => `<option ${x === custom.visibility ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`, { title: 'Edit playlist', width: 400, foot: '<button class="pill blue" data-ok>Save</button>' }); m.el.querySelector('[data-ok]').onclick = () => { custom.name = $('#rn').value.trim() || custom.name; custom.visibility = $('#rv').value; saveDB(); m.close(); pagePlaylist(id); }; };
    $('#pl-del').onclick = async () => { if (await confirmDialog('Delete playlist', `Are you sure you want to delete "${custom.name}"?`)) { DB.playlists = DB.playlists.filter(p => p !== custom); saveDB(); go('#/playlists'); } };
  }
}
function pagePlaylists() {
  const all = [{ id: 'WL', name: 'Watch later', ids: DB.user.watchLater }, { id: 'LL', name: 'Liked videos', ids: DB.user.liked }, ...DB.playlists.map(p => ({ id: p.id, name: p.name, ids: p.videos }))];
  $('#page').innerHTML = `<div class="content"><h1 class="page-title">Playlists</h1><div class="chips" style="position:static;padding-left:0"><button class="chip on">Recently added</button><button class="chip" id="newpl2">${icon('plus', 'xs')} New playlist</button></div>
    <div class="grid">${all.map(p => `<a class="card" href="#/playlist/${p.id}"><div class="thumb"><img src="${p.ids[0] && vid(p.ids[0]) ? thumbOf(vid(p.ids[0])) : thumbSVG(p.id, p.name)}" alt=""><span class="dur">${icon('playlist', 'xs')} ${p.ids.length} videos</span></div><div class="meta"><div class="meta-text"><h3 class="v-title">${esc(p.name)}</h3><div class="v-sub">View full playlist</div></div></div></a>`).join('')}</div></div>`;
  $('#newpl2').onclick = () => { const m = modal(`<div class="field-box"><label>Title</label><input id="np"></div>`, { title: 'New playlist', width: 400, foot: '<button class="pill blue" data-ok>Create</button>' }); m.el.querySelector('[data-ok]').onclick = () => { const n = $('#np').value.trim(); if (!n) return; DB.playlists.push({ id: uid('pl'), name: n, videos: [], visibility: 'private', updated: Date.now() }); saveDB(); m.close(); pagePlaylists(); }; };
}
function pageYou() {
  const me = ch('me'); const hist = DB.user.history.map(h => vid(h.id)).filter(Boolean).slice(0, 12);
  const row = (title, href, vids) => `<div class="sec-head"><h2>${title}</h2>${href ? `<a class="pill sm outline" style="color:var(--text)" href="${href}">View all</a>` : ''}</div><div class="h-scroll">${vids.length ? vids.map(videoCard).join('') : '<p class="muted">Nothing here yet.</p>'}</div>`;
  $('#page').innerHTML = `<div class="content you-page" style="max-width:1300px;margin:0 auto">
    <div class="you-head">${avatarHTML(me, 120)}<div><h1>${esc(me.name)}</h1><div class="muted">${esc(me.handle)} • <a href="#/channel/me" style="color:var(--link)">View channel</a></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="pill sm" onclick="toast('Only one account in this demo')">${icon('switch', 'sm')} Switch account</button><a class="pill sm" href="#/studio">${icon('studio', 'sm')} Vidora Studio</a></div></div></div>
    ${row('History', '#/history', hist)}
    <div class="sec-head"><h2>Playlists</h2><a class="pill sm outline" style="color:var(--text)" href="#/playlists">View all</a></div>
    <div class="h-scroll">${[{ id: 'WL', name: 'Watch later', ids: DB.user.watchLater }, { id: 'LL', name: 'Liked videos', ids: DB.user.liked }, ...DB.playlists.map(p => ({ id: p.id, name: p.name, ids: p.videos }))].map(p => `<a class="card" href="#/playlist/${p.id}"><div class="thumb"><img src="${p.ids[0] && vid(p.ids[0]) ? thumbOf(vid(p.ids[0])) : thumbSVG(p.id, p.name)}" alt=""><span class="dur">${p.ids.length} videos</span></div><h3 class="v-title">${esc(p.name)}</h3></a>`).join('')}</div>
    ${row('Watch later', '#/playlist/WL', DB.user.watchLater.map(vid).filter(Boolean))}
    ${row('Liked videos', '#/playlist/LL', DB.user.liked.map(vid).filter(Boolean))}
    <div class="g-list" style="margin-top:24px;border-top:1px solid var(--divider);padding-top:12px">
      <a class="g-item" href="#/studio/content">${icon('myvideos')}<span class="lbl">Your videos</span></a>
      <a class="g-item" href="#/playlist/DL">${icon('download')}<span class="lbl">Downloads</span></a>
      <a class="g-item" href="#/channel/me/stories">${icon('story')}<span class="lbl">Your stories</span></a>
      <a class="g-item" href="#/channel/me/posts">${icon('post')}<span class="lbl">Your posts</span></a>
      <a class="g-item" href="#/settings">${icon('settings')}<span class="lbl">Settings</span></a>
      <a class="g-item" href="#/help">${icon('help')}<span class="lbl">Help &amp; feedback</span></a>
    </div></div>`;
}
function pageFeed(kind) {
  const map = { trending: null, music: 'Music', gaming: 'Gaming', news: 'News', sports: 'Sports', learning: 'Learning', podcasts: 'Podcasts' };
  let vids = feedPool().filter(v => v.type !== 'short');
  if (kind === 'live') vids = vids.filter(v => v.type === 'live'); else if (map[kind]) vids = vids.filter(v => v.category === map[kind]);
  vids.sort((a, b) => b.views / Math.max(1, (Date.now() - b.uploaded) / 864e5) - a.views / Math.max(1, (Date.now() - a.uploaded) / 864e5));
  const titles = { trending: 'Trending', music: 'Music', live: 'Live', gaming: 'Gaming', news: 'News', sports: 'Sports', learning: 'Learning', podcasts: 'Podcasts' };
  $('#page').innerHTML = `<div class="content" style="max-width:1100px;margin:0 auto"><h1 class="page-title" style="display:flex;align-items:center;gap:16px"><span style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#ff5a36,#e3125f);display:inline-flex;align-items:center;justify-content:center;color:#fff">${icon({ trending: 'trending', music: 'music', live: 'live', gaming: 'gaming', news: 'news', sports: 'sports', learning: 'learning', podcasts: 'podcast' }[kind] || 'explore')}</span>${titles[kind] || 'Explore'}</h1>
    ${kind === 'trending' ? `<div class="tabs" style="position:static;margin-bottom:16px"><a class="on">Now</a><a>Music</a><a>Gaming</a><a>Movies</a></div>` : ''}
    ${vids.map((v, i) => kind === 'trending' ? `<div style="display:flex;gap:12px;align-items:flex-start"><b style="width:24px;padding-top:4px" class="muted">${i + 1}</b><div style="flex:1;min-width:0">${listItem(v)}</div></div>` : listItem(v)).join('') || `<div class="empty"><h2>Nothing here right now</h2></div>`}</div>`;
}
function pageSettings() {
  const u = DB.user; const me = ch('me');
  $('#page').innerHTML = `<div class="content" style="max-width:900px;margin:0 auto;padding-top:12px"><h1 class="page-title">Settings</h1>
    <div class="s-card" style="margin-bottom:16px"><h3>Account</h3><div class="row"><span>Channel</span><span>${esc(me.name)} (${esc(me.handle)})</span></div><div class="row"><span>Subscribers</span><span>${me.subs.toLocaleString()}</span></div><div class="row"><span>Stories eligibility</span><span>${me.subs >= 10000 ? '✅ Eligible (10,000+ subscribers)' : `🔒 ${(10000 - me.subs).toLocaleString()} more subscribers needed`}</span></div></div>
    <div class="s-card" style="margin-bottom:16px"><h3>Appearance</h3>${['dark', 'light', 'device'].map(t => `<label class="check-row"><input type="radio" name="th" value="${t}" ${(u.theme === t) ? 'checked' : ''}> ${t === 'device' ? 'Use device theme' : t[0].toUpperCase() + t.slice(1) + ' theme'}</label>`).join('')}</div>
    <div class="s-card" style="margin-bottom:16px"><h3>Playback and performance</h3><div class="row"><span>Autoplay next video</span><button class="switch ${u.autoplay ? 'on' : ''}" id="st-ap"></button></div><div class="row"><span>Always show captions</span><button class="switch ${PlayerPrefs.captions ? 'on' : ''}" id="st-cc"></button></div></div>
    <div class="s-card" style="margin-bottom:16px"><h3>Notifications</h3>${['Subscriptions', 'Recommended videos', 'Activity on my channel', 'Replies to my comments', 'Mentions', 'New stories from channels I follow'].map((n, i) => `<div class="row"><span>${n}</span><button class="switch ${i !== 1 ? 'on' : ''}" onclick="this.classList.toggle('on')"></button></div>`).join('')}</div>
    <div class="s-card" style="margin-bottom:16px"><h3>Privacy</h3><div class="row"><span>Keep all my subscriptions private</span><button class="switch on" onclick="this.classList.toggle('on')"></button></div><div class="row"><span>Keep all my saved playlists private</span><button class="switch on" onclick="this.classList.toggle('on')"></button></div></div>
    <div class="s-card"><h3>Demo data</h3><p class="muted">Everything you create is stored locally in your browser (uploads in IndexedDB).</p><button class="pill" id="st-reset">${icon('trash', 'sm')} Reset demo data</button></div></div>`;
  $$('input[name=th]').forEach(r => r.onchange = () => { const t = r.value === 'device' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : r.value; setTheme(t); });
  $('#st-ap').onclick = e => { u.autoplay = !u.autoplay; saveDB(); e.currentTarget.classList.toggle('on', u.autoplay); };
  $('#st-cc').onclick = e => { PlayerPrefs.captions = !PlayerPrefs.captions; e.currentTarget.classList.toggle('on', PlayerPrefs.captions); };
  $('#st-reset').onclick = async () => { if (await confirmDialog('Reset demo data', 'This deletes your uploads, posts, stories and history.', 'Reset')) { resetDB(); indexedDB.deleteDatabase('vidora-media'); MediaStore.db = null; setTheme(DB.user.theme); boot(); toast('Demo data reset'); } };
}
function pageHelp() {
  $('#page').innerHTML = `<div class="content" style="max-width:800px;margin:0 auto"><h1 class="page-title">Help</h1>
    <div class="s-card"><h3>About Vidora</h3><p>Vidora is an original video-sharing web app built from scratch with HTML, CSS and JavaScript. It recreates the familiar features people expect from a modern video platform: a home feed, a watch page with a custom player, Shorts, subscriptions, channels, posts, playlists, history, search, a creator Studio for uploading and managing content, live streaming from your webcam, and <b>Stories</b> — short posts that disappear after 7 days and unlock once a channel reaches 10,000 subscribers.</p>
    <p class="muted">All data is local to your browser. No account or server is needed.</p></div>
    <div class="s-card" style="margin-top:16px"><h3>Keyboard shortcuts</h3><button class="pill" onclick="openShortcuts()">${icon('keyboard', 'sm')} Show shortcuts</button></div></div>`;
}
function pageNotFound() { $('#page').innerHTML = `<div class="empty">${icon('help')}<h2>This page isn't available. Sorry about that.</h2><p>Try searching for something else.</p><a class="pill" href="#/">Go home</a></div>`; }
