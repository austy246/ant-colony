import type { ViewName } from './toolbar';

export type SurfaceView = Exclude<ViewName, 'underground'>;

export interface ViewControllerDeps {
  /** Selects the renderer's view while on the surface. */
  setSurfaceView(v: SurfaceView): void;
  attachInput(): void;
  detachInput(): void;
  /** The underground picture replaces the map (the world keeps simulating). */
  enterUnderground(): void;
  leaveUnderground(): void;
}

export interface ViewController {
  setView(v: ViewName): void;
  isUnderground(): boolean;
}

/**
 * Switches between the surface views and the underground cross-section. The map input (placing prey, panning) is only
 * attached while the map is visible; every transition attaches/detaches exactly once.
 */
export function createViewController(d: ViewControllerDeps): ViewController {
  let under = false;
  return {
    setView(v) {
      if (v === 'underground') {
        if (under) return;
        under = true;
        d.detachInput();
        d.enterUnderground();
        return;
      }
      if (under) {
        under = false;
        d.leaveUnderground();
        d.attachInput();
      }
      d.setSurfaceView(v);
    },
    isUnderground: () => under,
  };
}
