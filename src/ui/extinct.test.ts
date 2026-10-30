// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleExtinction, restoreLiveSave, showExtinct } from './extinct';
import { worldFromSave, worldToSave } from '../sim/serialize';
import { World } from '../sim/world';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('showExtinct', () => {
  it('renders the message and calls onNewGame on click', () => {
    const onNewGame = vi.fn();
    showExtinct(root, onNewGame);
    expect(root.textContent).toContain('Kolonie zanikla');
    const overlay = root.querySelector('.mode-select') as HTMLElement;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    const btn = root.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toBe('Nová hra');
    expect(document.activeElement).toBe(btn);
    btn.click();
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it('cleanup removes the overlay', () => {
    const remove = showExtinct(root, () => {});
    expect(root.querySelector('.mode-select')).not.toBeNull();
    remove();
    expect(root.querySelector('.mode-select')).toBeNull();
  });
});

describe('handleExtinction', () => {
  it('waits for the in-flight save, clears the save, then shows the overlay', async () => {
    const order: string[] = [];
    let release!: () => void;
    const inFlight = new Promise<void>((r) => (release = r));
    const done = handleExtinction({
      inFlight: () => inFlight.then(() => void order.push('saved')),
      clear: async () => void order.push('clear'),
      show: () => void order.push('show'),
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await done;
    expect(order).toEqual(['saved', 'clear', 'show']);
  });

  it('still shows the overlay when clearing fails', async () => {
    const show = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await handleExtinction({
      inFlight: () => Promise.resolve(),
      clear: () => Promise.reject(new Error('x')),
      show,
    });
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('restoreLiveSave', () => {
  const EXTRA = { introDone: true, camera: { x: 10, y: 20, zoom: 2 } };
  const deadColony = (): World => {
    const w = World.create(1, 'normal');
    w.spawnAnt();
    w.ants.length = 0;
    w.stock = 0;
    return w;
  };

  it('no save -> null', () => {
    expect(restoreLiveSave(null, worldFromSave)).toBeNull();
  });

  it('a living colony is restored', () => {
    const w = World.create(1, 'normal');
    w.spawnAnt();
    const r = restoreLiveSave(worldToSave(w, EXTRA), worldFromSave);
    expect(r?.world.ants.length).toBe(1);
    expect(r?.save.camera.zoom).toBe(2);
  });

  it('an extinct colony (its save could not be cleared) counts as no save, so a new game starts', () => {
    const s = worldToSave(deadColony(), EXTRA);
    expect(worldFromSave(s).extinct).toBe(true);
    expect(restoreLiveSave(s, worldFromSave)).toBeNull();
  });
});
