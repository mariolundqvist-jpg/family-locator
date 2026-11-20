/**
 * Turning a raw OS location into a sample, or refusing to.
 *
 * A device can hand back a location with no coordinates (first fix after a cold
 * start, a fix from a disabled radio, a malformed object after an OS upgrade).
 * Sending one of those would put a made-up position in front of a family
 * member, so they are dropped here rather than repaired.
 *
 * Pure, and tested, because the headless background task runs this code with no
 * UI to show a warning in.
 */
import type { Sample } from './controller';
import type { FixSource } from './types';

export type RawLocation = {
  coords?: { latitude?: number | null; longitude?: number | null; accuracy?: number | null };
  timestamp?: number | null;
};

/** Coordinates outside these bounds are not a place on Earth. */
const LIMITS = { lat: 90, lng: 180 };

export function isUsableCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= LIMITS.lat &&
    Math.abs(lng) <= LIMITS.lng &&
    // 0,0 is in the Atlantic and is almost always a "no fix" placeholder.
    !(lat === 0 && lng === 0)
  );
}

export function normaliseSample(raw: RawLocation | null | undefined, source: FixSource): Sample | null {
  if (!raw) return null;
  const lat = raw.coords?.latitude;
  const lng = raw.coords?.longitude;
  const capturedAt = raw.timestamp;
  if (!isUsableCoordinate(lat, lng)) return null;
  if (typeof capturedAt !== 'number' || !Number.isFinite(capturedAt)) return null;

  const accuracy = raw.coords?.accuracy;
  return {
    lat: lat as number,
    lng: lng as number,
    // A missing accuracy is reported as unknown (0 means "unknown" in this app)
    // rather than being invented as a small number.
    accuracyM: typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0,
    capturedAt,
    source,
  };
}

export function normaliseSamples(raw: RawLocation[], source: FixSource): Sample[] {
  const out: Sample[] = [];
  for (const item of raw) {
    const sample = normaliseSample(item, source);
    if (sample) out.push(sample);
  }
  return out;
}
