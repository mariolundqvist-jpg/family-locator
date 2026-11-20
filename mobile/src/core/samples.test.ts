import { isUsableCoordinate, normaliseSample, normaliseSamples } from './samples';

const NOW = 1_700_000_000_000;
const raw = (over: Record<string, unknown> = {}) => ({
  coords: { latitude: 47.4979, longitude: 19.0402, accuracy: 12 },
  timestamp: NOW,
  ...over,
});

describe('isUsableCoordinate', () => {
  it('accepts a real fix', () => {
    expect(isUsableCoordinate(47.4979, 19.0402)).toBe(true);
  });

  it('rejects impossible values', () => {
    expect(isUsableCoordinate(91, 19)).toBe(false);
    expect(isUsableCoordinate(47, 181)).toBe(false);
    expect(isUsableCoordinate(Number.NaN, 19)).toBe(false);
    expect(isUsableCoordinate(undefined, undefined)).toBe(false);
  });

  it('rejects the 0,0 placeholder that means "no fix"', () => {
    expect(isUsableCoordinate(0, 0)).toBe(false);
    expect(isUsableCoordinate(0.0001, 0)).toBe(true);
  });
});

describe('normaliseSample', () => {
  it('maps a healthy location', () => {
    expect(normaliseSample(raw(), 'background')).toEqual({
      lat: 47.4979,
      lng: 19.0402,
      accuracyM: 12,
      capturedAt: NOW,
      source: 'background',
    });
  });

  it('drops a location with no coordinates instead of inventing one', () => {
    expect(normaliseSample({ coords: {}, timestamp: NOW }, 'background')).toBeNull();
    expect(normaliseSample(null, 'background')).toBeNull();
  });

  it('drops a location with no timestamp', () => {
    expect(normaliseSample({ coords: { latitude: 47, longitude: 19 } }, 'background')).toBeNull();
  });

  it('reports a missing accuracy as unknown rather than as precise', () => {
    const sample = normaliseSample(raw({ coords: { latitude: 47, longitude: 19, accuracy: null } }), 'foreground');
    expect(sample?.accuracyM).toBe(0);
  });

  it('keeps the source it was called with', () => {
    expect(normaliseSample(raw(), 'checkin')?.source).toBe('checkin');
  });
});

describe('normaliseSamples', () => {
  it('keeps the good ones and counts nothing else', () => {
    const out = normaliseSamples([raw(), { coords: {} }, raw({ timestamp: null })], 'background');
    expect(out).toHaveLength(1);
  });
});
