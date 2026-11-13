import { GUARD_FRACTION_MAX, HATCH_FOCUSES, type HatchFocus } from '../sim/constants';
import type { World } from '../sim/world';

/** Small panel with the colony's division of labour: a slider for the share of ants on guard duty. Returns a remover. */
export function buildWorkPanel(root: HTMLElement, world: World): () => void {
  const box = document.createElement('div');
  box.className = 'work-panel';
  const label = document.createElement('label');
  const text = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(Math.round(GUARD_FRACTION_MAX * 100));
  slider.step = '1';
  slider.setAttribute('aria-label', 'Podíl strážců');
  const show = (): void => {
    text.textContent = `Strážci: ${Math.round(world.guardFraction * 100)} %`;
  };
  slider.value = String(Math.round(world.guardFraction * 100));
  slider.addEventListener('input', () => {
    world.guardFraction = Number(slider.value) / 100;
    show();
  });
  show();
  label.append(text, slider);
  box.appendChild(label);
  const NAMES: Record<HatchFocus, string> = { mix: 'směs', majors: 'majoři', workers: 'dělnice' };
  const hatch = document.createElement('button');
  hatch.type = 'button';
  const showHatch = (): void => {
    hatch.textContent = `Líhne se: ${NAMES[world.hatchFocus]}`;
  };
  hatch.addEventListener('click', () => {
    world.hatchFocus = HATCH_FOCUSES[(HATCH_FOCUSES.indexOf(world.hatchFocus) + 1) % HATCH_FOCUSES.length];
    showHatch();
  });
  showHatch();
  box.appendChild(hatch);
  root.appendChild(box);
  return () => box.remove();
}
