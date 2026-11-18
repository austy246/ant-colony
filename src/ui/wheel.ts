/**
 * The wheel of fortune: every WHEEL_EVERY ants born charge one spin. The window shows a row of ant cards side by side; "Roztočit" slides the row
 * past a marker, it slows down and stops on the rarity drawn, and the new ant's card appears below.
 */
import { RARITY_NAMES, wheelChances, type CardAnt } from '../sim/collection';
import type { World } from '../sim/world';
import { cardElement, type Card } from './antCards';
import { sound } from '../audio/sound';

export const SPIN_MS = 4200;
export const STRIP_LEN = 56;
export const WIN_INDEX = 46;
const CARD_W = 96;
const GAP = 8;
const PITCH = CARD_W + GAP;
const VIEW_W = 480;

/** One random rarity drawn from the wheel's chances (for the cards that only fill the row; `rand` gives [0, 1)). */
function randomRarity(rand: () => number): number {
  const chances = wheelChances();
  const u = rand();
  let acc = 0;
  for (let i = 0; i < chances.length; i++) {
    acc += chances[i];
    if (u < acc) return i;
  }
  return chances.length - 1;
}

/** The rarities of the cards in the row: random fillers, the drawn rarity at WIN_INDEX. */
export function buildStrip(winRarity: number, rand: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < STRIP_LEN; i++) out.push(i === WIN_INDEX ? winRarity : randomRarity(rand));
  return out;
}

const FILLER: CardAnt = { id: 0, age: 0, speedMul: 1, curiosity: 1, stubbornness: 1 };

function stripCard(rarity: number): HTMLElement {
  const el = cardElement({ ant: FILLER, rarity, stored: false }, false);
  el.classList.add('wheel-item');
  return el;
}

/** Opens the wheel of fortune over `root`; returns a function that closes it (a second call while open does nothing). */
export function openWheel(root: HTMLElement, world: World, opts: { instant?: boolean } = {}): () => void {
  const open = root.querySelector<HTMLElement>('.wheel-overlay');
  if (open) return () => open.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ac-overlay wheel-overlay';
  const win = document.createElement('div');
  win.className = 'ac-window wheel-window';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'Kolo štěstí');
  overlay.appendChild(win);
  root.appendChild(overlay);

  const title = document.createElement('div');
  title.className = 'ac-title';
  const viewport = document.createElement('div');
  viewport.className = 'wheel-viewport';
  const track = document.createElement('div');
  track.className = 'wheel-strip';
  const marker = document.createElement('div');
  marker.className = 'wheel-marker';
  viewport.append(track, marker);
  const result = document.createElement('div');
  result.className = 'wheel-result';
  const buttons = document.createElement('div');
  buttons.className = 'tutorial-buttons';
  const spin = document.createElement('button');
  spin.type = 'button';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Zavřít';
  buttons.append(spin, close);
  win.append(title, viewport, result, buttons);

  let spinning = false;
  let raf = 0;
  const shut = (): void => {
    cancelAnimationFrame(raf);
    overlay.remove();
  };
  close.addEventListener('click', shut);

  const refresh = (): void => {
    title.textContent = `Kolo štěstí (čeká ${world.wheels})`;
    spin.textContent = 'Roztočit';
    spin.disabled = spinning || world.wheels <= 0;
  };
  refresh();

  /** Offset of the row that puts the middle of card `i` under the marker. */
  const centre = (i: number): number => (viewport.clientWidth || VIEW_W) / 2 - (i * PITCH + CARD_W / 2);
  const fill = (rarities: number[]): void => track.replaceChildren(...rarities.map(stripCard));
  const place = (x: number): void => {
    track.style.transform = `translateX(${x}px)`;
  };
  let shown = buildStrip(randomRarity(Math.random));
  fill(shown);
  place(centre(WIN_INDEX));

  spin.addEventListener('click', () => {
    if (spinning) return;
    const out = world.spinWheel();
    if (!out) {
      sound.play('deny');
      result.textContent = 'Žádné roztočení není nabité.';
      return;
    }
    spinning = true;
    result.replaceChildren();
    refresh();
    sound.play('click');
    // a new row starts with the card now under the marker and ends with the drawn rarity under it
    const row = buildStrip(out.rarity);
    row[0] = shown[WIN_INDEX];
    shown = row;
    fill(row);
    // land somewhere inside the winning card, not always on its exact middle
    const target = centre(WIN_INDEX) + (Math.random() - 0.5) * (CARD_W - 20);
    const from = centre(0);
    place(from);
    const finish = (): void => {
      place(target);
      spinning = false;
      const card: Card = { ant: out.ant, rarity: out.rarity, stored: false };
      const el = cardElement(card, true);
      const note = document.createElement('div');
      note.className = 'wheel-note';
      note.textContent = `${RARITY_NAMES[out.rarity]}! Kolo vylosovalo mravence #${out.ant.id}, který se právě narodil.`;
      result.replaceChildren(note, el);
      sound.play(out.rarity >= 7 ? 'milestone' : 'research');
      refresh();
    };
    if (opts.instant) {
      finish();
      return;
    }
    const t0 = performance.now();
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / SPIN_MS);
      const ease = 1 - Math.pow(1 - k, 4);
      place(from + (target - from) * ease);
      if (k < 1) raf = requestAnimationFrame(step);
      else finish();
    };
    raf = requestAnimationFrame(step);
  });
  return shut;
}
