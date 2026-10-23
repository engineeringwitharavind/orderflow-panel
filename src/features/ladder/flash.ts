const reducedMotion =
  typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');

export const FLASH_MS = 180;

/**
 * Flash an overlay whose colour comes from CSS, by animating only its opacity
 * (Web Animations API). No class toggling, no React state, no layout, and the
 * colour follows the theme. Off under prefers-reduced-motion.
 */
export function flash(overlay: HTMLElement | null) {
  if (!overlay || reducedMotion?.matches || typeof overlay.animate !== 'function') return;
  overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH_MS, easing: 'ease-out' });
}
