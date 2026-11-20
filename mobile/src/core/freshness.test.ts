import {
  DEFAULT_THRESHOLDS,
  accuracyBand,
  classifyPosition,
  describeAccuracy,
  describeAge,
  presenceLabel,
} from './freshness';

const NOW = 1_700_000_000_000;

const position = (ageMs: number) => ({
  lat: 47.4979,
  lng: 19.0402,
  accuracyM: 12,
  capturedAt: NOW - ageMs,
});

describe('classifyPosition', () => {
  it('calls a recent fix current', () => {
    expect(classifyPosition(position(30_000), NOW).state).toBe('current');
  });

  it('calls a fix between the thresholds stale', () => {
    expect(classifyPosition(position(5 * 60_000), NOW).state).toBe('stale');
  });

  it('hides a fix older than the retention window', () => {
    const presence = classifyPosition(position(30 * 60_000), NOW);
    expect(presence.state).toBe('unavailable');
    expect(presence.showCoordinates).toBe(false);
    expect(presence.reason).toBe('expired');
  });

  it('treats a missing position as unavailable', () => {
    expect(classifyPosition(null, NOW)).toMatchObject({ state: 'unavailable', showCoordinates: false });
  });

  it('refuses to call a future-timestamped fix current', () => {
    const presence = classifyPosition({ ...position(0), capturedAt: NOW + 10 * 60_000 }, NOW);
    expect(presence.state).toBe('stale');
    expect(presence.reason).toBe('clock_skew');
  });

  it('respects the exact boundary of the current window', () => {
    expect(classifyPosition(position(DEFAULT_THRESHOLDS.currentMaxMs), NOW).state).toBe('current');
    expect(classifyPosition(position(DEFAULT_THRESHOLDS.currentMaxMs + 1), NOW).state).toBe('stale');
  });
});

describe('presenceLabel', () => {
  it('never presents a stale position as live', () => {
    const label = presenceLabel(classifyPosition(position(8 * 60_000), NOW));
    expect(label.state).toBe('stale');
    // The heading may not claim freshness, and the detail must say explicitly
    // that the position is not live rather than leaving it ambiguous.
    expect(label.title).not.toBe('Delar nu');
    expect(label.title.toLowerCase()).not.toContain('live');
    expect(label.detail.toLowerCase()).toContain('inte live');
    expect(label.tone).toBe('caution');
  });

  it('always states the age for a current position', () => {
    const label = presenceLabel(classifyPosition(position(20_000), NOW));
    expect(label.title).toBe('Delar nu');
    expect(label.detail).toMatch(/Rapporterad .+ sedan|nyss/);
  });

  it('explains a paused member without implying a position exists', () => {
    const label = presenceLabel({ state: 'unavailable', ageMs: Infinity, showCoordinates: false, reason: 'no_fix' }, 'paused');
    expect(label.title).toBe('Pausad');
    expect(label.detail).toContain('Inget samlas in');
  });

  it('explains an expired position as hidden rather than current', () => {
    const label = presenceLabel(classifyPosition(position(60 * 60_000), NOW));
    expect(label.title).toBe('Positionen är för gammal');
    expect(label.tone).toBe('neutral');
  });

  it('flags a clock-skewed position as not current', () => {
    const label = presenceLabel(classifyPosition({ ...position(0), capturedAt: NOW + 600_000 }, NOW));
    expect(label.state).toBe('stale');
    expect(label.detail.toLowerCase()).toContain('klocka');
  });
});

describe('accuracy', () => {
  it('bands accuracy', () => {
    expect(accuracyBand(8)).toBe('high');
    expect(accuracyBand(60)).toBe('medium');
    expect(accuracyBand(900)).toBe('low');
    expect(accuracyBand(Number.NaN)).toBe('low');
  });

  it('always renders a unit', () => {
    expect(describeAccuracy(12)).toBe('±12 m');
    expect(describeAccuracy(148)).toBe('±150 m');
    expect(describeAccuracy(Number.NaN)).toBe('noggrannhet okänd');
  });
});

describe('describeAge', () => {
  it('rounds to something a person would say', () => {
    expect(describeAge(5_000)).toBe('nyss');
    expect(describeAge(3 * 60_000)).toBe('för 3 min sedan');
    expect(describeAge(2 * 3600_000 + 5 * 60_000)).toBe('för 2 tim 5 min sedan');
    expect(describeAge(26 * 3600_000)).toBe('för 1 dag sedan');
  });
});
