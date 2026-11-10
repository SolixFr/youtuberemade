/* Vidora Stories — viewer + creator. Available to channels with 10,000+ subscribers; slides expire after 7 days. */
const STORY_EMOJIS = ['🎬', '☕', '🎉', '📦', '🌄', '🎧', '🍜', '🚆', '🔥', '💡', '📸', '🗳️', '❤️', '😂', '🎮', '✨'];
const STORY_SLIDE_MS = 5000;

function addStorySlide(slide) {
  let s = DB.stories.find(x => x.channelId === 'me'); if (!s) { s = { channelId: 'me', slides: [] }; DB.stories.push(s); }
  s.slides.push({ id: uid('sl'), ts: Date.now(), views: 0, likes: 0, ...slide });
  DB.notifications.unshift({ id: uid('n'), channelId: 'me', text: 'Your story is live — subscribers can see it for 7 days', story: 'me', ts: Date.now(), read: false });
  saveDB();
}

function openStoryEditor() {
  const me = ch('me');
  if (me.subs < 10000) {
    const m = modal(`${storyGate()}<p>Stories are available to channels with <b>10,000 or more subscribers</b>. Keep growing — you're ${(10000 - me.subs).toLocaleString()} subscribers away!</p>`, { title: 'Stories', width: 460, foot: '<a class="text-btn" href="#/studio/customize" data-go>Adjust demo subscribers</a><button class="pill blue" data-ok>Got it</button>' });
    m.el.querySelector('[data-ok]').onclick = () => m.close(); m.el.querySelector('[data-go]').onclick = () => m.close(); return;
  }
  const st = { bg: PALETTES[0], emoji: '🎬', text: '', img: null, link: '' };
  const mine = DB.videos.filter(v => v.channelId === 'me');
  const m = modal(`<div class="story-editor"><div class="preview" id="sp"></div><div class="controls">
      <div class="field-box"><label>Text</label><textarea id="st-t" rows="2" maxlength="120" placeholder="What's happening?"></textarea><span class="count">0/120</span></div>
      <b>Background</b><div class="swatches" id="st-bg" style="margin-top:8px">${PALETTES.map((p, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}" style="background:linear-gradient(135deg,${p[0]},${p[1]})"></button>`).join('')}</div>
      <b>Sticker</b><div class="emoji-pick" id="st-em" style="margin-top:8px">${STORY_EMOJIS.map(e => `<button class="${e === st.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"><label class="pill sm" style="cursor:pointer">${icon('image', 'sm')} Add photo<input type="file" accept="image/*" hidden id="st-img"></label><button class="pill sm" id="st-cam">${icon('camera', 'sm')} Camera</button><button class="pill sm" id="st-noimg" hidden>${icon('close', 'sm')} Remove photo</button></div>
      <div class="field-box"><label>Link a video (optional)</label><select id="st-link"><option value="">None</option>${mine.map(v => `<option value="${v.id}">${esc(v.title)}</option>`).join('')}</select></div>
      <p class="muted" style="font-size:12px">Your story will be visible to viewers for 7 days.</p></div></div>`, { title: 'Create story', width: 720, foot: '<button class="text-btn" data-x2>Cancel</button><button class="pill blue" data-pub>Post story</button>' });
  const prev = () => { $('#sp', m.el).style.background = `linear-gradient(160deg,${st.bg[0]},${st.bg[1]})`; $('#sp', m.el).innerHTML = `${st.img ? `<img src="${st.img}">` : ''}<span class="emoji" style="position:relative">${st.img ? '' : st.emoji}</span><span class="stext" style="position:relative">${esc(st.text)}</span>${st.link ? `<span style="position:absolute;bottom:16px;background:#fff;color:#000;padding:6px 12px;border-radius:16px;font-size:12px;font-weight:500">▶ Watch video</span>` : ''}`; $('#st-noimg', m.el).hidden = !st.img; };
  prev();
  $('#st-t', m.el).oninput = e => { st.text = e.target.value; m.el.querySelector('.count').textContent = st.text.length + '/120'; prev(); };
  $('#st-bg', m.el).onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; st.bg = PALETTES[+b.dataset.i]; $$('#st-bg button', m.el).forEach(x => x.classList.toggle('on', x === b)); prev(); };
  $('#st-em', m.el).onclick = e => { const b = e.target.closest('button'); if (!b) return; st.emoji = b.textContent; $$('#st-em button', m.el).forEach(x => x.classList.toggle('on', x === b)); prev(); };
  $('#st-img', m.el).onchange = async e => { const f = e.target.files[0]; if (f) { st.img = await fileToDataURL(f, 1080); prev(); } };
  $('#st-noimg', m.el).onclick = () => { st.img = null; prev(); };
  $('#st-link', m.el).onchange = e => { st.link = e.target.value; prev(); };
  $('#st-cam', m.el).onclick = async () => {
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
      const cm = modal(`<div style="position:relative;border-radius:12px;overflow:hidden;background:#000"><div id="camhost"></div></div><div style="text-align:center;margin-top:16px"><button class="pill blue" id="snap">${icon('camera', 'sm')} Take photo</button></div>`, { title: 'Camera', width: 480 });
      v.style.width = '100%'; $('#camhost', cm.el).appendChild(v); cm.onClose = () => stream.getTracks().forEach(t => t.stop());
      $('#snap', cm.el).onclick = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); st.img = c.toDataURL('image/jpeg', .85); cm.close(); prev(); };
    } catch (err) { toast('Camera unavailable — try adding a photo instead'); }
  };
  m.el.querySelector('[data-x2]').onclick = () => m.close();
  m.el.querySelector('[data-pub]').onclick = () => {
    if (!st.text.trim() && !st.img) return toast('Add some text or a photo');
    addStorySlide({ bg: st.bg, emoji: st.emoji, text: st.text.trim(), img: st.img, link: st.link || undefined });
    m.close(); toast('Story posted', { label: 'View', fn: () => openStoryViewer('me') }); rerender(); renderMasthead();
  };
}

function openStoryViewer(startChannel, startIdx) {
  const list = activeStories().filter(s => s.channelId === startChannel || isSubbed(s.channelId) || s.channelId === 'me');
  const ordered = [...list.filter(s => s.channelId === startChannel), ...list.filter(s => s.channelId !== startChannel && storyUnseen(s)), ...list.filter(s => s.channelId !== startChannel && !storyUnseen(s))];
  if (!ordered.length) return toast('No active stories');
  let si = 0, ii = startIdx !== undefined ? +startIdx : Math.max(0, ordered[0].slides.findIndex(sl => !DB.user.viewedStories.includes(sl.id))), elapsed = 0, paused = false, last = performance.now(), raf;
  const root = document.createElement('div'); root.className = 'story-viewer'; $('#overlay-root').appendChild(root); document.body.classList.add('no-scroll');
  const close = () => { cancelAnimationFrame(raf); root.remove(); document.removeEventListener('keydown', onKey); if (!$('#overlay-root').children.length) document.body.classList.remove('no-scroll'); rerender(); };
  const render = () => {
    const s = ordered[si], c = ch(s.channelId), sl = s.slides[ii];
    if (!DB.user.viewedStories.includes(sl.id)) { DB.user.viewedStories.push(sl.id); sl.views = (sl.views || 0) + 1; saveDB(); }
    const liked = (DB.user.likedStories || []).includes(sl.id);
    root.innerHTML = `
      <button class="icon-btn story-close" data-close>${icon('close')}</button>
      ${si > 0 || ii > 0 ? `<button class="icon-btn story-nav l" data-prev>${icon('chevronLeft')}</button>` : ''}
      <button class="icon-btn story-nav r" data-next>${icon('chevronRight')}</button>
      <div class="story-frame" style="background:linear-gradient(160deg,${sl.bg[0]},${sl.bg[1]})">
        ${sl.img ? `<img class="simg" src="${sl.img}" alt="">` : ''}
        <div class="bars">${s.slides.map((_, k) => `<span><i style="width:${k < ii ? 100 : 0}%"></i></span>`).join('')}</div>
        <div class="shead"><a href="#/channel/${c.id}" data-close>${avatarHTML(c, 36)}</a><div><div class="n">${esc(c.name)} ${c.verified ? icon('verified', 'xs') : ''}</div><div class="w">${timeAgo(sl.ts)}</div></div><span class="sp"></span>
          <button class="icon-btn" data-pause>${icon(paused ? 'play' : 'pause')}</button><button class="icon-btn" data-mute>${icon('volume')}</button><button class="icon-btn" data-more>${icon('dots')}</button><button class="icon-btn" data-close style="${isMobile() ? '' : 'display:none'}">${icon('close')}</button></div>
        <div class="emoji" style="position:relative">${sl.img ? '' : sl.emoji}</div>
        ${sl.text ? `<div class="stext" style="position:relative">${esc(sl.text)}</div>` : ''}
        ${sl.link && vid(sl.link) ? `<a href="#/watch/${sl.link}" data-close style="position:relative;z-index:4;margin-top:12px;background:#fff;color:#000;padding:8px 16px;border-radius:20px;font-weight:500;display:flex;gap:6px;align-items:center">${icon('play', 'sm')} Watch video</a>` : ''}
        <div class="tapzone l" data-prev></div><div class="tapzone r" data-next></div>
        ${c.isMe ? `<div class="viewers">${icon('eye', 'sm')} ${(sl.views || 0) + Math.round(c.subs * .08)} views · ${sl.likes || 0} likes</div>` : ''}
        <div class="sfoot">${c.isMe ? `<button class="pill sm" data-del style="background:rgba(255,255,255,.2);color:#fff">${icon('trash', 'sm')} Delete</button><span style="flex:1"></span><button class="pill sm" data-add style="background:#fff;color:#000">${icon('plus', 'sm')} Add to story</button>` : `<input placeholder="Reply to ${esc(c.name)}…" data-reply maxlength="200"><button class="icon-btn ${liked ? 'on' : ''}" data-like>${icon('heart')}</button><button class="icon-btn" data-share>${icon('send')}</button>`}</div>
      </div>`;
  };
  const advance = d => { elapsed = 0; ii += d; const s = ordered[si];
    if (ii >= s.slides.length) { si++; ii = 0; if (si >= ordered.length) return close(); }
    if (ii < 0) { si--; if (si < 0) { si = 0; ii = 0; } else ii = ordered[si].slides.length - 1; }
    render(); };
  const tick = now => { raf = requestAnimationFrame(tick); const dt = now - last; last = now; if (paused || !root.isConnected) return; elapsed += dt;
    const bar = root.querySelectorAll('.bars i')[ii]; if (bar) bar.style.width = Math.min(100, elapsed / STORY_SLIDE_MS * 100) + '%';
    if (elapsed >= STORY_SLIDE_MS) advance(1); };
  root.addEventListener('click', async e => {
    if (e.target === root) return close();
    if (e.target.closest('[data-close]')) return close();
    if (e.target.closest('[data-prev]')) return advance(-1);
    if (e.target.closest('[data-next]')) return advance(1);
    if (e.target.closest('[data-pause]')) { paused = !paused; e.target.closest('[data-pause]').innerHTML = icon(paused ? 'play' : 'pause'); return; }
    const sl = ordered[si].slides[ii];
    if (e.target.closest('[data-like]')) { const L = DB.user.likedStories = DB.user.likedStories || []; const k = L.indexOf(sl.id); if (k >= 0) { L.splice(k, 1); sl.likes = Math.max(0, (sl.likes || 0) - 1); } else { L.push(sl.id); sl.likes = (sl.likes || 0) + 1; } saveDB(); e.target.closest('[data-like]').classList.toggle('on', k < 0); return; }
    if (e.target.closest('[data-share]')) { paused = true; openShare(null, { url: '#/channel/' + ordered[si].channelId + '/stories' }); return; }
    if (e.target.closest('[data-more]')) { paused = true; const m = menu(e.target.closest('[data-more]'), `<button data-close data-o="ch">${icon('myvideos')} Go to channel</button><button data-close data-o="rep">${icon('flag')} Report story</button>`, { sheet: false }); m.style.zIndex = 450; m.onclick = ev => { const o = ev.target.closest('[data-o]')?.dataset.o; if (o === 'ch') { const id = ordered[si].channelId; close(); go('#/channel/' + id); } if (o === 'rep') openReport(); }; return; }
    if (e.target.closest('[data-add]')) { close(); openStoryEditor(); return; }
    if (e.target.closest('[data-del]')) { paused = true; if (await confirmDialog('Delete story', 'Delete this story slide?')) { const s = DB.stories.find(x => x.channelId === 'me'); s.slides = s.slides.filter(x => x.id !== sl.id); if (!s.slides.length) DB.stories = DB.stories.filter(x => x !== s); saveDB(); close(); toast('Story deleted'); } else paused = false; return; }
    if (e.target.closest('[data-mute]')) toast('Stories have no sound in this demo');
  });
  root.addEventListener('focusin', e => { if (e.target.matches('[data-reply]')) paused = true; });
  root.addEventListener('focusout', e => { if (e.target.matches('[data-reply]')) paused = false; });
  root.addEventListener('keydown', e => { if (e.target.matches('[data-reply]') && e.key === 'Enter' && e.target.value.trim()) { e.target.value = ''; e.target.blur(); toast('Reply sent to ' + ch(ordered[si].channelId).name); } });
  // hold to pause (mobile)
  root.addEventListener('pointerdown', e => { if (e.target.closest('.tapzone')) { root._hold = setTimeout(() => { paused = true; root._held = true; }, 250); } });
  root.addEventListener('pointerup', () => { clearTimeout(root._hold); if (root._held) { root._held = false; setTimeout(() => paused = false, 0); } });
  let sx = 0; root.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) { elapsed = 0; if (dx < 0 && si < ordered.length - 1) { si++; ii = 0; render(); } else if (dx > 0 && si > 0) { si--; ii = 0; render(); } } });
  const onKey = e => { if (e.target.matches && e.target.matches('input')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') advance(1); if (e.key === 'ArrowLeft') advance(-1); if (e.key === ' ') { e.preventDefault(); paused = !paused; } };
  document.addEventListener('keydown', onKey);
  render(); raf = requestAnimationFrame(tick);
}
