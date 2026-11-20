/**
 * Native location wiring.
 *
 * This file does not decide anything. It starts and stops an OS watcher and
 * forwards raw samples upward; the gate in core/sharing.ts decides what may
 * happen to them. Keeping the decision out of the native layer is what makes
 * the behaviour testable without a phone.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { POLICY, TASK_NAME } from '../config';
import type { Sample } from '../core/controller';
import { normaliseSamples } from '../core/samples';
import { bestEffortFix as bestEffortFixFromCache, primeFirstFix, toSample, watchSettings } from './gps';

export type WatchStartOptions = {
  background: boolean;
  onSample: (sample: Sample) => void;
};

const foregroundSubscriptions = new Set<Location.LocationSubscription>();

/** Android needs an explicit foreground service for a locked-screen watch. */
async function startBackgroundUpdates(onSample: (sample: Sample) => void): Promise<() => void> {
  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
  if (!alreadyRunning) {
    await Location.startLocationUpdatesAsync(TASK_NAME, {
      ...watchSettings,
      // Do not let the OS decide to pause. The person chose to share; the app
      // must be the thing that stops it, not a heuristic.
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: 'SafePath is sharing your position',
        notificationBody: 'Your group can see where you are. Tap to stop sharing.',
        notificationColor: '#1b6e5a',
        killServiceOnDestroy: false,
      },
    });
  }

  backgroundListener = onSample;

  return () => {
    backgroundListener = null;
    // Stopping the task is what removes the notification and the wakelock.
    void Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => undefined);
  };
}

/**
 * Module-level sink for the headless task. The task itself is defined in
 * backgroundTask.ts, which runs whether or not React has mounted.
 */
let backgroundListener: ((sample: Sample) => void) | null = null;

export function deliverBackgroundLocations(locations: Location.LocationObject[]): number {
  if (!backgroundListener) return 0;
  let delivered = 0;
  for (const sample of normaliseSamples(locations, 'background')) {
    backgroundListener(sample);
    delivered += 1;
  }
  return delivered;
}

export function startWatch({ background, onSample }: WatchStartOptions): () => void {
  let stopped = false;
  let teardown: (() => void) | null = null;

  if (background) {
    void startBackgroundUpdates(onSample).then((stop) => {
      if (stopped) stop();
      else teardown = stop;
    });
    return () => {
      stopped = true;
      if (teardown) teardown();
      teardown = null;
    };
  }

  // Ett fix direkt, så att gruppen inte står utan position i två minuter.
  void primeFirstFix('foreground', (sample) => {
    if (!stopped) onSample(sample);
  });

  void Location.watchPositionAsync(watchSettings, (loc) => {
    if (stopped) return;
    // Samma noggrannhetsgrind som bakgrunden: hellre ingen position än en
    // som ser exakt ut och är hundra meter fel.
    const sample = toSample(loc, 'foreground');
    if (sample) onSample(sample);
  })
    .then((sub) => {
      if (stopped) {
        sub.remove();
        return;
      }
      foregroundSubscriptions.add(sub);
      teardown = () => {
        foregroundSubscriptions.delete(sub);
        sub.remove();
      };
    })
    .catch(() => undefined);

  return () => {
    stopped = true;
    if (teardown) teardown();
    teardown = null;
  };
}

/** One reading, for the check-in button. Never starts a watcher. */
export async function readOnce(): Promise<Sample | null> {
  // Cachen används bara om den är yngre än en minut, annars mäts en ny.
  return bestEffortFixFromCache('checkin');
}

export async function isBackgroundTaskRegistered(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME).catch(() => false);
}

export function stopAllForegroundWatches(): void {
  for (const sub of foregroundSubscriptions) sub.remove();
  foregroundSubscriptions.clear();
}
