/**
 * Headless background task definition.
 *
 * Must be imported before React mounts (App.tsx imports it first, and index.ts
 * re-imports it) because Android can launch the JS runtime with no UI at all
 * after a reboot, or when the app is killed while a watch is running.
 *
 * Two delivery paths, because the task runs in two very different worlds:
 *
 *   1. **App alive** — `native.ts` has already registered a listener that feeds
 *      the running controller. Fast path, no re-import.
 *   2. **App dead** — there is no listener and no React tree. The task resolves
 *      the controller itself, without starting a watcher (the OS is already
 *      delivering locations), and pushes each fix through the same gate. If the
 *      person paused, signed out or was removed while the app was closed, the
 *      persisted context says so and the fix is discarded.
 *
 * Path 2 is the one that matters for the product promise: it is the path where
 * a stale permission could otherwise keep sending someone's position.
 */
import * as TaskManager from 'expo-task-manager';

import { TASK_NAME } from '../config';
import { getController } from '../controller';
import { normaliseSamples, type RawLocation } from '../core/samples';
import { deliverBackgroundLocations } from './native';

type TaskData = { locations?: unknown[] };
type TaskError = { message?: string } | null;

async function handleHeadless(locations: RawLocation[]): Promise<void> {
  // startWatcher: false — the OS is already running the updates service, and
  // calling startLocationUpdatesAsync again from here would be a no-op at best.
  const controller = await getController({ startWatcher: false });

  // Malformed fixes are dropped by the tested normaliser, not repaired here.
  for (const sample of normaliseSamples(locations, 'background')) {
    await controller.handleSample(sample);
  }
}

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }: { data: TaskData; error: TaskError }) => {
    if (error) return;

    const locations = ((data?.locations ?? []) as RawLocation[]).filter(Boolean);
    if (!locations.length) return;

    const delivered = deliverBackgroundLocations(locations as never);

    // Nothing consumed them: the app is not running, so take the headless path.
    if (delivered === 0) await handleHeadless(locations);
  });
}

export const BACKGROUND_TASK_DEFINED = true;
