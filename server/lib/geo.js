// Location freshness is computed on the server, from server timestamps and the
// device's claimed capture time. The client never decides whether a fix is
// "current" — it only renders what it is told. This is the difference between a
// trust signal and a decoration.
import { config } from './config.js';

export const LOCATION_STATE = ['current', 'stale', 'unavailable'];

/**
 * @param {object|null} loc  stored location row, or null
 * @param {number} now       server time in ms
 * @returns {{state: string, reason: string, ageMs: number|null, freshness: object|null}}
 */
export function deriveState(loc, now) {
  if (!loc) return { state: 'unavailable', reason: 'no_fix', ageMs: null, freshness: null };

  const ageMs = now - loc.capturedAt;
  const freshness = {
    currentForMs: config.currentMaxMs,
    staleForMs: config.staleMaxMs,
    retainedForMs: config.locationRetentionMs,
  };

  if (ageMs > config.locationRetentionMs) {
    return { state: 'unavailable', reason: 'expired', ageMs, freshness };
  }
  if (ageMs < -config.clockSkewMs) {
    // Device clock is ahead of us by more than we tolerate: we cannot honestly
    // describe this as a current position.
    return { state: 'unavailable', reason: 'clock_skew', ageMs, freshness };
  }
  if (ageMs <= config.currentMaxMs) return { state: 'current', reason: 'fresh', ageMs, freshness };
  return { state: 'stale', reason: 'aging', ageMs, freshness };
}

export function validateCoordinate({ lat, lng, accuracyM, capturedAt }) {
  const errors = [];
  const la = Number(lat);
  const ln = Number(lng);
  const acc = Number(accuracyM);
  const cap = Number(capturedAt);

  if (!Number.isFinite(la) || la < -90 || la > 90) errors.push('lat must be a number between -90 and 90');
  if (!Number.isFinite(ln) || ln < -180 || ln > 180) errors.push('lng must be a number between -180 and 180');
  if (!Number.isFinite(acc) || acc < 0 || acc > config.maxAccuracyM) {
    errors.push(`accuracyM must be between 0 and ${config.maxAccuracyM}`);
  }
  if (!Number.isFinite(cap) || cap <= 0) errors.push('capturedAt must be a millisecond timestamp');
  if (Number.isFinite(cap) && cap > Date.now() + config.clockSkewMs) errors.push('capturedAt is in the future');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      lat: Number(la.toFixed(6)),
      lng: Number(ln.toFixed(6)),
      accuracyM: Math.round(acc),
      capturedAt: Math.round(cap),
    },
  };
}

/** Coarse quality band, shown next to the radius. Never a safety guarantee. */
export function accuracyBand(accuracyM) {
  if (accuracyM === null || accuracyM === undefined) return 'unknown';
  if (accuracyM <= 30) return 'good';
  if (accuracyM <= 150) return 'fair';
  if (accuracyM <= 1000) return 'poor';
  return 'very_poor';
}

/** Approximate distance in metres between two WGS84 points (haversine). */
export function distanceM(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
