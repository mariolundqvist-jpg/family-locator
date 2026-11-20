/**
 * The single LocationController instance for the running JS context.
 *
 * Both the UI and the headless background task resolve the same object, so a
 * pause tapped in the app is the exact same state the task reads a second
 * later. `onChange` persists that state, which is what makes the gate survive
 * the app being killed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { postFix } from './api';
import { STORAGE_KEYS } from './config';
import { LocationController, type ControllerSnapshot } from './core/controller';
import { Outbox } from './core/outbox';
import type { TransmissionContext } from './core/types';
import { startWatch } from './location/native';
import { loadContext, saveContext } from './state/contextStore';

let instance: LocationController | null = null;
let booting: Promise<LocationController> | null = null;
let listeners = new Set<(s: ControllerSnapshot) => void>();

const asyncStorageAdapter = {
  async read() {
    return AsyncStorage.getItem(STORAGE_KEYS.outbox);
  },
  async write(value: string | null) {
    if (value === null) await AsyncStorage.removeItem(STORAGE_KEYS.outbox);
    else await AsyncStorage.setItem(STORAGE_KEYS.outbox, value);
  },
};

export function onControllerChange(fn: (s: ControllerSnapshot) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitAll(snapshot: ControllerSnapshot) {
  for (const fn of listeners) fn(snapshot);
  // Persist after notifying so the UI feels instant even if storage is slow.
  void saveContext(snapshot.context).catch(() => undefined);
}

/**
 * @param startWatcher false in a headless task: the OS is already delivering
 *   locations, and calling startLocationUpdatesAsync again would be a no-op at
 *   best and a duplicate service at worst.
 */
export async function getController(options: { startWatcher?: boolean } = {}): Promise<LocationController> {
  if (instance) return instance;
  if (booting) return booting;

  booting = (async () => {
    const context = await loadContext();
    const outbox = new Outbox(asyncStorageAdapter);
    const controller = new LocationController(
      {
        outbox,
        send: async (fix) => {
          await postFix({
            memberId: fix.memberId,
            lat: fix.lat,
            lng: fix.lng,
            accuracyM: fix.accuracyM,
            capturedAt: fix.capturedAt,
            source: fix.source,
          });
        },
        watch: (opts) =>
          options.startWatcher === false
            ? () => undefined
            : startWatch(opts),
        onChange: emitAll,
      },
      context as TransmissionContext,
    );
    instance = controller;
    return controller;
  })();

  return booting;
}

/** Test/teardown hook. */
export function resetControllerForTests(): void {
  instance = null;
  booting = null;
  listeners = new Set();
}
