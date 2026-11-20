/**
 * Presence classification.
 *
 * The rule the product must never break: an old position is never presented as
 * a live one. Every position shown in this app carries a state, a timestamp and
 * an accuracy radius, and only `current` may use the word "now".
 *
 * Thresholds mirror the server (which is authoritative and re-derives the same
 * state); duplicating them here lets the UI react between polls without ever
 * inventing a fresher answer than the server would give.
 */

export type PresenceState = 'current' | 'stale' | 'unavailable';

export type Thresholds = {
  /** Age at or below which a position may be called current. */
  currentMaxMs: number;
  /** Age after which the position is no longer shown at all. */
  staleMaxMs: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  currentMaxMs: 120_000,
  staleMaxMs: 900_000,
};

/** A device clock running fast must not make a fix look fresher than it is. */
const FUTURE_TOLERANCE_MS = 60_000;

export type PositionLike = {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: number;
};

export type Presence = {
  state: PresenceState;
  ageMs: number;
  /** Coordinates are withheld once the position is too old to be meaningful. */
  showCoordinates: boolean;
  /** Why the state is what it is; safe to log, contains no coordinates. */
  reason: 'ok' | 'no_fix' | 'stale' | 'expired' | 'clock_skew';
};

export function classifyPosition(
  position: PositionLike | null | undefined,
  now: number,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Presence {
  if (!position) {
    return { state: 'unavailable', ageMs: Infinity, showCoordinates: false, reason: 'no_fix' };
  }

  const rawAge = now - position.capturedAt;
  const ageMs = Math.max(0, rawAge);

  if (rawAge < -FUTURE_TOLERANCE_MS) {
    // Captured in the future by more than a minute: the clock cannot be
    // trusted, so this position is not allowed to claim freshness.
    return { state: 'stale', ageMs, showCoordinates: true, reason: 'clock_skew' };
  }

  if (ageMs <= thresholds.currentMaxMs) {
    return { state: 'current', ageMs, showCoordinates: true, reason: 'ok' };
  }

  if (ageMs <= thresholds.staleMaxMs) {
    return { state: 'stale', ageMs, showCoordinates: true, reason: 'stale' };
  }

  return { state: 'unavailable', ageMs, showCoordinates: false, reason: 'expired' };
}

export type AccuracyBand = 'high' | 'medium' | 'low';

export function accuracyBand(accuracyM: number): AccuracyBand {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return 'low';
  if (accuracyM <= 30) return 'high';
  if (accuracyM <= 150) return 'medium';
  return 'low';
}

export type PresenceLabel = {
  state: PresenceState;
  /** Short heading. Only `current` may say "nu" or "live". */
  title: string;
  /** Always includes the age of the position, in words. */
  detail: string;
  tone: 'positive' | 'caution' | 'neutral';
};

/**
 * Build the label shown to a family member.
 *
 * `detail` always states the age, so even a "current" position is qualified.
 * Tests assert that no non-current label contains "now" or "live".
 */
export function presenceLabel(presence: Presence, unavailableReason?: string | null): PresenceLabel {
  if (presence.state === 'unavailable') {
    const title =
      unavailableReason === 'paused'
        ? 'Pausad'
        : unavailableReason === 'not_sharing'
          ? 'Delar inte'
          : presence.reason === 'expired'
            ? 'Positionen är för gammal'
            : 'Ingen position än';
    const detail =
      unavailableReason === 'paused'
        ? 'Personen har pausat sin delning. Inget samlas in.'
        : unavailableReason === 'not_sharing'
          ? 'Personen delar inte sin position med gruppen.'
          : presence.reason === 'expired'
            ? 'Den senaste positionen är äldre än gränsen, så den visas inte alls i stället för som aktuell.'
            : 'Ingen position har rapporterats av den här personen.';
    return { state: 'unavailable', title, detail, tone: 'neutral' };
  }

  const age = describeAge(presence.ageMs);

  if (presence.state === 'current') {
    return {
      state: 'current',
      title: 'Delar nu',
      detail: `Rapporterad ${age}.`,
      tone: 'positive',
    };
  }

  return {
    state: 'stale',
    title: 'Inte aktuell',
    detail:
      presence.reason === 'clock_skew'
        ? 'Telefonens klocka verkar gå fel, så positionen kan inte visas som aktuell.'
        : `Senast rapporterad ${age}. Den är inte live.`,
    tone: 'caution',
  };
}

export function describeAge(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'vid okänd tidpunkt';
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 45) return 'nyss';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `för ${minutes} min sedan`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `för ${hours} tim ${rest} min sedan` : `för ${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'för 1 dag sedan' : `för ${days} dagar sedan`;
}

/** Accuracy is always shown with its unit; a fix without a radius is not shown. */
export function describeAccuracy(accuracyM: number): string {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return 'noggrannhet okänd';
  const rounded = accuracyM < 20 ? Math.round(accuracyM) : Math.round(accuracyM / 5) * 5;
  return `±${rounded} m`;
}
