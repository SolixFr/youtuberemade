/* Vidora — router, boot, global shortcuts. */
let currentRoute = { parts: [], params: new URLSearchParams() };

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs || '') };
}
function rerender() { route(true); }
async function route(keepScroll) {
  const prev = currentRoute.parts[0];
  currentRoute = parseRoute(); const [p, a, b] = currentRoute.parts;
  closeMenu(); document.body.classList.remove('msearch', 'drawer-open');
  if (prev === 'shorts') cleanupShorts();
  if (prev === 'studio' && !(p === 'studio' && a === 'live')) cleanupLive();
  if (p !== 'watch') {
    document.body.classList.remove('theater');
    if (currentPlayer) { // leaving watch page while playing → miniplayer (desktop/mobile), like a modern video app
      const cp = currentPlayer; currentPlayer = null;
      if (!cp.src.paused && p !== 'shorts' && !keepScroll) { const t = cp.src.currentTime; const v = cp.v; cp.destroy(); openMini(v, t); }
      else cp.destroy();
    }
  }
  if (p === 'shorts' && miniPlayer) closeMini();
  document.body.classList.toggle('shorts-active', p === 'shorts');
  applyGuideMode(); renderGuide(); renderBottomNav();
  document.title = 'Vidora';
  const y = scrollY;
  switch (p) {
    case undefined: pageHome(); break;
    case 'watch': await pageWatch(a, currentRoute.params); break;
    case 'shorts': pageShorts(a); break;
    case 'subscriptions': pageSubscriptions(); break;
    case 'channels': pageChannels(); break;
    case 'channel': pageChannel(a, b || 'home'); break;
    case 'results': pageResults(currentRoute.params); break;
    case 'history': pageHistory(); break;
    case 'playlist': pagePlaylist(a); break;
    case 'playlists': pagePlaylists(); break;
    case 'you': pageYou(); break;
    case 'feed': pageFeed(a); break;
    case 'post': pagePost(a); break;
    case 'studio': pageStudio(a || 'dashboard', b); break;
    case 'settings': pageSettings(); break;
    case 'help': pageHelp(); break;
    case 'story': openStoryViewer(a); pageHome(); break;
    default: pageNotFound();
  }
  const si = $('#search-input'); if (si) si.value = p === 'results' ? currentRoute.params.get('q') || '' : '';
  if (keepScroll) scrollTo(0, y); else scrollTo(0, 0);
}

function boot() {
  loadDB(); setTheme(DB.user.theme);
  // warm blob URLs for uploaded media + thumbs
  DB.videos.filter(v => v.mediaKey).forEach(v => MediaStore.url(v.mediaKey));
  renderMasthead(); route();
}

window.addEventListener('hashchange', () => route());
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const wasMobile = document.body.dataset.mobile === '1'; const nowMobile = isMobile(); document.body.dataset.mobile = nowMobile ? '1' : '0'; applyGuideMode(); if (wasMobile !== nowMobile && currentRoute.parts[0] !== 'watch' && currentRoute.parts[0] !== 'shorts') rerender(); }, 150); });
$('#scrim').onclick = () => document.body.classList.remove('drawer-open');

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); if (isMobile()) $('#msearch-btn').click(); else $('#search-input').focus(); return; }
  if (e.key === '?') { openShortcuts(); return; }
  if (e.key === 'Escape') { closeMenu(); const mb = $$('.modal-back').pop(); if (mb) { mb.remove(); if (!$('#overlay-root').children.length) document.body.classList.remove('no-scroll'); } return; }
  const p = currentPlayer || miniPlayer; if (!p || $('.story-viewer')) return;
  const k = e.key.toLowerCase();
  if (k === 'k' || k === ' ') { e.preventDefault(); p.toggle(); }
  else if (k === 'j') p.seekBy(-10); else if (k === 'l') p.seekBy(10);
  else if (e.key === 'ArrowLeft') { e.preventDefault(); p.seekBy(-5); } else if (e.key === 'ArrowRight') { e.preventDefault(); p.seekBy(5); }
  else if (k === 'm') p.mute(); else if (k === 'f') p.fullscreen(); else if (k === 'c') p.captions();
  else if (k === 't' && currentPlayer) document.body.classList.toggle('theater');
  else if (k === 'i' && currentPlayer) p.root.querySelector('.p-minibtn').click();
  else if (e.key === 'N') p.root.querySelector('.p-next').click();
  else if (/^[0-9]$/.test(e.key) && isFinite(p.src.duration)) p.seek(p.src.duration * (+e.key / 10));
});

document.body.dataset.mobile = isMobile() ? '1' : '0';
boot();
