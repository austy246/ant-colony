// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGame, saveGame } from './save';
import { worldToSave, type SaveV1 } from './sim/serialize';
import { World } from './sim/world';

const KEY = 'ant-colony-save';

function sample(): SaveV1 {
  const w = World.create(7);
  for (let i = 0; i < 5; i++) w.spawnAnt();
  w.placeFood('fly', 100, 100);
  w.step(1);
  return worldToSave(w, { introDone: false, camera: { x: 1, y: 2, zoom: 3 } });
}

function quotaError(): Error {
  const e = new Error('full');
  e.name = 'QuotaExceededError';
  return e;
}

async function clearIdb(): Promise<void> {
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase('ant-colony');
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}

beforeEach(async () => {
  localStorage.clear();
  await clearIdb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('save/load', () => {
  it('empty storage returns null', async () => {
    expect(await loadGame()).toBeNull();
  });

  it('saves to localStorage and loads back', async () => {
    const s = sample();
    await saveGame(s);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(await loadGame()).toEqual(s);
  });

  it('invalid JSON returns null', async () => {
    localStorage.setItem(KEY, '{not json');
    expect(await loadGame()).toBeNull();
  });

  it('version 2 returns null', async () => {
    localStorage.setItem(KEY, JSON.stringify({ ...sample(), version: 2 }));
    expect(await loadGame()).toBeNull();
  });

  it('missing ants field returns null', async () => {
    const { ants: _ants, ...rest } = sample();
    localStorage.setItem(KEY, JSON.stringify(rest));
    expect(await loadGame()).toBeNull();
  });

  it('quota exceeded falls back to IndexedDB and loadGame reads it back', async () => {
    const s = sample();
    localStorage.setItem(KEY, 'stale');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    await saveGame(s);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await loadGame()).toEqual(s);
  });

  it('successful localStorage save removes a stale IndexedDB entry', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    await saveGame(sample());
    spy.mockRestore();
    await saveGame({ ...sample(), stock: 99 });
    localStorage.clear();
    expect(await loadGame()).toBeNull();
  });

  it('loadGame returns null when storage access throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(await loadGame()).toBeNull();
  });

  it('saveGame rejects when localStorage and IndexedDB both fail', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('idb unavailable');
    });
    await expect(saveGame(sample())).rejects.toThrow();
  });
});
