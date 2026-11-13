/**
 * In-page yes/no dialog (the native window.confirm is blocked or ignored in some embedded browsers and installed apps,
 * where it silently answers "no"). Resolves true on yes, false on no / Escape; removes itself.
 */
export function confirmDialog(root: HTMLElement, text: string, yes = 'Ano', no = 'Ne'): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'mode-select';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    const box = document.createElement('div');
    box.className = 'mode-box';
    const title = document.createElement('div');
    title.className = 'mode-title';
    title.textContent = text;
    box.appendChild(title);
    const finish = (v: boolean): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(false);
      }
    };
    for (const [label, v] of [[yes, true], [no, false]] as const) {
      const item = document.createElement('div');
      item.className = 'mode-item';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => finish(v));
      item.appendChild(b);
      box.appendChild(item);
    }
    document.addEventListener('keydown', onKey, true);
    overlay.appendChild(box);
    root.appendChild(overlay);
    overlay.querySelectorAll('button')[1]?.focus(); // default to "no": the safe answer
  });
}
