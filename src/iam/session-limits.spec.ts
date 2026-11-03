import {
  effectiveSessionEnd,
  isSessionOver,
  sessionEndFrom,
} from './session-limits';

describe('session-limits', () => {
  it('sessionEndFrom suma las horas máximas', () => {
    expect(sessionEndFrom(1000, 12)).toBe(1000 + 12 * 3600);
  });

  it('effectiveSessionEnd usa el claim y, sin él, iat + máximo', () => {
    expect(effectiveSessionEnd(5000, 1, 12)).toBe(5000);
    expect(effectiveSessionEnd(undefined, 1000, 1)).toBe(1000 + 3600);
    expect(effectiveSessionEnd(undefined, undefined, 12)).toBeUndefined();
  });

  it('isSessionOver compara con el instante actual', () => {
    expect(isSessionOver(undefined, 10)).toBe(false);
    expect(isSessionOver(100, 99)).toBe(false);
    expect(isSessionOver(100, 100)).toBe(true);
  });
});
