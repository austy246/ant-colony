import { validateSave, worldFromSave, type SaveV1 } from './sim/serialize';

const LS_KEY = 'ant-colony-save';
const DB_NAME = 'ant-colony';
const STORE = 'saves';
const IDB_KEY = 'current';

/** Set once IndexedDB holds (or may hold) our save; only then do we bother deleting a stale entry. */
let idbInUse = false;

/** validateSave plus a final guard: the save must actually be restorable. */
function accept(x: unknown): SaveV1 | null {
  const v = validateSave(x);
  if (!v) return null;
  try {
    worldFromSave(v);
  } catch {
    return null;
  }
  return v;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

async function idbRun<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Saves to localStorage; on any failure (quota, SecurityError, ...) falls back to IndexedDB.
 * Rejects only if IndexedDB fails too; the caller decides what to do.
 */
export async function saveGame(s: SaveV1): Promise<void> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded (name, legacy code 22 / Firefox 1014) or storage unavailable: use IndexedDB.
    await idbRun('readwrite', (st) => st.put(s, IDB_KEY));
    idbInUse = true;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
    return;
  }
  // localStorage succeeded: drop any stale IndexedDB copy so it can't shadow later saves (best effort).
  if (!idbInUse) return;
  try {
    await idbRun('readwrite', (st) => st.delete(IDB_KEY));
    idbInUse = false;
  } catch {
    // ignore
  }
}

export async function loadGame(): Promise<SaveV1 | null> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw !== null) {
      const v = accept(JSON.parse(raw));
      if (v) return v;
    }
  } catch {
    // fall through to IndexedDB
  }
  try {
    const raw = await idbRun('readonly', (st) => st.get(IDB_KEY));
    if (raw !== undefined) idbInUse = true;
    return accept(raw);
  } catch {
    return null;
  }
}
