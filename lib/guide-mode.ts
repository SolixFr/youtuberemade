export type GuideMode = 'full' | 'mini' | 'drawer' | 'none';

/**
 * Which sidebar the shell renders for a route and viewport width.
 * `collapsed` is the user's hamburger toggle: full ↔ mini on regular pages.
 * Watch/Studio/Messages use the overlay drawer regardless; Shorts stays icon-only;
 * phones get no sidebar at all.
 */
export function computeGuideMode(path: string, width: number, collapsed: boolean): GuideMode {
  if (width < 792) return 'none';
  if (path.startsWith('/watch') || path.startsWith('/studio') || path.startsWith('/messages')) return 'drawer';
  if (path.startsWith('/shorts')) return width >= 1312 ? 'mini' : 'drawer';
  return width >= 1312 ? (collapsed ? 'mini' : 'full') : 'mini';
}
