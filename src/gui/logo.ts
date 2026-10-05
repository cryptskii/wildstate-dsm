/** The Wildstate logo's markup; its look and animation are global styles in index.html. */
export const LOGO_HTML = '<img src="/brand/logo.png" alt="Wildstate, secured by DSM"><i class="ws-shine"></i>'
  + ['s1', 's2', 's3', 's4', 's5'].map((s) => `<i class="ws-star ${s}"></i>`).join('');

/** A logo element, for screens built without Vue. */
export function logo(width: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ws-logo';
  el.style.width = width;
  el.innerHTML = LOGO_HTML;
  return el;
}
