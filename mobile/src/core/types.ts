/**
 * Shared types for the SafePath mobile client.
 *
 * Nothing in `src/core` imports a native module or React. That is deliberate:
 * every rule that decides whether a position may leave the phone lives here and
 * is unit-tested on plain Node, without an emulator.
 */

export type SharingState = 'on' | 'off' | 'paused';

/** Where a fix came from. Mirrors the server's `source` column. */
export type FixSource = 'foreground' | 'background' | 'checkin';

/** A position as captured by the OS, before any queueing. */
export type Fix = {
  memberId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  /** Unix epoch milliseconds, as reported by the OS. */
  capturedAt: number;
  source: FixSource;
};

/** A fix waiting in the outbox. */
export type QueuedFix = Fix & {
  /** Local unique id, so a retry cannot duplicate a row in the queue. */
  id: string;
  queuedAt: number;
  attempts: number;
};

/** The subset of account state that can block transmission. */
export type TransmissionContext = {
  signedIn: boolean;
  /** Membership id that queued fixes belong to. Empty until the group loads. */
  memberId?: string;
  sharingState: SharingState;
  /** True once this device learns the membership was ended or removed. */
  memberRemoved: boolean;
  /** Server-side consent record, mirrored locally. */
  foregroundConsent: boolean;
  backgroundConsent: boolean;
  /**
   * Set by the server when it answers 403/401 for a member, e.g. after an owner
   * removes them while the app is closed.
   */
  serverRevoked?: boolean;
};

export type GateReason =
  | 'ok'
  | 'signed_out'
  | 'removed'
  | 'server_revoked'
  | 'paused'
  | 'not_sharing'
  | 'consent_withdrawn'
  | 'background_not_consented';

export type GateResult = {
  allowed: boolean;
  reason: GateReason;
  /** Human-readable, shown in the app's activity line. Never contains a fix. */
  detail: string;
};

/** What must happen to positions already sitting in the outbox. */
export type QueueDisposition = 'keep' | 'discard';
