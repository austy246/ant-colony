// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { openWheel, sliceAngles } from './wheel';

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
  it('its slices fill the whole circle', () => {
    const s = sliceAngles();
    expect(s).toHaveLength(12);
    expect(s[0].from).toBe(0);
    expect(s[11].to).toBeCloseTo(Math.PI * 2, 9);
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
