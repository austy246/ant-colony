// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { showChangelog, UPDATES } from './changelog';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="ui"></div>';
  root = document.getElementById('ui')!;
});

describe('changelog', () => {
  it('lists every update, newest first', () => {
    expect(UPDATES.length).toBeGreaterThan(3);
    for (const u of UPDATES) expect(u.items.length).toBeGreaterThan(0);
    showChangelog(root);
    expect(root.querySelectorAll('.changelog-date')).toHaveLength(UPDATES.length);
    expect(root.querySelectorAll('.changelog li').length).toBe(UPDATES.reduce((n, u) => n + u.items.length, 0));
  });

  it('opens once, and closes with the button or Escape', () => {
    showChangelog(root);
    showChangelog(root);
    expect(root.querySelectorAll('.changelog')).toHaveLength(1);
    (root.querySelector('.changelog button') as HTMLButtonElement).click();
    expect(root.querySelector('.changelog')).toBeNull();
    showChangelog(root);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.changelog')).toBeNull();
  });
});
