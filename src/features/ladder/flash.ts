const reducedMotion =
  typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');

export const FLASH_MS = 180;
/** A change smaller than this share of the largest visible size is routine; the number and bar already show it. */
export const SIGNIFICANT_SHARE = 0.25;
/** A busy level flashes at most once per this window. */
export const COOLDOWN_MS = 1000;

/**
 * Only large orders arriving (stacking) or leaving (pulling) are worth a flash.
 * Everything else updates silently, which is what keeps a live book calm.
 */
export function isSignificant(prev: number, next: number, maxSize: number): boolean {
  if (maxSize <= 0) return false;
  return Math.abs(next - prev) >= SIGNIFICANT_SHARE * maxSize;
}

/**
 * Flash a thin edge marker whose colour comes from CSS, by animating only its
 * opacity (Web Animations API). No React state, no layout, theme-aware.
 * Off under prefers-reduced-motion.
 */
export function flash(marker: HTMLElement | null, direction: 'up' | 'down') {
  if (!marker || reducedMotion?.matches || typeof marker.animate !== 'function') return;
  marker.dataset.dir = direction;
  marker.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH_MS, easing: 'ease-out' });
}
