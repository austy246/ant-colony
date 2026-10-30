/** Overlay over the game: the colony died out. Returns a function that removes it. */
export function showExtinct(root: HTMLElement, onNewGame: () => void): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'mode-select';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'extinct-title');
  const box = document.createElement('div');
  box.className = 'mode-box';
  const title = document.createElement('div');
  title.className = 'mode-title';
  title.id = 'extinct-title';
  title.textContent = 'Kolonie zanikla';
  const desc = document.createElement('div');
  desc.className = 'mode-desc';
  desc.textContent = 'Žádní mravenci ani zásoby.';
  const item = document.createElement('div');
  item.className = 'mode-item';
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Nová hra';
  b.addEventListener('click', onNewGame);
  item.appendChild(b);
  box.append(title, desc, item);
  overlay.appendChild(box);
  root.appendChild(overlay);
  b.focus();
  return () => overlay.remove();
}

/**
 * What happens once when the colony dies out: wait for the running save so it cannot write the old game back,
 * delete the save, then show the overlay. Never rejects; the overlay is shown even if clearing fails.
 */
export async function handleExtinction(deps: {
  inFlight: () => Promise<void>;
  clear: () => Promise<void>;
  show: () => void;
}): Promise<void> {
  try {
    await deps.inFlight();
    await deps.clear();
  } catch (err) {
    console.warn('Clearing the save after extinction failed', err);
  }
  deps.show();
}
