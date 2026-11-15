// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { antRarity } from '../sim/collection';
import { TERRARIUM_MAX } from '../sim/constants';
import { World } from '../sim/world';
import { cardsOf, openAntCollection, PAGE_SIZE } from './antCards';

let root: HTMLElement;
let world: World;
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>';
  root = document.getElementById('ui')!;
  world = World.create(9, 'normal');
  world.noSpider = true;
  world.noRaid = true;
  world.addAnts(60);
});

const btn = (t: string): HTMLButtonElement =>
  Array.from(root.querySelectorAll('.ac-window button')).find((b) => (b.textContent ?? '').startsWith(t)) as HTMLButtonElement;
const rarities = (): number[] => Array.from(root.querySelectorAll<HTMLElement>('.ac-grid .ac-card')).map((c) => Number(c.dataset.rarity));

describe('ant collection window', () => {
  it('shows a page of cards, one per ant, and pages through them', () => {
    openAntCollection(root, world);
    expect(root.querySelectorAll('.ac-grid .ac-card')).toHaveLength(PAGE_SIZE);
    expect(root.querySelector('.ac-page')?.textContent).toBe('Strana 1 / 3');
    btn('›').click();
    expect(root.querySelector('.ac-page')?.textContent).toBe('Strana 2 / 3');
    btn('›').click();
    expect(root.querySelectorAll('.ac-grid .ac-card')).toHaveLength(60 - 2 * PAGE_SIZE);
    expect(btn('›').disabled).toBe(true);
  });

  it('"Nejvzácnější" sorts all ants from the rarest, and a second click undoes it', () => {
    openAntCollection(root, world);
    btn('Nejvzácnější').click();
    const all = cardsOf(world, false, true).map((c) => c.rarity);
    expect(all).toEqual([...all].sort((a, b) => b - a));
    expect(rarities()).toEqual(all.slice(0, PAGE_SIZE));
    expect(all[0]).toBe(Math.max(...world.ants.map((a) => antRarity(world.terrain.seed, a))));
    btn('Nejvzácnější').click();
    expect(cardsOf(world, false, false).map((c) => c.ant.id)).toEqual([...world.ants].map((a) => a.id).sort((a, b) => a - b));
  });

  it('a card opens its detail, Uschovat moves the ant to the terrarium and Vypustit brings it back', () => {
    openAntCollection(root, world);
    const first = cardsOf(world, false, false)[0].ant.id;
    (root.querySelector('.ac-grid .ac-card') as HTMLElement).click();
    expect(root.querySelector('.ac-detail')).not.toBeNull();
    btn('Uschovat').click();
    expect(world.terrarium.map((a) => a.id)).toEqual([first]);
    expect(btn('Kolonie (59)')).toBeTruthy();
    btn('Terárium').click();
    expect(root.querySelectorAll('.ac-grid .ac-card')).toHaveLength(1);
    (root.querySelector('.ac-grid .ac-card') as HTMLElement).click();
    btn('Vypustit').click();
    expect(world.terrarium).toHaveLength(0);
    expect(world.ants.some((a) => a.id === first)).toBe(true);
  });

  it('says so when the terrarium is full', () => {
    world.addAnts(TERRARIUM_MAX + 5);
    for (let i = 0; i < TERRARIUM_MAX; i++) world.storeAnt(world.ants[0].id);
    openAntCollection(root, world);
    (root.querySelector('.ac-grid .ac-card') as HTMLElement).click();
    btn('Uschovat').click();
    expect(root.querySelector('.ac-msg')?.textContent).toContain('plné');
    expect(world.terrarium).toHaveLength(TERRARIUM_MAX);
  });

  it('closes with the button or Escape, and opens only once', () => {
    openAntCollection(root, world);
    openAntCollection(root, world);
    expect(root.querySelectorAll('.ac-overlay')).toHaveLength(1);
    btn('Zavřít').click();
    expect(root.querySelector('.ac-overlay')).toBeNull();
    openAntCollection(root, world);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.ac-overlay')).toBeNull();
  });
});
