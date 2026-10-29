import { describe, expect, it } from 'vitest';
import { createViewController } from './viewController';

function setup() {
  const log: string[] = [];
  const vc = createViewController({
    setSurfaceView: (v) => log.push(`surface:${v}`),
    attachInput: () => log.push('attach'),
    detachInput: () => log.push('detach'),
    enterUnderground: () => log.push('enter'),
    leaveUnderground: () => log.push('leave'),
  });
  return { log, vc };
}

describe('createViewController', () => {
  it('starts on the surface', () => {
    expect(setup().vc.isUnderground()).toBe(false);
  });

  it('surface views only switch the renderer view (input stays attached)', () => {
    const { log, vc } = setup();
    vc.setView('pheromone');
    vc.setView('terrain');
    vc.setView('normal');
    expect(log).toEqual(['surface:pheromone', 'surface:terrain', 'surface:normal']);
  });

  it('going underground detaches the input first and then shows the nest', () => {
    const { log, vc } = setup();
    vc.setView('underground');
    expect(log).toEqual(['detach', 'enter']);
    expect(vc.isUnderground()).toBe(true);
  });

  it('is idempotent: pressing the underground button again does nothing', () => {
    const { log, vc } = setup();
    vc.setView('underground');
    vc.setView('underground');
    expect(log).toEqual(['detach', 'enter']);
  });

  it('leaving to any surface view hides the nest, re-attaches the input and restores that view', () => {
    for (const v of ['normal', 'pheromone', 'terrain'] as const) {
      const { log, vc } = setup();
      vc.setView('underground');
      log.length = 0;
      vc.setView(v);
      expect(log).toEqual(['leave', 'attach', `surface:${v}`]);
      expect(vc.isUnderground()).toBe(false);
    }
  });

  it('never attaches twice or detaches twice over many switches', () => {
    const { log, vc } = setup();
    for (const v of ['underground', 'underground', 'normal', 'normal', 'underground', 'terrain', 'underground', 'pheromone'] as const) vc.setView(v);
    const io = log.filter((l) => l === 'attach' || l === 'detach');
    expect(io).toEqual(['detach', 'attach', 'detach', 'attach', 'detach', 'attach']);
  });
});
