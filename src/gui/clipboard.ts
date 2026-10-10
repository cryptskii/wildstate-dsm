/**
 * Copies text for the player to take elsewhere: the clipboard where the page may use it, else the
 * old select-and-copy some WebViews still need. Whether it was copied.
 */
function copyBySelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  return ok;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return copyBySelection(text);
  } catch {
    return copyBySelection(text);
  }
}
