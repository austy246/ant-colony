import { GUARD_FRACTION_MAX, HATCH_FOCUSES, type HatchFocus } from '../sim/constants';
import { sound } from '../audio/sound';
import { openResearchTree } from './researchTree';
import { openWheel } from './wheel';
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
    sound.play('tick');
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
  const treeBtn = document.createElement('button');
  treeBtn.type = 'button';
  treeBtn.textContent = 'Výzkum (0 zk.)';
  treeBtn.addEventListener('click', () => openResearchTree(document.getElementById('ui') ?? root, world));
  box.appendChild(treeBtn);
  // unlocked by the 200-ant milestone: sends the idle ants nearest to the red nest against it
  const sortie = document.createElement('button');
  sortie.type = 'button';
  sortie.hidden = true;
  sortie.addEventListener('click', () => {
    if (world.launchSortie() > 0) sound.play('send');
    else sound.play('deny');
  });
  box.appendChild(sortie);
  // every WHEEL_EVERY ants born charge a spin of the wheel of fortune
  const wheelBtn = document.createElement('button');
  wheelBtn.type = 'button';
  wheelBtn.className = 'wheel-btn';
  wheelBtn.hidden = true;
  wheelBtn.addEventListener('click', () => openWheel(document.getElementById('ui') ?? root, world));
  box.appendChild(wheelBtn);
  const info = document.createElement('div');
  info.className = 'work-info';
  box.appendChild(info);
  root.appendChild(box);
  return () => {
    const has = world.milestones.has(200);
    if (sortie.hidden === has) sortie.hidden = !has;
    if (has) {
      const wait = Math.ceil(world.sortieReadyAt - world.time);
      const label = world.redNest?.owner !== 'red' ? 'Výpad (žádný cíl)' : wait > 0 ? `Výpad (${wait} s)` : 'Výpad';
      if (sortie.textContent !== label) sortie.textContent = label;
      const ok = world.canSortie;
      if (sortie.disabled === ok) sortie.disabled = !ok;
    }
    const spins = world.wheels;
    if (wheelBtn.hidden === spins > 0) wheelBtn.hidden = spins <= 0;
    if (spins > 0) {
      const label = `Kolo štěstí (${spins})`;
      if (wheelBtn.textContent !== label) wheelBtn.textContent = label;
    }
    const xpText = `Výzkum (${Math.floor(world.xp)} zk.)`;
    if (treeBtn.textContent !== xpText) treeBtn.textContent = xpText;
    const best = world.mode === 'normal' ? noteBest(world.time) : 0;
    const t = `Čas ${formatTime(world.time)}${best > 0 ? ` · rekord ${formatTime(best)}` : ''}`;
    const text = `${t} · seed ${world.terrain.seed}`;
    if (info.textContent !== text) info.textContent = text;
  };
}
