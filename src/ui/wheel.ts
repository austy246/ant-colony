/**
 * The wheel of fortune: every WHEEL_EVERY ants born charge one spin. The window shows a wheel whose slices are the chances of the
 * twelve rarities (flattened in favour of the rare ones); "Roztočit" spins it, it slows down on the rarity drawn and the new ant's card appears.
 */
import { RARITY_NAMES, wheelChances } from '../sim/collection';
import type { World } from '../sim/world';
import { cardElement, RARITY_COLORS, type Card } from './antCards';
import { sound } from '../audio/sound';

export const SPIN_MS = 4200;

/** Angles (radians, 0 = pointing up, clockwise) of the start and end of each slice. */
export function sliceAngles(): { from: number; to: number }[] {
  let a = 0;
  return wheelChances().map((c) => {
    const o = { from: a, to: a + c * Math.PI * 2 };
    a = o.to;
    return o;
  });
}

function drawWheel(cv: HTMLCanvasElement, rotation: number): void {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = cv.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return;
  const r = cv.width / 2;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(rotation);
  sliceAngles().forEach((s, i) => {
    ctx!.beginPath();
    ctx!.moveTo(0, 0);
    ctx!.arc(0, 0, r - 8, s.from - Math.PI / 2, s.to - Math.PI / 2);
    ctx!.closePath();
    ctx!.fillStyle = RARITY_COLORS[i];
    ctx!.fill();
    ctx!.strokeStyle = '#1a120b';
    ctx!.lineWidth = 2;
    ctx!.stroke();
  });
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2016';
  ctx.fill();
  ctx.restore();
  // the pointer at the top
  ctx.beginPath();
  ctx.moveTo(r - 12, 0);
  ctx.lineTo(r + 12, 0);
  ctx.lineTo(r, 26);
  ctx.closePath();
  ctx.fillStyle = '#f3e6c4';
  ctx.fill();
  ctx.strokeStyle = '#1a120b';
  ctx.lineWidth = 2;
  ctx.stroke();
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
  const cv = document.createElement('canvas');
  cv.width = 300;
  cv.height = 300;
  cv.className = 'wheel-canvas';
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
  win.append(title, cv, result, buttons);

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
  drawWheel(cv, 0);

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
    // the slice of the drawn rarity ends under the pointer at the top: its middle at angle 0
    const s = sliceAngles()[out.rarity];
    const mid = (s.from + s.to) / 2;
    const target = Math.PI * 2 * 5 - mid;
    const finish = (): void => {
      drawWheel(cv, target);
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
      const ease = 1 - Math.pow(1 - k, 3);
      drawWheel(cv, target * ease);
      if (k < 1) raf = requestAnimationFrame(step);
      else finish();
    };
    raf = requestAnimationFrame(step);
  });
  return shut;
}
