import { describeFixForDisplay, formatClock, formatTimestamp } from './format';

const at = (iso: string) => Date.parse(iso);

describe('formatTimestamp', () => {
  it('renders today relative to the reference day', () => {
    const now = at('2026-10-27T12:00:00Z');
    expect(formatTimestamp(at('2026-10-27T14:32:00Z'), { timeZone: 'UTC', now })).toBe('Today 14:32');
  });

  it('renders yesterday distinctly', () => {
    const now = at('2026-10-27T12:00:00Z');
    expect(formatTimestamp(at('2026-10-26T21:40:00Z'), { timeZone: 'UTC', now })).toBe('Yesterday 21:40');
  });

  it('includes the date for anything older', () => {
    const now = at('2026-10-27T12:00:00Z');
    expect(formatTimestamp(at('2026-10-20T09:05:00Z'), { timeZone: 'UTC', now })).toBe('20 Oct, 09:05');
  });

  it('renders in the requested zone rather than the machine default', () => {
    const ts = at('2026-10-27T22:30:00Z');
    const now = at('2026-10-27T22:30:00Z');
    expect(formatTimestamp(ts, { timeZone: 'Europe/Budapest', now })).toBe('Today 23:30');
  });

  it('degrades gracefully for a nonsense timestamp', () => {
    expect(formatTimestamp(Number.NaN)).toBe('unknown time');
  });
});

describe('formatClock', () => {
  it('renders 24-hour time without a date', () => {
    expect(formatClock(at('2026-10-27T07:05:00Z'), { timeZone: 'UTC' })).toBe('07:05');
  });
});

describe('describeFixForDisplay', () => {
  it('always pairs a timestamp with an accuracy radius', () => {
    const out = describeFixForDisplay(at('2026-10-27T14:32:00Z'), 12, {
      timeZone: 'UTC',
      now: at('2026-10-27T14:33:00Z'),
    });
    expect(out).toBe('Today 14:32 · ±12 m');
  });
});
