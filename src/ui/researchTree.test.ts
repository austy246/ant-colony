// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { RESEARCH_NODES } from '../sim/constants';
import { World } from '../sim/world';
import { openResearchTree, researchLayout, TREE_RADIUS } from './researchTree';

describe('research tree layout', () => {
  it('places every node inside the picture, round nodes never touching each other or the nest', () => {
    const placed = researchLayout();
    expect(placed).toHaveLength(RESEARCH_NODES.length);
    for (const p of placed) {
      expect(Math.hypot(p.x, p.y)).toBeLessThan(TREE_RADIUS);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(70); // clear of the nest circle
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)).toBeGreaterThan(62);
      }
    }
  });

  it('every node hangs from an existing node of its own arm, and the first node of an arm from the nest', () => {
    const ids = new Set(RESEARCH_NODES.map((n) => n.id));
    for (const n of RESEARCH_NODES) {
      if (n.req === null) expect(n.pos).toBe(0);
      else {
        expect(ids.has(n.req)).toBe(true);
        expect(RESEARCH_NODES.find((q) => q.id === n.req)!.arm).toBe(n.arm);
      }
    }
  });
});

describe('openResearchTree', () => {
  it('opens an overlay with a close button and Escape closes it', () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const root = document.getElementById('ui')!;
    const w = World.create(1, 'sandbox');
    const close = openResearchTree(root, w);
    expect(root.querySelector('.research-tree')).not.toBeNull();
    expect(root.querySelector('.research-head span')?.textContent).toContain('Výzkum');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.research-tree')).toBeNull();
    close(); // closing twice is harmless
  });
});
