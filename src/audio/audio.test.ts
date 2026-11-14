// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { soundsFor, type Snapshot } from './events';
import { Sound } from './sound';

const base: Snapshot = { deliveries: 0, antsKilled: 0, redKilled: 0, sprays: 0, ants: 10, queens: 1, raids: 0, warning: false, season: 0, extinct: false };

describe('soundsFor', () => {
  it('is silent when nothing changed', () => {
    expect(soundsFor(base, { ...base })).toEqual([]);
  });

  it('names a sound for each kind of change', () => {
    expect(soundsFor(base, { ...base, deliveries: 3 })).toEqual(['deliver']);
    expect(soundsFor(base, { ...base, antsKilled: 1, ants: 9 })).toEqual(['fight']);
    expect(soundsFor(base, { ...base, redKilled: 2 })).toEqual(['redkill']);
    expect(soundsFor(base, { ...base, sprays: 1 })).toEqual(['spray']);
    expect(soundsFor(base, { ...base, queens: 2 })).toEqual(['queen']);
    expect(soundsFor(base, { ...base, season: 1 })).toEqual(['season']);
    expect(soundsFor(base, { ...base, extinct: true })).toEqual(['extinct']);
  });

  it('a hatch is a new ant without a death, a raid beats its own warning, the warning sounds once', () => {
    expect(soundsFor(base, { ...base, ants: 11 })).toEqual(['hatch']);
    expect(soundsFor(base, { ...base, ants: 11, antsKilled: 1 })).toEqual(['fight']);
    expect(soundsFor({ ...base, warning: true }, { ...base, raids: 1 })).toEqual(['raid']);
    expect(soundsFor(base, { ...base, warning: true })).toEqual(['warning']);
    expect(soundsFor({ ...base, warning: true }, { ...base, warning: true })).toEqual([]);
  });
});

describe('Sound without Web Audio', () => {
  it('every call is harmless and the switches are remembered', () => {
    localStorage.clear();
    const s = new Sound();
    s.unlock(); // jsdom has no AudioContext
    s.play('click');
    s.play('deliver');
    s.setRain(true);
    s.setMusic(false);
    s.setSfx(false);
    expect(s.musicOn).toBe(false);
    expect(s.sfxOn).toBe(false);
    const again = new Sound();
    expect(again.musicOn).toBe(false);
    expect(again.sfxOn).toBe(false);
    s.dispose();
  });
});
