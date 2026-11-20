/**
 * The transmission gate.
 *
 * This is the single place in the mobile client that answers two questions:
 *
 *   1. may the OS location watcher run at all?      -> mayCollect()
 *   2. may a captured fix be sent to the server?    -> transmissionGate()
 *
 * They are separate on purpose. Stopping transmission but leaving the GPS
 * receiver running would still be collection, and the product promise is that
 * pausing stops both. Every other module asks this file rather than deciding
 * for itself, so a regression is caught by one set of tests.
 */
import type {
  FixSource,
  GateReason,
  GateResult,
  QueueDisposition,
  TransmissionContext,
} from './types';

const DETAIL: Record<GateReason, string> = {
  ok: 'Sharing is on.',
  signed_out: 'You are signed out, so nothing is collected or sent.',
  removed: 'You are no longer a member of this group.',
  server_revoked: 'The group no longer includes this account.',
  paused: 'Sharing is paused. Nothing is collected or sent while paused.',
  not_sharing: 'Sharing is off for this group.',
  consent_withdrawn: 'Location permission is withdrawn. Nothing is collected.',
  background_not_consented: 'Background updates were not turned on.',
};

export function isAllowed(reason: GateReason): boolean {
  return reason === 'ok';
}

/**
 * May a fix of this `source` be transmitted right now?
 *
 * Check-ins are handled separately: they are a deliberate one-off act that the
 * server accepts even when routine sharing is off, because the person pressed
 * the button at that moment. They still require consent and a live membership.
 */
export function transmissionGate(ctx: TransmissionContext, source: FixSource): GateResult {
  const deny = (reason: GateReason): GateResult => ({
    allowed: false,
    reason,
    detail: DETAIL[reason],
  });

  if (!ctx.signedIn) return deny('signed_out');
  if (ctx.memberRemoved) return deny('removed');
  if (ctx.serverRevoked) return deny('server_revoked');

  // No consent, no fix — whatever the source.
  if (!ctx.foregroundConsent) return deny('consent_withdrawn');

  if (source === 'checkin') {
    return { allowed: true, reason: 'ok', detail: DETAIL.ok };
  }

  if (source === 'background' && !ctx.backgroundConsent) {
    return deny('background_not_consented');
  }

  if (ctx.sharingState === 'paused') return deny('paused');
  if (ctx.sharingState === 'off') return deny('not_sharing');

  return { allowed: true, reason: 'ok', detail: DETAIL.ok };
}

/**
 * May the native watcher be started for this source?
 *
 * Mirrors the gate so that collection stops at exactly the same moment as
 * transmission. A check-in never starts a watcher — it is a single reading.
 */
export function mayCollect(ctx: TransmissionContext, source: Exclude<FixSource, 'checkin'>): boolean {
  return transmissionGate(ctx, source).allowed;
}

/**
 * What to do with positions already queued when the gate closes.
 *
 * They are discarded, not held for later. A position captured while sharing
 * was on, but sent after the person paused, would disclose movement during a
 * period they had switched off. That is exactly the covert-tracking failure
 * this product must not have.
 */
export function queueDisposition(gate: GateResult): QueueDisposition {
  return gate.allowed ? 'keep' : 'discard';
}

/** Convenience for UI copy: the reason a member is not appearing. */
export function gateDetail(reason: GateReason): string {
  return DETAIL[reason];
}

/** True when the only thing standing between the user and sharing is consent. */
export function needsConsent(ctx: TransmissionContext): boolean {
  return ctx.signedIn && !ctx.memberRemoved && !ctx.foregroundConsent;
}

/**
 * True when the user could share continuously but has not granted the
 * background permission. Used to decide whether to offer the explanation
 * screen; never used to prompt automatically.
 */
export function couldOfferBackground(ctx: TransmissionContext): boolean {
  return (
    ctx.signedIn &&
    !ctx.memberRemoved &&
    ctx.foregroundConsent &&
    !ctx.backgroundConsent &&
    ctx.sharingState === 'on'
  );
}
