import type { SoundName } from './sound';

/** The few numbers of the game state that make sounds when they change (taken once a frame). */
export interface Snapshot {
  deliveries: number;
  antsKilled: number;
  redKilled: number;
  sprays: number;
  ants: number;
  queens: number;
  raids: number;
  /** A raid is about to start (the HUD counts down). */
  warning: boolean;
  season: number;
  extinct: boolean;
}

/** Which sounds the change from `prev` to `cur` calls for (each at most once; the sound system also rate-limits them). */
export function soundsFor(prev: Snapshot, cur: Snapshot): SoundName[] {
  const out: SoundName[] = [];
  if (cur.deliveries > prev.deliveries) out.push('deliver');
  if (cur.antsKilled > prev.antsKilled) out.push('fight');
  if (cur.redKilled > prev.redKilled) out.push('redkill');
  if (cur.sprays > prev.sprays) out.push('spray');
  if (cur.ants > prev.ants && cur.antsKilled === prev.antsKilled) out.push('hatch');
  if (cur.queens > prev.queens) out.push('queen');
  if (cur.raids > prev.raids) out.push('raid');
  else if (cur.warning && !prev.warning) out.push('warning');
  if (cur.season !== prev.season) out.push('season');
  if (cur.extinct && !prev.extinct) out.push('extinct');
  return out;
}
