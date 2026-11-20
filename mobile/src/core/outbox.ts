/**
 * The outbox: positions captured but not yet accepted by the server.
 *
 * Two rules shape this file, both from the product requirements:
 *
 *   - Queued positions must stop when sharing stops. `flush()` re-asks the
 *     gate before *every* item, so a pause, sign-out, removal or consent
 *     withdrawal takes effect on the queue immediately, even mid-flush.
 *   - A queued position is a claim about where someone was at a past moment.
 *     If it is too old to be meaningful it is dropped rather than sent, and it
 *     is never described to anyone as "current".
 *
 * The storage layer is injected, so the whole thing is testable on plain Node
 * with an in-memory adapter.
 */
import type { Fix, GateReason, GateResult, QueuedFix } from './types';

export type OutboxStorage = {
  read(): Promise<string | null>;
  write(value: string | null): Promise<void>;
};

export type OutboxOptions = {
  /** Hard cap. Oldest items are dropped first when it is exceeded. */
  maxItems?: number;
  /** Items captured longer ago than this are abandoned, not sent. */
  maxAgeMs?: number;
  now?: () => number;
  newId?: () => string;
};

export type FlushDeps = {
  /** Re-evaluated for every item. */
  gateFor: (item: QueuedFix) => GateResult;
  send: (item: QueuedFix) => Promise<void>;
  /** Called once if the gate closed the queue. */
  onStopped?: (reason: GateReason, discarded: number) => void;
};

export type FlushResult = {
  sent: number;
  discarded: number;
  expired: number;
  remaining: number;
  stoppedBy?: GateReason;
};

export type EnqueueResult = {
  queued: number;
  droppedExpired: number;
  droppedOverflow: number;
};

const DEFAULTS = {
  maxItems: 50,
  maxAgeMs: 10 * 60 * 1000,
};

/** Errors the server will never accept no matter how often we retry. */
export function isPermanentFailure(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status !== 'number') return false;
  if (status === 429) return false; // rate limited: worth retrying later
  return status >= 400 && status < 500;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export class Outbox {
  private readonly storage: OutboxStorage;
  private readonly maxItems: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private readonly newId: () => string;

  /** Serialises read-modify-write so the UI and the background task cannot race. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(storage: OutboxStorage, options: OutboxOptions = {}) {
    this.storage = storage;
    this.maxItems = options.maxItems ?? DEFAULTS.maxItems;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULTS.maxAgeMs;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? defaultId;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // Keep the chain alive even if `fn` rejects.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async read(): Promise<QueuedFix[]> {
    const raw = await this.storage.read();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Defensive: a corrupt entry must not stop the app from sending, and an
      // entry written by an older build without queue metadata is repaired
      // rather than thrown away.
      return parsed
        .filter(
          (x): x is QueuedFix =>
            !!x &&
            typeof x.lat === 'number' &&
            typeof x.lng === 'number' &&
            typeof x.capturedAt === 'number',
        )
        .map((x) => ({
          ...x,
          id: typeof x.id === 'string' ? x.id : this.newId(),
          queuedAt: typeof x.queuedAt === 'number' ? x.queuedAt : x.capturedAt,
          attempts: typeof x.attempts === 'number' ? x.attempts : 0,
        }));
    } catch {
      return [];
    }
  }

  private async write(items: QueuedFix[]): Promise<void> {
    await this.storage.write(items.length ? JSON.stringify(items) : null);
  }

  /** Items currently waiting, oldest first. */
  async pending(): Promise<QueuedFix[]> {
    return this.exclusive(async () => this.read());
  }

  async size(): Promise<number> {
    return (await this.pending()).length;
  }

  /**
   * Add a fix. Returns what happened rather than throwing: losing a queued
   * position is a normal outcome when the queue is full.
   */
  async enqueue(fix: Fix): Promise<EnqueueResult> {
    return this.exclusive(async () => {
      const now = this.now();
      const existing = await this.read();

      const fresh = existing.filter((i) => now - i.capturedAt <= this.maxAgeMs);
      const droppedExpired = existing.length - fresh.length;

      const item: QueuedFix = {
        ...fix,
        id: this.newId(),
        queuedAt: now,
        attempts: 0,
      };

      const next = [...fresh, item];
      let droppedOverflow = 0;
      while (next.length > this.maxItems) {
        next.shift(); // oldest first
        droppedOverflow += 1;
      }

      await this.write(next);
      return { queued: next.length, droppedExpired, droppedOverflow };
    });
  }

  /**
   * Attempt to send everything queued.
   *
   * Order matters: expiry is checked before the gate, and the gate before the
   * network. A closed gate purges the whole queue and reports why; a transient
   * network error leaves the remaining items in place for the next attempt.
   */
  async flush(deps: FlushDeps): Promise<FlushResult> {
    return this.exclusive(async () => {
      const items = await this.read();
      const now = this.now();

      const result: FlushResult = { sent: 0, discarded: 0, expired: 0, remaining: 0 };
      const keep: QueuedFix[] = [];

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const age = now - item.capturedAt;

        if (age > this.maxAgeMs) {
          result.expired += 1;
          result.discarded += 1;
          continue;
        }

        const gate = deps.gateFor(item);
        if (!gate.allowed) {
          // Everything still queued goes with it: these are positions from a
          // period the person has now switched off.
          const abandoned = items.length - index;
          result.discarded += abandoned;
          result.stoppedBy = gate.reason;
          await this.storage.write(null);
          deps.onStopped?.(gate.reason, abandoned);
          return result;
        }

        try {
          await deps.send(item);
          result.sent += 1;
        } catch (err) {
          if (isPermanentFailure(err)) {
            // The server has said no in a way that will not change.
            result.discarded += 1;
            continue;
          }
          // Transient: keep this item and everything after it.
          keep.push({ ...item, attempts: item.attempts + 1 });
          keep.push(...items.slice(index + 1));
          break;
        }
      }

      await this.write(keep);
      result.remaining = keep.length;
      return result;
    });
  }

  /**
   * Discard everything. Used on pause, sign-out, leaving a group, consent
   * withdrawal and account deletion. Returns how many positions were destroyed.
   */
  async purge(_reason: string): Promise<number> {
    return this.exclusive(async () => {
      const items = await this.read();
      await this.storage.write(null);
      return items.length;
    });
  }
}

/** In-memory adapter, for tests and for the very first launch. */
export function memoryStorage(initial: string | null = null): OutboxStorage & { value: string | null } {
  const box = {
    value: initial,
    async read() {
      return box.value;
    },
    async write(value: string | null) {
      box.value = value;
    },
  };
  return box;
}
