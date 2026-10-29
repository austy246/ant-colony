// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSave, loadGame, saveGame } from './save';
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

  async function putIdb(value: unknown): Promise<void> {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('ant-colony', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('saves');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(value, 'current');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }

  it('invalid-base64 and wrong-length pheromone make loadGame return null', async () => {
    localStorage.setItem(KEY, JSON.stringify({ ...sample(), pheromone: '%%%' }));
    expect(await loadGame()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ ...sample(), pheromone: btoa('abc') }));
    expect(await loadGame()).toBeNull();
  });

  it('invalid localStorage entry falls through to a valid IndexedDB save', async () => {
    const s = sample();
    await putIdb(s);
    localStorage.setItem(KEY, JSON.stringify({ ...s, version: 2 }));
    expect(await loadGame()).toEqual(s);
    localStorage.setItem(KEY, '{broken');
    expect(await loadGame()).toEqual(s);
  });

  it('corrupt IndexedDB value returns null', async () => {
    await putIdb({ version: 1, junk: true });
    expect(await loadGame()).toBeNull();
    await putIdb('garbage');
    expect(await loadGame()).toBeNull();
  });

  it('a save that fails to restore is rejected by the final guard', async () => {
    const s = sample();
    const mod = await import('./sim/serialize');
    vi.spyOn(mod, 'worldFromSave').mockImplementation(() => {
      throw new Error('boom');
    });
    localStorage.setItem(KEY, JSON.stringify(s));
    expect(await loadGame()).toBeNull();
  });

  it('does not touch IndexedDB on localStorage saves when it was never used', async () => {
    // fresh module state so idbInUse is false
    vi.resetModules();
    const fresh = await import('./save');
    const spy = vi.spyOn(indexedDB, 'open');
    await fresh.saveGame(sample());
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('loadGame timeout', () => {
  it('resolves null after 1500 ms when the IndexedDB read never settles', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(indexedDB, 'open').mockImplementation(() => ({}) as IDBOpenDBRequest);
      let result: SaveV1 | null | undefined;
      void loadGame().then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(1400);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(200);
      expect(result).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('clearSave', () => {
  it('removes the localStorage entry', async () => {
    await saveGame(sample());
    await clearSave();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await loadGame()).toBeNull();
  });

  it('removes the IndexedDB entry too', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    await saveGame(sample());
    vi.restoreAllMocks();
    expect(await loadGame()).not.toBeNull();
    await clearSave();
    expect(await loadGame()).toBeNull();
  });

  it('resolves when storage and IndexedDB both throw', async () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('idb unavailable');
    });
    await expect(clearSave()).resolves.toBeUndefined();
  });
});
