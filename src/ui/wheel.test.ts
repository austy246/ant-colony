// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { buildStrip, openWheel, STRIP_LEN, WIN_INDEX } from './wheel';

let root: HTMLElement;
let world: World;
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>';
  root = document.getElementById('ui')!;
  world = World.create(4, 'normal');
  world.noSpider = true;
  world.noRaid = true;
  world.addAnts(30);
});

const btn = (t: string): HTMLButtonElement => Array.from(root.querySelectorAll('.wheel-window button')).find((b) => b.textContent === t) as HTMLButtonElement;

describe('wheel window', () => {
  it('the row of cards has the drawn rarity at the winning place', () => {
    for (let r = 0; r < 12; r++) {
      const row = buildStrip(r, () => 0.5);
      expect(row).toHaveLength(STRIP_LEN);
      expect(row[WIN_INDEX]).toBe(r);
    }
  });

  it('shows the ants side by side and the drawn one sits at the winning place', () => {
    openWheel(root, world, { instant: true });
    expect(root.querySelectorAll('.wheel-strip .ac-card')).toHaveLength(STRIP_LEN);
    btn('Roztočit').click();
    const cards = root.querySelectorAll<HTMLElement>('.wheel-strip .ac-card');
    expect(cards).toHaveLength(STRIP_LEN);
    const shown = root.querySelector<HTMLElement>('.wheel-result .ac-card')!;
    expect(cards[WIN_INDEX].dataset.rarity).toBe(shown.dataset.rarity);
  });

  it('spins, shows the card of the wheel-born ant and uses up one waiting spin, adding no ant', () => {
    expect(world.wheels).toBe(3);
    openWheel(root, world, { instant: true });
    expect(root.querySelector('.ac-title')?.textContent).toContain('3');
    btn('Roztočit').click();
    expect(world.wheels).toBe(2);
    expect(world.ants).toHaveLength(30);
    expect(root.querySelector('.wheel-result .ac-card')).not.toBeNull();
    expect(root.querySelector('.wheel-note')?.textContent).toContain(`#${world.ants[9].id}`); // the 10th ant
  });

  it('cannot be spun with nothing charged, and closes', () => {
    world.wheelQueue.length = 0;
    openWheel(root, world, { instant: true });
    expect(btn('Roztočit').disabled).toBe(true);
    btn('Zavřít').click();
    expect(root.querySelector('.wheel-overlay')).toBeNull();
  });
});
