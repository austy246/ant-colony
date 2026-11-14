import { GUARD_FRACTION_MAX, HATCH_FOCUSES, RESEARCH_KEYS, RESEARCH_MAX, RESEARCH_NAMES, type HatchFocus, type ResearchKey } from '../sim/constants';
import { formatTime, noteBest } from '../records';
import type { World } from '../sim/world';

/** Small panel with the colony's division of labour (guards, hatch focus) and the game's seed and survival time. Returns a refresh function. */
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
  const details = document.createElement('details');
  details.className = 'research';
  const summary = document.createElement('summary');
  summary.textContent = 'Výzkum';
  details.appendChild(summary);
  const researchBtns = RESEARCH_KEYS.map((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.addEventListener('click', () => {
      world.buyResearch(key);
      refreshResearch();
    });
    details.appendChild(b);
    return { key, b };
  });
  function refreshResearch(): void {
    for (const { key, b } of researchBtns) {
      const cost = world.researchCost(key as ResearchKey);
      const text = `${RESEARCH_NAMES[key]} ${world.research[key]}/${RESEARCH_MAX}${cost === null ? ' ✓' : ` · ${cost} jídla`}`;
      if (b.textContent !== text) b.textContent = text;
      b.disabled = cost === null || world.stock < cost;
    }
  }
  refreshResearch();
  box.appendChild(details);
  const info = document.createElement('div');
  info.className = 'work-info';
  box.appendChild(info);
  root.appendChild(box);
  return () => {
    refreshResearch();
    const best = world.mode === 'normal' ? noteBest(world.time) : 0;
    const t = `Čas ${formatTime(world.time)}${best > 0 ? ` · rekord ${formatTime(best)}` : ''}`;
    const text = `${t} · seed ${world.terrain.seed}`;
    if (info.textContent !== text) info.textContent = text;
  };
}
