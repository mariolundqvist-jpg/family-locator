/**
 * Build-time configuration.
 *
 * API_BASE must be an https origin in any build that leaves a developer machine.
 * The prototype server in ../server speaks plain HTTP for local development
 * only; Android blocks cleartext by default in release builds, which is a
 * useful accident.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8787';

/** Mirrors the server policy; the server remains authoritative. */
export const POLICY = {
  updateIntervalMs: 120_000,
  distanceIntervalM: 50,
  retentionMs: 15 * 60 * 1000,
  currentMaxMs: 120 * 1000,
  staleMaxMs: 15 * 60 * 1000,
};

export const TASK_NAME = 'safepath-background-location';

/** Default emergency dispatch number (e.g. 112 in EU, 911 in US/CA). */
export const DEFAULT_EMERGENCY_NUMBER =
  process.env.EXPO_PUBLIC_DEFAULT_EMERGENCY_NUMBER || '112';

/** Keys used in AsyncStorage. Never store a token here — keychain only. */
export const STORAGE_KEYS = {
  outbox: 'safepath.outbox.v1',
  context: 'safepath.context.v1',
  activeFamily: 'safepath.activeFamily.v1',
} as const;

/**
 * Set by the E2E harness so account records are identifiable and can be
 * deleted afterwards. Empty in normal builds.
 */
export const E2E_RUN_ID = process.env.EXPO_PUBLIC_E2E_RUN_ID ?? '';
