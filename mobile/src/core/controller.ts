/**
 * LocationController — the only object allowed to decide that a position moves.
 *
 * It owns three things and keeps them in step:
 *   - the native watcher (started / stopped)
 *   - the outbox (kept / purged)
 *   - the gate (open / closed)
 *
 * Everything it touches is injected, so the whole controller runs in a unit
 * test with a fake watcher and a fake network. The native wiring lives in
 * ../location/native.ts and does nothing but call into here.
 *
 * The invariant the tests exist to defend: when sharing stops for any reason —
 * pause, sign-out, removal, leaving, consent withdrawal — the watcher stops,
 * the queue is destroyed immediately, and a later flush sends nothing.
 */
import { Outbox, type FlushResult } from './outbox';
import { mayCollect, transmissionGate } from './sharing';
import type { Fix, FixSource, GateResult, QueuedFix, SharingState, TransmissionContext } from './types';

export type Sample = {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: number;
  source: FixSource;
};

export type WatchOptions = {
  /** True when the watch must survive the screen being locked. */
  background: boolean;
  onSample: (sample: Sample) => void;
};

export type ControllerPorts = {
  outbox: Outbox;
  send: (fix: Fix) => Promise<void>;
  /** Starts a native watch; returns the function that stops it. */
  watch: (options: WatchOptions) => () => void;
  /** Notifies the UI. Optional so tests stay quiet. */
  onChange?: (state: ControllerSnapshot) => void;
};

export type ControllerSnapshot = {
  watching: boolean;
  watchingBackground: boolean;
  context: TransmissionContext;
  lastGate: GateResult;
  queueSize: number;
};

export type StopReason =
  | 'manual'
  | 'pause'
  | 'sign_out'
  | 'removed'
  | 'left_group'
  | 'consent_withdrawn';

const CLOSED_GATE: GateResult = {
  allowed: false,
  reason: 'signed_out',
  detail: 'You are signed out, so nothing is collected or sent.',
};

export class LocationController {
  private readonly ports: ControllerPorts;
  private context: TransmissionContext;
  private stopWatcher: (() => void) | null = null;
  private watchingBackground = false;
  private lastGate: GateResult = CLOSED_GATE;
  private queueSize = 0;

  constructor(ports: ControllerPorts, initial: TransmissionContext) {
    this.ports = ports;
    this.context = initial;
  }

  snapshot(): ControllerSnapshot {
    return {
      watching: this.stopWatcher !== null,
      watchingBackground: this.watchingBackground,
      context: { ...this.context },
      lastGate: this.lastGate,
      queueSize: this.queueSize,
    };
  }

  private emit(): void {
    this.ports.onChange?.(this.snapshot());
  }

  /**
   * Apply account state. If the change closes the gate, collection and the
   * queue are torn down before this returns — not on the next poll.
   */
  async setContext(patch: Partial<TransmissionContext>, purgeReason?: string): Promise<void> {
    this.context = { ...this.context, ...patch };

    const fgGate = transmissionGate(this.context, 'foreground');
    this.lastGate = fgGate;

    if (!fgGate.allowed) {
      this.stopWatcherNow();
      this.queueSize = await this.ports.outbox.purge(purgeReason ?? fgGate.reason);
      this.emit();
      return;
    }

    await this.syncWatcher();
    this.queueSize = await this.ports.outbox.size();
    this.emit();
  }

  /** Returns how many queued positions were destroyed by the change. */
  async setSharingState(state: SharingState): Promise<number> {
    await this.setContext({ sharingState: state }, `sharing_${state}`);
    return this.queueSize;
  }

  /** Returns how many queued positions were destroyed. */
  async pause(): Promise<number> {
    await this.setContext({ sharingState: 'paused' }, 'pause');
    return this.queueSize;
  }

  async signOut(): Promise<void> {
    await this.setContext({ signedIn: false, sharingState: 'off' }, 'sign_out');
  }

  async markRemoved(): Promise<void> {
    await this.setContext({ memberRemoved: true }, 'removed');
  }

  /** Returns how many queued positions were destroyed. */
  async withdrawConsent(): Promise<number> {
    await this.setContext({ foregroundConsent: false, backgroundConsent: false }, 'consent_withdrawn');
    return this.queueSize;
  }

  /** Called when the server rejects a request for this member. */
  async markServerRevoked(): Promise<void> {
    await this.setContext({ serverRevoked: true }, 'server_revoked');
  }

  /**
   * Start or stop watching so that the native side matches the gate.
   * Background is preferred when consented: a foreground-only watch silently
   * stops when the phone is locked, which is exactly when the promise matters.
   */
  private async syncWatcher(): Promise<void> {
    const backgroundPossible = this.context.backgroundConsent && mayCollect(this.context, 'background');

    if (backgroundPossible) {
      if (this.stopWatcher !== null && this.watchingBackground) return;
      this.stopWatcherNow();
      this.stopWatcher = this.ports.watch({ background: true, onSample: (s) => void this.handleSample(s) });
      this.watchingBackground = true;
      return;
    }

    const foregroundPossible = mayCollect(this.context, 'foreground');
    if (!foregroundPossible) {
      this.stopWatcherNow();
      return;
    }

    if (this.stopWatcher !== null && !this.watchingBackground) return;
    this.stopWatcherNow();
    this.stopWatcher = this.ports.watch({ background: false, onSample: (s) => void this.handleSample(s) });
    this.watchingBackground = false;
  }

  private stopWatcherNow(): void {
    if (this.stopWatcher) {
      this.stopWatcher();
      this.stopWatcher = null;
    }
    this.watchingBackground = false;
  }

  /**
   * A fix arrived from the OS. It is gated again here even though the watcher
   * was only started because the gate was open: state may have changed between
   * the sample being requested and it arriving.
   */
  async handleSample(sample: Sample): Promise<'queued' | 'sent' | 'dropped'> {
    const gate = transmissionGate(this.context, sample.source);
    this.lastGate = gate;

    if (!gate.allowed) {
      // Collection should already have stopped; if a straggler arrives, make
      // sure it cannot be sent and that the queue does not survive either.
      this.stopWatcherNow();
      this.queueSize = await this.ports.outbox.purge(gate.reason);
      this.emit();
      return 'dropped';
    }

    if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) {
      return 'dropped';
    }

    await this.ports.outbox.enqueue({
      memberId: this.context.memberId ?? '',
      lat: sample.lat,
      lng: sample.lng,
      accuracyM: sample.accuracyM,
      capturedAt: sample.capturedAt,
      source: sample.source,
    });

    const result = await this.flush();
    if (result.sent > 0) return 'sent';
    if (this.context.serverRevoked) return 'dropped';
    return result.remaining > 0 ? 'queued' : 'dropped';
  }

  /** Retry anything queued. Safe to call from a timer or on app foreground. */
  async flush(): Promise<FlushResult> {
    let revoked = false;

    const result = await this.ports.outbox.flush({
      gateFor: (item) => transmissionGate(this.context, item.source),
      send: async (item) => {
        try {
          await this.ports.send(stripQueueMetadata(item));
        } catch (err) {
          const status = (err as { status?: number } | null)?.status;
          if (status === 401 || status === 403) {
            // The server no longer recognises this membership. Note it here and
            // act after the queue lock is released — purging from inside send()
            // would wait on the lock that this flush is holding.
            revoked = true;
          }
          throw err;
        }
      },
      onStopped: (reason) => {
        this.lastGate = transmissionGate(this.context, 'foreground');
        void reason;
      },
    });

    if (revoked) {
      await this.markServerRevoked();
    }

    this.queueSize = await this.ports.outbox.size();
    this.emit();
    return result;
  }

  /** Full teardown, used when the app is signed out or the group is left. */
  async shutdown(reason: StopReason): Promise<void> {
    this.stopWatcherNow();
    this.queueSize = await this.ports.outbox.purge(reason);
    this.emit();
  }

  /** True when the OS watcher is running. Exposed for assertions and the UI. */
  isWatching(): boolean {
    return this.stopWatcher !== null;
  }
}

function stripQueueMetadata(item: QueuedFix): Fix {
  const { id: _id, queuedAt: _queuedAt, attempts: _attempts, ...fix } = item;
  return fix;
}
