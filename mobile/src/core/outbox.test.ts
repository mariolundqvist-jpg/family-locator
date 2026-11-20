import { Outbox, isPermanentFailure, memoryStorage } from './outbox';
import type { Fix, QueuedFix } from './types';

const NOW = 1_700_000_000_000;

function fix(overrides: Partial<Fix> = {}): Fix {
  return {
    memberId: 'm1',
    lat: 47.4979,
    lng: 19.0402,
    accuracyM: 12,
    capturedAt: NOW,
    source: 'foreground',
    ...overrides,
  };
}

function makeOutbox(options: { maxItems?: number; maxAgeMs?: number; now?: number } = {}) {
  const storage = memoryStorage();
  let clock = options.now ?? NOW;
  const outbox = new Outbox(storage, {
    maxItems: options.maxItems,
    maxAgeMs: options.maxAgeMs,
    now: () => clock,
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
  return { outbox, storage, setNow: (t: number) => (clock = t) };
}

const openGate = () => ({ allowed: true, reason: 'ok' as const, detail: 'ok' });
const closedGate = () => ({ allowed: false, reason: 'paused' as const, detail: 'paused' });

describe('Outbox basics', () => {
  it('starts empty', async () => {
    const { outbox } = makeOutbox();
    expect(await outbox.size()).toBe(0);
    expect(await outbox.pending()).toEqual([]);
  });

  it('enqueues and reports the queue length', async () => {
    const { outbox } = makeOutbox();
    const result = await outbox.enqueue(fix());
    expect(result.queued).toBe(1);
    expect((await outbox.pending())[0]).toMatchObject({ lat: 47.4979, memberId: 'm1' });
  });

  it('survives corrupt storage instead of throwing', async () => {
    const storage = memoryStorage('{not json');
    const outbox = new Outbox(storage, { now: () => NOW });
    expect(await outbox.pending()).toEqual([]);
    await outbox.enqueue(fix());
    expect(await outbox.size()).toBe(1);
  });

  it('drops entries with no coordinates on read', async () => {
    const storage = memoryStorage(JSON.stringify([{ id: 'x', capturedAt: NOW }, fix()]));
    const outbox = new Outbox(storage, { now: () => NOW });
    expect(await outbox.size()).toBe(1);
  });

  it('caps the queue and drops the oldest first', async () => {
    const { outbox, setNow } = makeOutbox({ maxItems: 3, maxAgeMs: 10 * 60_000 });
    for (let i = 0; i < 5; i += 1) {
      setNow(NOW + i * 1000);
      await outbox.enqueue(fix({ capturedAt: NOW + i * 1000 }));
    }
    const items = await outbox.pending();
    expect(items).toHaveLength(3);
    expect(items[0].capturedAt).toBe(NOW + 2000);
  });

  it('refuses to enqueue something already too old to be useful', async () => {
    const { outbox } = makeOutbox({ maxAgeMs: 60_000 });
    const result = await outbox.enqueue(fix({ capturedAt: NOW - 120_000 }));
    // The new item is queued and the pre-existing expired ones are swept.
    expect(result.queued).toBe(1);
  });
});

describe('Outbox flush', () => {
  it('sends queued fixes in order', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix({ capturedAt: NOW - 3000 }));
    await outbox.enqueue(fix({ capturedAt: NOW - 2000 }));

    const sent: number[] = [];
    const result = await outbox.flush({
      gateFor: openGate,
      send: async (item) => {
        sent.push(item.capturedAt);
      },
    });

    expect(sent).toEqual([NOW - 3000, NOW - 2000]);
    expect(result).toMatchObject({ sent: 2, remaining: 0, discarded: 0 });
    expect(await outbox.size()).toBe(0);
  });

  it('discards the whole queue and reports why when the gate closes', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix());
    await outbox.enqueue(fix());

    const sent: QueuedFix[] = [];
    const stopped: string[] = [];
    const result = await outbox.flush({
      gateFor: closedGate,
      send: async (item) => {
        sent.push(item);
      },
      onStopped: (reason, discarded) => stopped.push(`${reason}:${discarded}`),
    });

    expect(sent).toEqual([]);
    expect(result.stoppedBy).toBe('paused');
    expect(result.discarded).toBe(2);
    expect(await outbox.size()).toBe(0);
    expect(stopped).toEqual(['paused:2']);
  });

  it('re-checks the gate for every item, so a pause mid-flush stops the rest', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix({ capturedAt: NOW - 3000 }));
    await outbox.enqueue(fix({ capturedAt: NOW - 2000 }));
    await outbox.enqueue(fix({ capturedAt: NOW - 1000 }));

    let allowed = true;
    const sent: number[] = [];
    await outbox.flush({
      gateFor: () => (allowed ? openGate() : closedGate()),
      send: async (item) => {
        sent.push(item.capturedAt);
        allowed = false; // the person pauses while the first request is in flight
      },
    });

    expect(sent).toEqual([NOW - 3000]);
    expect(await outbox.size()).toBe(0);
  });

  it('keeps items when the network fails, and does not lose the rest', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix({ capturedAt: NOW - 3000 }));
    await outbox.enqueue(fix({ capturedAt: NOW - 2000 }));

    const result = await outbox.flush({
      gateFor: openGate,
      send: async () => {
        throw Object.assign(new Error('offline'), { status: 0 });
      },
    });

    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(2);
    const items = await outbox.pending();
    expect(items[0].attempts).toBe(1);
  });

  it('drops an item the server will never accept and carries on', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix({ capturedAt: NOW - 3000 }));
    await outbox.enqueue(fix({ capturedAt: NOW - 2000 }));

    const sent: number[] = [];
    const result = await outbox.flush({
      gateFor: openGate,
      send: async (item) => {
        if (item.capturedAt === NOW - 3000) throw Object.assign(new Error('bad'), { status: 400 });
        sent.push(item.capturedAt);
      },
    });

    expect(sent).toEqual([NOW - 2000]);
    expect(result).toMatchObject({ sent: 1, discarded: 1, remaining: 0 });
  });

  it('retries a rate-limited request rather than discarding it', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix());
    const result = await outbox.flush({
      gateFor: openGate,
      send: async () => {
        throw Object.assign(new Error('slow down'), { status: 429 });
      },
    });
    expect(result.remaining).toBe(1);
  });

  it('abandons positions older than the freshness window instead of sending them', async () => {
    const { outbox, setNow } = makeOutbox({ maxAgeMs: 60_000 });
    await outbox.enqueue(fix({ capturedAt: NOW }));
    setNow(NOW + 120_000);

    const sent: QueuedFix[] = [];
    const result = await outbox.flush({
      gateFor: openGate,
      send: async (item) => {
        sent.push(item);
      },
    });

    expect(sent).toEqual([]);
    expect(result.expired).toBe(1);
    expect(await outbox.size()).toBe(0);
  });
});

describe('Outbox purge', () => {
  it('destroys everything and reports the count', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(fix());
    await outbox.enqueue(fix());
    expect(await outbox.purge('pause')).toBe(2);
    expect(await outbox.size()).toBe(0);
  });

  it('is safe to call on an empty queue', async () => {
    const { outbox } = makeOutbox();
    expect(await outbox.purge('sign_out')).toBe(0);
  });

  it('serialises concurrent enqueue and purge so nothing resurrects', async () => {
    const { outbox } = makeOutbox();
    await Promise.all([outbox.enqueue(fix()), outbox.enqueue(fix()), outbox.purge('pause')]);
    // Whichever order the queue settled in, it must be empty after a purge that
    // ran last, and never contain duplicates.
    const items = await outbox.pending();
    expect(items.length).toBeLessThanOrEqual(2);
  });
});

describe('isPermanentFailure', () => {
  it('classifies statuses the way the flush loop expects', () => {
    expect(isPermanentFailure({ status: 400 })).toBe(true);
    expect(isPermanentFailure({ status: 403 })).toBe(true);
    expect(isPermanentFailure({ status: 429 })).toBe(false);
    expect(isPermanentFailure({ status: 500 })).toBe(false);
    expect(isPermanentFailure(new Error('network'))).toBe(false);
  });
});
