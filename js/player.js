/* Vidora — custom player.
   Uploaded media plays through a real <video>. Seed catalogue items (no media file)
   play through an animated procedural canvas "video" with identical controls. */

const CAPTION_LINES = ['Hey everyone, welcome back to the channel.', 'Today we are trying something a little different.', 'Let me show you how this works.', 'This part is really important, so pay attention.', 'And that is the result — pretty cool, right?', 'Let me know in the comments what you think.', 'If you enjoyed this, you know what to do.'];

class CanvasSource {
  constructor(v) {
    this.v = v; this.duration = v.type === 'live' ? Infinity : v.duration; this.currentTime = 0; this.paused = true;
    this.playbackRate = 1; this.volume = 1; this.muted = false; this.ended = false; this.listeners = {};
    this.el = document.createElement('canvas'); this.el.width = 960; this.el.height = v.type === 'short' ? 1706 : 540;
    if (v.type === 'short') { this.el.width = 540; this.el.height = 960; }
    this.ctx = this.el.getContext('2d'); const r = rng(v.id); this.pal = pick(r, PALETTES); this.blobs = Array.from({ length: 7 }, () => ({ x: r(), y: r(), s: 0.08 + r() * 0.2, vx: (r() - .5) * .08, vy: (r() - .5) * .08, o: .15 + r() * .3 }));
    this.last = 0; this.raf = null; this.draw(0);
    const loop = t => { this.raf = requestAnimationFrame(loop); const dt = this.last ? (t - this.last) / 1000 : 0; this.last = t;
      if (!this.paused) { this.currentTime += dt * this.playbackRate; if (this.currentTime >= this.duration) { this.currentTime = this.duration; this.paused = true; this.ended = true; this.emit('ended'); } this.emit('timeupdate'); }
      this.draw(this.currentTime); };
    this.raf = requestAnimationFrame(loop);
  }
  on(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); }
  emit(e) { (this.listeners[e] || []).forEach(f => f()); }
  play() { if (this.ended) { this.currentTime = 0; this.ended = false; } this.paused = false; this.emit('play'); return Promise.resolve(); }
  pause() { this.paused = true; this.emit('pause'); }
  seek(t) { this.currentTime = Math.max(0, Math.min(this.duration === Infinity ? t : this.duration, t)); this.ended = false; this.emit('timeupdate'); }
  draw(t) {
    const { ctx, el } = this; const W = el.width, H = el.height; const [a, b] = this.pal;
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.blobs.forEach((bl, i) => {
      const x = ((bl.x + bl.vx * t) % 1 + 1) % 1 * W, y = ((bl.y + bl.vy * t) % 1 + 1) % 1 * H, s = bl.s * W * (1 + .15 * Math.sin(t * 1.3 + i));
      ctx.globalAlpha = bl.o; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = this.v.type === 'short' ? 44 : 48; ctx.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
    wrapText(ctx, this.v.title, W / 2, H / 2 - 20, W * 0.82, fs * 1.15);
    ctx.font = '500 22px Roboto, Arial'; ctx.globalAlpha = .85;
    ctx.fillText((ch(this.v.channelId) || {}).name || '', W / 2, H / 2 + (this.v.type === 'short' ? 160 : 90));
    ctx.globalAlpha = 1;
    // waveform / equaliser
    const bars = 32; const bw = W / bars;
    for (let i = 0; i < bars; i++) { const hh = (Math.sin(t * 3 + i * .6) * .5 + .5) * (this.paused ? 4 : 26) + 3; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(i * bw + 2, H - 20 - hh, bw - 4, hh); }
  }
  destroy() { cancelAnimationFrame(this.raf); }
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' '); const lines = []; let line = '';
  words.forEach(w => { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
  lines.push(line); const off = (lines.length - 1) * lh / 2; lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, x, y - off + i * lh));
}

class VideoSource {
  constructor(url, v) {
    this.v = v; this.el = document.createElement('video'); this.el.src = url; this.el.playsInline = true; this.el.preload = 'metadata';
    if (v.type === 'short') this.el.loop = true;
  }
  get duration() { return isFinite(this.el.duration) ? this.el.duration : (this.v.duration || 0); }
  get currentTime() { return this.el.currentTime; }
  get paused() { return this.el.paused; }
  get ended() { return this.el.ended; }
  set playbackRate(r) { this.el.playbackRate = r; } get playbackRate() { return this.el.playbackRate; }
  set volume(x) { this.el.volume = x; } get volume() { return this.el.volume; }
  set muted(m) { this.el.muted = m; } get muted() { return this.el.muted; }
  on(e, f) { this.el.addEventListener(e, f); }
  play() { return this.el.play().catch(() => { this.el.muted = true; return this.el.play().catch(() => {}); }); }
  pause() { this.el.pause(); }
  seek(t) { this.el.currentTime = Math.max(0, Math.min(this.duration, t)); }
  destroy() { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
}

async function makeSource(v) {
  if (v.mediaKey) { const url = await MediaStore.url(v.mediaKey); if (url) return new VideoSource(url, v); }
  return new CanvasSource(v);
}

const PlayerPrefs = { volume: 1, muted: false, captions: false, rate: 1, quality: 'Auto' };

function chaptersOf(v) {
  const out = []; (v.desc || '').split('\n').forEach(l => { const m = l.match(/^(\d+):(\d{2})\s+(.+)$/); if (m) out.push({ t: +m[1] * 60 + +m[2], title: m[3] }); });
  return out.filter(c => c.t < (v.duration || Infinity));
}

/* Full-featured player UI. opts: {autoplay, mini, onEnded, compact} */
async function createPlayer(host, v, opts = {}) {
  const src = await makeSource(v);
  const root = document.createElement('div'); root.className = 'player paused'; root.tabIndex = 0;
  const chapters = chaptersOf(v); const isLive = v.type === 'live';
  root.innerHTML = `
    <div class="p-click"></div>
    <div class="p-captions" hidden></div>
    <div class="p-center"></div>
    <div class="p-skip l">« 10 seconds</div><div class="p-skip r">10 seconds »</div>
    <div class="p-grad"></div>
    <div class="p-controls">
      ${isLive ? '' : `<div class="p-bar"><div class="p-track"><div class="p-buffer"></div><div class="p-fill"></div><div class="p-knob"></div></div><div class="p-hover-time"></div></div>`}
      <div class="p-row">
        <button class="icon-btn p-play" title="Play (k)">${icon('play')}</button>
        <button class="icon-btn p-next hide-m" title="Next (SHIFT+n)">${icon('next')}</button>
        <div class="p-volwrap"><button class="icon-btn p-mute" title="Mute (m)">${icon('volume')}</button><div class="p-vol"><input type="range" min="0" max="1" step="0.05" aria-label="Volume"></div></div>
        ${isLive ? '<span class="p-live">LIVE</span>' : '<span class="p-time">0:00 / 0:00</span>'}
        <span class="p-chapter"></span>
        <span class="p-spacer"></span>
        <button class="icon-btn p-cc" title="Subtitles/closed captions (c)">${icon('cc')}</button>
        <button class="icon-btn p-settings" title="Settings">${icon('settings')}</button>
        <button class="icon-btn p-minibtn hide-m" title="Miniplayer (i)">${icon('mini')}</button>
        <button class="icon-btn p-theater hide-m" title="Theater mode (t)">${icon('theater')}</button>
        <button class="icon-btn p-fs" title="Full screen (f)">${icon('fullscreen')}</button>
      </div>
    </div>`;
  root.insertBefore(src.el, root.firstChild);
  host.innerHTML = ''; host.appendChild(root);
  const $ = s => root.querySelector(s);
  src.volume = PlayerPrefs.volume; src.muted = PlayerPrefs.muted; src.playbackRate = PlayerPrefs.rate;
  $('.p-vol input').value = PlayerPrefs.muted ? 0 : PlayerPrefs.volume;
  if (PlayerPrefs.captions) { $('.p-captions').hidden = false; $('.p-cc').style.borderBottom = '2px solid #f00'; }

  let hideT;
  const showUI = () => { root.classList.add('show-ui'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.remove('show-ui'), 2500); };
  root.addEventListener('mousemove', showUI); root.addEventListener('touchstart', showUI, { passive: true });
  const flash = ic => { const c = $('.p-center'); c.innerHTML = icon(ic); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); };
  const sync = () => {
    root.classList.toggle('paused', src.paused); $('.p-play').innerHTML = icon(src.paused ? 'play' : 'pause');
    $('.p-mute').innerHTML = icon(src.muted || src.volume === 0 ? 'mute' : 'volume');
  };
  const update = () => {
    const t = src.currentTime, d = src.duration;
    if (!isLive) {
      const pct = d ? (t / d) * 100 : 0; $('.p-fill').style.width = pct + '%'; $('.p-knob').style.left = pct + '%'; $('.p-buffer').style.width = Math.min(100, pct + 12) + '%';
      $('.p-time').textContent = `${fmtDur(t)} / ${fmtDur(d)}`;
      const chp = [...chapters].reverse().find(c => c.t <= t); $('.p-chapter').textContent = chp ? '• ' + chp.title + ' ›' : '';
      if (Math.floor(t) % 5 === 0) { DB.user.progress[v.id] = d ? t / d : 0; saveDB(); }
    }
    if (PlayerPrefs.captions) $('.p-captions').textContent = CAPTION_LINES[Math.floor(t / 4) % CAPTION_LINES.length];
  };
  const api = {
    root, src, v,
    toggle() { if (src.paused) { src.play(); flash('play'); } else { src.pause(); flash('pause'); } sync(); },
    play() { src.play(); sync(); }, pause() { src.pause(); sync(); },
    seekBy(s) { src.seek(src.currentTime + s); update(); const el = $(s < 0 ? '.p-skip.l' : '.p-skip.r'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); },
    seek(t) { src.seek(t); update(); },
    mute() { src.muted = !src.muted; PlayerPrefs.muted = src.muted; if (!src.muted && src.volume === 0) src.volume = 1; $('.p-vol input').value = src.muted ? 0 : src.volume; sync(); },
    fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.(); },
    captions() { PlayerPrefs.captions = !PlayerPrefs.captions; $('.p-captions').hidden = !PlayerPrefs.captions; $('.p-cc').style.borderBottom = PlayerPrefs.captions ? '2px solid #f00' : ''; update(); toast(PlayerPrefs.captions ? 'Subtitles: English (auto-generated)' : 'Subtitles off'); },
    destroy() { src.destroy(); root.remove(); },
  };
  src.on('timeupdate', update); src.on('play', sync); src.on('pause', sync); src.on('loadedmetadata', update);
  src.on('ended', () => { sync(); opts.onEnded && opts.onEnded(api); });
  $('.p-click').addEventListener('click', () => api.toggle());
  $('.p-click').addEventListener('dblclick', e => { const r = root.getBoundingClientRect(); const x = e.clientX - r.left; if (matchMedia('(max-width:792px)').matches) api.seekBy(x < r.width / 2 ? -10 : 10); else api.fullscreen(); });
  $('.p-play').onclick = () => api.toggle();
  $('.p-next').onclick = () => opts.onNext && opts.onNext();
  $('.p-mute').onclick = () => api.mute();
  $('.p-vol input').oninput = e => { src.volume = +e.target.value; src.muted = src.volume === 0; PlayerPrefs.volume = src.volume; PlayerPrefs.muted = src.muted; sync(); };
  $('.p-cc').onclick = () => api.captions();
  $('.p-fs').onclick = () => api.fullscreen();
  $('.p-theater').onclick = () => { document.body.classList.toggle('theater'); };
  $('.p-minibtn').onclick = () => opts.onMini && opts.onMini();
  $('.p-settings').onclick = e => {
    e.stopPropagation(); const existing = $('.p-menu'); if (existing) return existing.remove();
    const m = document.createElement('div'); m.className = 'p-menu';
    const render = view => {
      if (view === 'rate') m.innerHTML = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => `<button data-r="${r}">${src.playbackRate === r ? icon('check', 'sm') : '<span style="width:18px"></span>'}${r === 1 ? 'Normal' : r}</button>`).join('');
      else if (view === 'q') m.innerHTML = ['2160p 4K', '1440p', '1080p HD', '720p', '480p', '360p', 'Auto'].map(q => `<button data-q="${q}">${PlayerPrefs.quality === q ? icon('check', 'sm') : '<span style="width:18px"></span>'}${q}</button>`).join('');
      else m.innerHTML = `<button data-v="loop">${icon('loop', 'sm')} Loop<span class="val">${src.el.loop ? 'On' : 'Off'}</span></button><button data-v="cc">${icon('cc', 'sm')} Subtitles/CC<span class="val">${PlayerPrefs.captions ? 'English' : 'Off'}</span></button><button data-v="rate">${icon('clock', 'sm')} Playback speed<span class="val">${src.playbackRate === 1 ? 'Normal' : src.playbackRate}</span></button><button data-v="q">${icon('settings', 'sm')} Quality<span class="val">${PlayerPrefs.quality}</span></button>`;
    };
    render(); root.appendChild(m);
    m.onclick = ev => { ev.stopPropagation(); const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.r) { src.playbackRate = +b.dataset.r; PlayerPrefs.rate = src.playbackRate; m.remove(); }
      else if (b.dataset.q) { PlayerPrefs.quality = b.dataset.q; m.remove(); }
      else if (b.dataset.v === 'loop') { src.el.loop = !src.el.loop; if (src instanceof CanvasSource) src.loop = src.el.loop; render(); }
      else if (b.dataset.v === 'cc') { api.captions(); render(); }
      else render(b.dataset.v); };
    setTimeout(() => document.addEventListener('click', function off() { m.remove(); document.removeEventListener('click', off); }), 0);
  };
  if (!isLive) {
    const bar = $('.p-bar'); const tip = $('.p-hover-time');
    const frac = e => { const r = bar.getBoundingClientRect(); const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; return Math.max(0, Math.min(1, x / r.width)); };
    bar.addEventListener('mousemove', e => { const f = frac(e); tip.style.left = f * 100 + '%'; const t = f * src.duration; const c = [...chapters].reverse().find(c => c.t <= t); tip.innerHTML = (c ? `<div style="font-weight:500">${esc(c.title)}</div>` : '') + fmtDur(t); });
    let drag = false;
    const down = e => { drag = true; api.seek(frac(e) * src.duration); };
    bar.addEventListener('mousedown', down); bar.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('mousemove', e => { if (drag) api.seek(frac(e) * src.duration); });
    window.addEventListener('mouseup', () => { drag = false; });
  }
  // looping for canvas shorts
  if (src instanceof CanvasSource && v.type === 'short') src.on('ended', () => { src.play(); });
  if (src instanceof CanvasSource && v.type !== 'short') src.on('ended', () => { if (src.loop) src.play(); });
  if (DB.user.progress[v.id] && DB.user.progress[v.id] < 0.95 && !isLive && opts.resume !== false) src.seek(DB.user.progress[v.id] * (v.duration || 0));
  sync(); update(); showUI();
  if (opts.autoplay !== false) { src.play(); sync(); }
  return api;
}
