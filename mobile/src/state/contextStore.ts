/**
 * Persisted gate context.
 *
 * The headless background task can run with no UI and no memory of what the
 * person chose. Without this file it would have to guess, and guessing "on"
 * after a pause would be covert tracking. The context holds only booleans and
 * identifiers — never a token, never a coordinate.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../config';
import type { TransmissionContext } from '../core/types';

export const DEFAULT_CONTEXT: TransmissionContext = {
  signedIn: false,
  memberId: '',
  sharingState: 'off',
  memberRemoved: false,
  foregroundConsent: false,
  backgroundConsent: false,
  serverRevoked: false,
};

export async function loadContext(): Promise<TransmissionContext> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.context);
    if (!raw) return { ...DEFAULT_CONTEXT };
    const parsed = JSON.parse(raw) as Partial<TransmissionContext>;
    return { ...DEFAULT_CONTEXT, ...parsed };
  } catch {
    // A corrupt context must fail closed.
    return { ...DEFAULT_CONTEXT };
  }
}

export async function saveContext(context: TransmissionContext): Promise<void> {
  const safe: TransmissionContext = {
    signedIn: Boolean(context.signedIn),
    memberId: context.memberId ?? '',
    sharingState: context.sharingState,
    memberRemoved: Boolean(context.memberRemoved),
    foregroundConsent: Boolean(context.foregroundConsent),
    backgroundConsent: Boolean(context.backgroundConsent),
    serverRevoked: Boolean(context.serverRevoked),
  };
  await AsyncStorage.setItem(STORAGE_KEYS.context, JSON.stringify(safe));
}

export async function clearContext(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.context);
}
