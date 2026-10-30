// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleExtinction, showExtinct } from './extinct';

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
