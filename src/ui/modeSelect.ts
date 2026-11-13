import { parseSeed } from '../records';
import type { GameMode } from '../sim/world';

const CHOICES: { mode: GameMode; label: string; desc: string }[] = [
  { mode: 'sandbox', label: 'Sandbox', desc: 'Sám přidáváš kořist a hraješ si.' },
  { mode: 'normal', label: 'Normal', desc: 'Jen pozoruješ, kolonie může zahynout.' },
];

/** Modal asking which mode to play; resolves with the choice and removes itself. */
export function showModeSelect(root: HTMLElement, seedOut?: { seed: number | null }): Promise<GameMode> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'mode-select';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mode-title');
    const box = document.createElement('div');
    box.className = 'mode-box';
    const title = document.createElement('div');
    title.className = 'mode-title';
    title.id = 'mode-title';
    title.textContent = 'Vyber režim hry';
    box.appendChild(title);
    const seedInput = document.createElement('input');
    seedInput.type = 'text';
    seedInput.className = 'seed-input';
    seedInput.placeholder = 'Seed mapy (prázdné = náhodný)';
    seedInput.setAttribute('aria-label', 'Seed mapy');
    seedInput.maxLength = 24;
    box.appendChild(seedInput);
    for (const c of CHOICES) {
      const item = document.createElement('div');
      item.className = 'mode-item';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      b.addEventListener('click', () => {
        if (seedOut) seedOut.seed = parseSeed(seedInput.value);
        overlay.remove();
        resolve(c.mode);
      });
      const d = document.createElement('div');
      d.className = 'mode-desc';
      d.textContent = c.desc;
      item.append(b, d);
      box.appendChild(item);
    }
    overlay.appendChild(box);
    root.appendChild(overlay);
    overlay.querySelector('button')?.focus();
  });
}
