import { MAX_ACCURACY_M, decideFix, explainRejection } from './gpsQuality';

const NOW = 1_700_000_000_000;

const good = { lat: 59.334, lng: 18.063, accuracyM: 14, capturedAt: NOW - 5_000 };

describe('decideFix', () => {
  it('accepts a normal, recent fix', () => {
    const d = decideFix(good, NOW);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.accuracyM).toBe(14);
  });

  it('drops a fix that is too imprecise to be honest about', () => {
    expect(decideFix({ ...good, accuracyM: MAX_ACCURACY_M + 1 }, NOW)).toEqual({
      ok: false,
      reason: 'too_imprecise',
    });
  });

  it('keeps a fix exactly at the limit', () => {
    expect(decideFix({ ...good, accuracyM: MAX_ACCURACY_M }, NOW).ok).toBe(true);
  });

  it('drops a missing accuracy rather than treating it as perfect', () => {
    expect(decideFix({ ...good, accuracyM: null }, NOW).ok).toBe(false);
    expect(decideFix({ ...good, accuracyM: Number.NaN }, NOW).ok).toBe(false);
  });

  it('rejects coordinates that are not on Earth', () => {
    expect(decideFix({ ...good, lat: 91 }, NOW)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(decideFix({ ...good, lng: -181 }, NOW)).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('rejects the 0,0 placeholder', () => {
    expect(decideFix({ ...good, lat: 0, lng: 0 }, NOW)).toEqual({ ok: false, reason: 'null_island' });
  });

  it('rejects a fix from the future', () => {
    expect(decideFix({ ...good, capturedAt: NOW + 60_000 }, NOW)).toEqual({ ok: false, reason: 'clock_ahead' });
  });

  it('allows a small clock difference', () => {
    expect(decideFix({ ...good, capturedAt: NOW + 2_000 }, NOW).ok).toBe(true);
  });

  it('rejects a fix with no timestamp', () => {
    expect(decideFix({ ...good, capturedAt: undefined }, NOW)).toEqual({ ok: false, reason: 'bad_time' });
  });

  it('rejects nothing at all', () => {
    expect(decideFix(null, NOW)).toEqual({ ok: false, reason: 'missing' });
  });

  it('rounds the accuracy so the UI never shows decimals', () => {
    const d = decideFix({ ...good, accuracyM: 13.7 }, NOW);
    expect(d.ok && d.accuracyM).toBe(14);
  });
});

describe('explainRejection', () => {
  it('says what to do when the fix is imprecise', () => {
    expect(explainRejection('too_imprecise')).toMatch(/försök igen/i);
  });

  it('names the clock when the clock is the problem', () => {
    expect(explainRejection('clock_ahead').toLowerCase()).toContain('klocka');
  });
});
