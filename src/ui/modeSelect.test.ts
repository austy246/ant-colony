// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showModeSelect } from './modeSelect';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('showModeSelect', () => {
  it("resolves 'normal' after clicking Normal and removes itself", async () => {
    const p = showModeSelect(root);
    const btns = Array.from(root.querySelectorAll('button'));
    expect(btns.map((b) => b.textContent)).toEqual(['Sandbox', 'Normal']);
    expect(root.querySelector('.mode-select')).not.toBeNull();
    expect(root.querySelectorAll('.mode-desc')).toHaveLength(2);
    btns[1].click();
    await expect(p).resolves.toBe('normal');
    expect(root.querySelector('.mode-select')).toBeNull();
  });

  it("resolves 'sandbox' after clicking Sandbox", async () => {
    const p = showModeSelect(root);
    root.querySelectorAll('button')[0].click();
    await expect(p).resolves.toBe('sandbox');
    expect(root.querySelector('.mode-select')).toBeNull();
  });
});
