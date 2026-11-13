/** Seed typed by the player: digits are the seed itself, any other text is hashed, empty means random (null). */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (/^\d{1,10}$/.test(t)) return Number(t) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const KEY = 'ant-colony-best-';

/** Best survival time (seconds of sim time) of a normal-mode game on this device; 0 when none or storage is unavailable. */
export function loadBest(): number {
  try {
    const v = Number(localStorage.getItem(KEY + 'normal'));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** Remembers `seconds` if it beats the stored record; returns the (possibly new) record. */
export function noteBest(seconds: number): number {
  const best = loadBest();
  if (!(seconds > best)) return best;
  try {
    localStorage.setItem(KEY + 'normal', String(Math.floor(seconds)));
  } catch {
    /* best effort */
  }
  return Math.floor(seconds);
}

/** m:ss (h:mm:ss from an hour). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
