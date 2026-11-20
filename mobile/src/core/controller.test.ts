/**
 * Behavioural tests for the controller.
 *
 * Each test names a promise made to the user and asserts the mechanism that
 * keeps it. The fake watcher records whether the OS watcher would be running,
 * which is the difference between "we stopped sending" and "we stopped
 * collecting".
 */
import { LocationController, type Sample, type WatchOptions } from './controller';
import { Outbox, memoryStorage } from './outbox';
import type { Fix, GateResult, TransmissionContext } from './types';

const NOW = 1_700_000_000_000;

const ON: TransmissionContext = {
  signedIn: true,
  memberId: 'm1',
  sharingState: 'on',
  memberRemoved: false,
  foregroundConsent: true,
  backgroundConsent: false,
  serverRevoked: false,
};

type Harness = Awaited<ReturnType<typeof build>>;

async function build(options: { context?: Partial<TransmissionContext>; sendable?: boolean } = {}) {
  let clock = NOW;
  const outbox = new Outbox(memoryStorage(), {
    now: () => clock,
    newId: (() => {
      let i = 0;
      return () => `q${++i}`;
    })(),
  });

  const watchers: { options: WatchOptions; stopped: boolean }[] = [];
  const sent: Fix[] = [];
  const rejections: (Error | null)[] = [];
  let watcherCount = 0;

  const controller = new LocationController(
    {
      outbox,
      send: async (fix) => {
        const rejection = rejections.shift();
        if (rejection) throw rejection;
        sent.push(fix);
      },
      watch: (opts) => {
        watcherCount += 1;
        const entry = { options: opts, stopped: false };
        watchers.push(entry);
        return () => {
          entry.stopped = true;
        };
      },
    },
    { ...ON, ...options.context },
  );

  return {
    controller,
    outbox,
    watchers,
    sent,
    rejections,
    get watcherCount() {
      return watcherCount;
    },
    get activeWatcher() {
      return watchers.filter((w) => !w.stopped).at(-1) ?? null;
    },
    setNow: (t: number) => {
      clock = t;
    },
    sample(overrides: Partial<Sample> = {}): Sample {
      return {
        lat: 47.4979,
        lng: 19.0402,
        accuracyM: 10,
        capturedAt: clock,
        source: 'foreground',
        ...overrides,
      };
    },
  };
}

describe('starting and stopping collection', () => {
  it('does not watch until sharing is actually on', async () => {
    const h = await build({ context: { sharingState: 'off' } });
    expect(h.controller.isWatching()).toBe(false);
    await h.controller.setSharingState('on');
    expect(h.controller.isWatching()).toBe(true);
  });

  it('starts a foreground watch when only foreground consent exists', async () => {
    const h = await build();
    await h.controller.setContext({});
    expect(h.activeWatcher?.options.background).toBe(false);
  });

  it('prefers a background watch once background consent exists', async () => {
    const h = await build({ context: { backgroundConsent: true } });
    await h.controller.setContext({});
    expect(h.activeWatcher?.options.background).toBe(true);
  });

  it('does not start a watcher without consent, even if sharing says on', async () => {
    const h = await build({ context: { foregroundConsent: false, sharingState: 'on' } });
    await h.controller.setContext({});
    expect(h.controller.isWatching()).toBe(false);
  });
});

describe('pause', () => {
  it('stops the OS watcher', async () => {
    const h = await build();
    await h.controller.setContext({});
    expect(h.controller.isWatching()).toBe(true);

    await h.controller.pause();
    expect(h.controller.isWatching()).toBe(false);
    expect(h.activeWatcher).toBeNull();
  });

  it('destroys queued positions rather than holding them for later', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());
    expect(await h.outbox.size()).toBe(1);

    const destroyed = await h.controller.pause();
    expect(destroyed).toBe(1);
    expect(await h.outbox.size()).toBe(0);
  });

  it('sends nothing afterwards, even if a flush is triggered', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());

    await h.controller.pause();
    h.sent.length = 0;
    const result = await h.controller.flush();

    expect(h.sent).toEqual([]);
    expect(result.sent).toBe(0);
  });

  it('drops a straggler sample that arrives after the pause', async () => {
    const h = await build();
    await h.controller.setContext({});
    await h.controller.pause();
    const outcome = await h.controller.handleSample(h.sample());
    expect(outcome).toBe('dropped');
    expect(await h.outbox.size()).toBe(0);
    expect(h.sent).toEqual([]);
  });
});

describe('sign-out, removal and leaving', () => {
  it('sign-out stops the watcher and empties the queue', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());

    await h.controller.signOut();
    expect(h.controller.isWatching()).toBe(false);
    expect(await h.outbox.size()).toBe(0);
  });

  it('being removed from the group stops everything immediately', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());

    await h.controller.markRemoved();
    expect(h.controller.isWatching()).toBe(false);
    expect(await h.outbox.size()).toBe(0);
    expect(h.sent).toEqual([]);
  });

  it('a 403 from the server tears the membership down instead of retrying', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('forbidden'), { status: 403 }));

    const outcome = await h.controller.handleSample(h.sample());
    expect(outcome).toBe('dropped');
    expect(h.controller.snapshot().context.serverRevoked).toBe(true);
    expect(h.controller.isWatching()).toBe(false);
    expect(await h.outbox.size()).toBe(0);
  });

  it('leaving the group purges the queue', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());
    await h.controller.shutdown('left_group');
    expect(await h.outbox.size()).toBe(0);
    expect(h.controller.isWatching()).toBe(false);
  });
});

describe('consent withdrawal', () => {
  it('stops collection and destroys queued positions', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());

    await h.controller.withdrawConsent();
    expect(h.controller.isWatching()).toBe(false);
    expect(await h.outbox.size()).toBe(0);
    expect(h.controller.snapshot().lastGate.reason).toBe('consent_withdrawn');
  });

  it('blocks a check-in once consent is gone', async () => {
    const h = await build();
    await h.controller.withdrawConsent();
    const outcome = await h.controller.handleSample(h.sample({ source: 'checkin' }));
    expect(outcome).toBe('dropped');
    expect(h.sent).toEqual([]);
  });
});

describe('sending', () => {
  it('sends a fix when the gate is open and the network works', async () => {
    const h = await build();
    await h.controller.setContext({});
    const outcome = await h.controller.handleSample(h.sample());
    expect(outcome).toBe('sent');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ memberId: 'm1', lat: 47.4979, source: 'foreground' });
    expect(await h.outbox.size()).toBe(0);
  });

  it('queues a fix when the network is down and sends it on the next flush', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    const outcome = await h.controller.handleSample(h.sample());
    expect(outcome).toBe('queued');
    expect(await h.outbox.size()).toBe(1);

    const result = await h.controller.flush();
    expect(result.sent).toBe(1);
    expect(h.sent).toHaveLength(1);
    expect(await h.outbox.size()).toBe(0);
  });

  it('never sends queue bookkeeping fields to the server', async () => {
    const h = await build();
    await h.controller.setContext({});
    h.rejections.push(Object.assign(new Error('offline'), { status: 0 }));
    await h.controller.handleSample(h.sample());
    await h.controller.flush();
    expect(Object.keys(h.sent[0]).sort()).toEqual(
      ['accuracyM', 'capturedAt', 'lat', 'lng', 'memberId', 'source'].sort(),
    );
  });

  it('ignores a sample with no usable coordinates', async () => {
    const h = await build();
    await h.controller.setContext({});
    const outcome = await h.controller.handleSample(h.sample({ lat: Number.NaN }));
    expect(outcome).toBe('dropped');
    expect(await h.outbox.size()).toBe(0);
  });

  it('allows a one-off check-in while sharing is paused, without resuming a watcher', async () => {
    const h = await build();
    await h.controller.pause();
    expect(h.controller.isWatching()).toBe(false);

    const outcome = await h.controller.handleSample(h.sample({ source: 'checkin' }));
    expect(outcome).toBe('sent');
    expect(h.sent).toHaveLength(1);
    expect(h.controller.isWatching()).toBe(false);
  });

  it('drops a background sample when background consent is absent', async () => {
    const h = await build();
    await h.controller.setContext({});
    const outcome = await h.controller.handleSample(h.sample({ source: 'background' }));
    expect(outcome).toBe('dropped');
    expect(h.sent).toEqual([]);
  });
});

describe('recovery', () => {
  it('resumes cleanly after a pause when sharing is turned back on', async () => {
    const h = await build();
    await h.controller.setContext({});
    await h.controller.pause();
    expect(h.controller.isWatching()).toBe(false);

    await h.controller.setSharingState('on');
    expect(h.controller.isWatching()).toBe(true);
    const outcome = await h.controller.handleSample(h.sample());
    expect(outcome).toBe('sent');
  });

  it('does not restart a watcher on a no-op context update', async () => {
    const h = await build();
    await h.controller.setContext({});
    const first = h.watcherCount;
    await h.controller.setContext({});
    expect(h.watcherCount).toBe(first);
  });
});

describe('gate reporting', () => {
  it('records the reason the last fix was refused, for the UI to explain', async () => {
    const h = await build({ context: { sharingState: 'off' } });
    await h.controller.setContext({});
    const gate: GateResult = h.controller.snapshot().lastGate;
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('not_sharing');
  });
});
