import { describe, expect, it } from 'vitest';
import { formatTime, parseSeed } from './records';

describe('records helpers', () => {
  it('parseSeed: digits are the seed, text is hashed stably, empty is random', () => {
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('  ')).toBeNull();
    expect(parseSeed('12345')).toBe(12345);
    const a = parseSeed('moje mapa');
    expect(a).toBe(parseSeed('moje mapa'));
    expect(a).not.toBe(parseSeed('jina mapa'));
    expect(Number.isInteger(a)).toBe(true);
  });
  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3725)).toBe('1:02:05');
  });
});
