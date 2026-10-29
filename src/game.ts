import { Intro } from './intro';
import { Renderer } from './render/renderer';
import { clearSave, loadGame, saveGame } from './save';
import { NEST, SCALE } from './sim/constants';
import { worldFromSave, worldToSave } from './sim/serialize';
import { World } from './sim/world';
import { Camera, easeCameraTo, type CameraPose } from './ui/camera';
import { Input, type Tool } from './ui/input';
import { buildToolbar } from './ui/toolbar';

const AUTOSAVE_MS = 10_000;
const HUD_MS = 250;
const MAX_DT = 0.25;
const SETTLE_S = 1;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export async function startGame(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  const save = await loadGame();
  const world = save ? worldFromSave(save) : World.create(Date.now() >>> 0);
  let introDone = save !== null;
  const intro = introDone ? null : new Intro();

  const viewSize = (): { w: number; h: number } => ({
    w: Math.max(1, canvas.clientWidth || window.innerWidth || 1),
    h: Math.max(1, canvas.clientHeight || window.innerHeight || 1),
  });
  const v0 = viewSize();
  const camera = new Camera(v0.w, v0.h);
  const renderer = new Renderer(canvas, world, camera);
  if (save) {
    camera.x = save.camera.x;
    camera.y = save.camera.y;
    camera.zoom = save.camera.zoom;
    camera.clamp();
  } else {
    camera.fitWorld();
  }

  // --- UI ---
  let tool: Tool = { kind: 'pan' };
  const input = new Input(canvas, camera, world, () => tool);

  const hud = el('div', 'hud', '', ui);
  const panel = el('div', 'panel', '', ui);
  const newGameBtn = el('button', '', 'Nová hra', panel);
  newGameBtn.type = 'button';
  let skipBtn: HTMLButtonElement | null = null;

  const updateHud = (): void => {
    hud.textContent = `Mravenci: ${world.ants.length} · Zásoba: ${world.stock.toFixed(1)}`;
  };

  // --- saving ---
  let saving = false;
  let pendingSave = false;
  let resetting = false;
  let inFlight: Promise<void> = Promise.resolve();
  /** Never rejects. A save requested while one is running is remembered and run once more afterwards. */
  const autosave = (): Promise<void> => {
    if (!introDone || resetting) return Promise.resolve();
    if (saving) {
      pendingSave = true;
      return inFlight;
    }
    saving = true;
    inFlight = (async () => {
      try {
        await saveGame(
          worldToSave(world, { introDone, camera: { x: camera.x, y: camera.y, zoom: camera.zoom } }),
        );
      } catch (err) {
        console.warn('Autosave failed', err);
      } finally {
        saving = false;
        if (pendingSave) {
          pendingSave = false;
          void autosave();
        }
      }
    })();
    return inFlight;
  };

  /** After the intro the camera eases to the default zoom (SCALE) centred on the nest. */
  let settle: { from: CameraPose; to: CameraPose; t: number } | null = null;
  const cancelSettle = (): void => {
    settle = null;
  };
  canvas.addEventListener('wheel', cancelSettle, { passive: true });
  canvas.addEventListener('pointerdown', cancelSettle);

  const finishIntro = (): void => {
    introDone = true;
    skipBtn?.remove();
    skipBtn = null;
    input.attach();
    buildToolbar(
      ui,
      (t) => (tool = t),
      (v) => renderer.setView(v),
    );
    renderer.setQueen(null);
    settle = {
      from: { x: camera.x, y: camera.y, zoom: camera.zoom },
      to: { x: NEST.x, y: NEST.y, zoom: SCALE },
      t: 0,
    };
    hud.hidden = false;
    panel.hidden = false;
    updateHud();
    void autosave();
  };

  if (intro) {
    hud.hidden = true;
    panel.hidden = true;
    skipBtn = el('button', 'skip', 'Přeskočit', ui);
    skipBtn.type = 'button';
    skipBtn.addEventListener('click', () => intro.skip());
  } else {
    input.attach();
    buildToolbar(
      ui,
      (t) => (tool = t),
      (v) => renderer.setView(v),
    );
    updateHud();
  }

  newGameBtn.addEventListener('click', () => {
    if (!window.confirm('Opravdu začít novou hru? Uložený postup se smaže.')) return;
    resetting = true;
    // Wait for any in-flight save so it cannot write the old game back after clearSave().
    void inFlight.then(() => clearSave()).then(() => location.reload());
  });

  // --- events ---
  let last = performance.now();
  const resetClock = (): void => {
    last = performance.now();
  };
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave();
    else resetClock();
  });
  window.addEventListener('pagehide', () => {
    void autosave();
    resetClock();
  });
  setInterval(() => void autosave(), AUTOSAVE_MS);

  // --- loop ---
  let hudAcc = 0;
  const step = (now: number): void => {
    const dt = Math.max(0, Math.min((now - last) / 1000, MAX_DT));
    last = now;
    if (intro && !introDone) {
      intro.update(dt);
      const v = viewSize();
      const c = intro.cameraAt(v.w, v.h);
      camera.x = c.x;
      camera.y = c.y;
      camera.zoom = c.zoom;
      camera.clamp();
      renderer.setQueen(intro.queen());
      if (intro.consumeSpawn()) world.spawnAnt();
    }
    world.step(dt);
    if (intro && !introDone && intro.done) finishIntro();
    if (settle) {
      settle.t += dt;
      const p = easeCameraTo(settle.from, settle.to, settle.t / SETTLE_S);
      camera.x = p.x;
      camera.y = p.y;
      camera.zoom = p.zoom;
      camera.clamp();
      if (settle.t >= SETTLE_S) settle = null;
    }
    renderer.draw();
    hudAcc += dt;
    if (hudAcc >= HUD_MS / 1000) {
      hudAcc = 0;
      if (introDone) updateHud();
    }
  };
  const frame = (now: number): void => {
    // Schedule first so one exception can never freeze the loop.
    requestAnimationFrame(frame);
    try {
      step(now);
    } catch (err) {
      console.error('Frame failed', err);
    }
  };
  requestAnimationFrame(frame);
}
