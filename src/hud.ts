import type { World } from './sim/world';

export interface HudParts {
  /** Always shown: "Mravenci: N". */
  before: string;
  /** The smaller second figure " (na povrchu N)"; empty while nobody is in the nest. */
  small: string;
  /** The rest: " · Zásoba: X". */
  after: string;
}

/** The surface HUD in three pieces, so the second figure can be drawn smaller. */
export function hudParts(world: World): HudParts {
  const total = world.ants.length;
  const inNest = Number.isFinite(world.antsInNest) ? world.antsInNest : 0;
  const surface = Number.isFinite(world.antsOnSurface) ? world.antsOnSurface : Math.max(0, total - inNest);
  const stock = Number.isFinite(world.stock) ? world.stock : 0;
  return {
    before: `Mravenci: ${total}`,
    small: inNest > 0 ? ` (na povrchu ${surface})` : '',
    after: ` · Zásoba: ${stock.toFixed(1)}`,
  };
}

/** Text of the surface HUD, e.g. "Mravenci: 12 (na povrchu 5) · Zásoba: 3.3"; the bracket is left out while no ant is underground. */
export function hudText(world: World): string {
  const p = hudParts(world);
  return p.before + p.small + p.after;
}
