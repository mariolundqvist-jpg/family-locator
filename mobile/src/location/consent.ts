/**
 * Consent flow.
 *
 * The ordering here is the product's core promise, encoded:
 *
 *   not asked --> foreground granted --> (separate, explicit) background granted
 *
 * Background can never be entered from `not asked`, and revoking foreground
 * forces background to be withdrawn too. Nothing else in the app sets these
 * flags; they are derived from the OS permission state and the server record.
 *
 * Nothing in this file prompts on its own. Each function is called from a
 * button the person pressed, after copy that explains what will be shared.
 */
import * as Location from 'expo-location';
import { Alert } from 'react-native';

import { grantConsent } from '../api';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type ConsentState = {
  serverForeground: boolean;
  serverBackground: boolean;
  osForeground: PermissionStatus;
  osBackground: PermissionStatus;
  canAskForeground: boolean;
  canAskBackground: boolean;
};

export async function readConsent(server: {
  foreground: boolean;
  background: boolean;
}): Promise<ConsentState> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return {
    serverForeground: server.foreground,
    serverBackground: server.background,
    osForeground: fg.status as PermissionStatus,
    osBackground: bg.status as PermissionStatus,
    canAskForeground: fg.canAskAgain !== false,
    canAskBackground: bg.canAskAgain !== false,
  };
}

export type ConsentResult =
  | { ok: true; state: ConsentState }
  | { ok: false; step: 'foreground' | 'background'; reason: 'denied' | 'cannot_ask_again' | 'inconsistent' };

/** Explain optional background collection before the first OS location prompt. */
function confirmLocationDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Så använder SafePath din position',
      'SafePath samlar in din position för att dela den med medlemmarna i din valda grupp och för incheckning. Om du senare aktiverar bakgrundsdelning samlar SafePath in position även när appen är stängd eller inte används. Bakgrundsdelning är frivillig och kan stängas av.',
      [
        { text: 'Inte nu', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Fortsätt', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Step 1 — used when the person taps "Share my position". */
export async function askForeground(): Promise<ConsentResult> {
  const current = await Location.getForegroundPermissionsAsync();
  let status = current.status;
  if (status === 'undetermined') {
    if (!(await confirmLocationDisclosure())) return { ok: false, step: 'foreground', reason: 'denied' };
    status = (await Location.requestForegroundPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return {
      ok: false,
      step: 'foreground',
      reason: current.canAskAgain === false ? 'cannot_ask_again' : 'denied',
    };
  }
  // Record consent server-side only after the OS grant exists, so the two can
  // never disagree about whether sharing is lawful.
  await grantConsent('foreground', true);
  return { ok: true, state: await readConsent({ foreground: true, background: false }) };
}

/**
 * Step 2 — background. Reached only from the "keep updating when the screen is
 * locked" screen, which states the battery cost and the persistent notification
 * before the OS prompt appears.
 */
export async function askBackground(): Promise<ConsentResult> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, step: 'foreground', reason: 'inconsistent' };
  }

  const current = await Location.getBackgroundPermissionsAsync();
  let status = current.status;
  if (status === 'undetermined') {
    status = (await Location.requestBackgroundPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return {
      ok: false,
      step: 'background',
      reason: current.canAskAgain === false ? 'cannot_ask_again' : 'denied',
    };
  }
  await grantConsent('background', true);
  return { ok: true, state: await readConsent({ foreground: true, background: true }) };
}

/**
 * Withdraw everything. Order matters: background is withdrawn first so there is
 * never a moment where background is permitted but foreground is not.
 */
export async function revokeAll(): Promise<void> {
  await grantConsent('background', false);
  await grantConsent('foreground', false);
}

/** Copy shown before the OS asks. Kept here so tests can assert on it. */
export const CONSENT_COPY = {
  foreground: {
    title: 'Dela din position med din grupp',
    body:
      'Medan delningen är på skickar SafePath din senaste position till gruppen du gick med i, ' +
      'med tidpunkt och en noggrannhetsradie. Du väljer vilka som är med, och du kan sluta när som helst.',
    bullets: [
      'Bara personer i din grupp ser den.',
      'Positionen ersätts när nya mätningar kommer — ingen historik sparas.',
      'Paus stoppar insamlingen direkt, även det som ännu inte skickats.',
    ],
  },
  background: {
    title: 'Fortsätt dela när skärmen är låst',
    body:
      'Det här är frivilligt. Om du slår på det fortsätter SafePath uppdatera din position även när ' +
      'appen är i bakgrunden eller telefonen är låst, och Android visar en ständig avisering.',
    bullets: [
      'Det drar mer batteri än att bara dela medan appen är öppen.',
      'Uppdateringar i låst läge kan fördröjas eller stoppas av telefontillverkaren.',
      'Slår du av det delar appen bara medan den är öppen.',
    ],
    warning: 'SafePath är ingen nödtjänst och garanterar inte att uppdateringar kommer fram.',
  },
} as const;
