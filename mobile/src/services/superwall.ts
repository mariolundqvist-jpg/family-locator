import Superwall from '@superwall/react-native-superwall';

const SUPERWALL_API_KEY = process.env.EXPO_PUBLIC_SUPERWALL_API_KEY ?? '';

let isConfigured = false;

/**
 * Initializes Superwall if an API key is available in environment.
 * Gracefully no-ops in local development, tests, or before the key is provided.
 */
export async function initSuperwall(): Promise<boolean> {
  if (!SUPERWALL_API_KEY) {
    return false;
  }
  if (isConfigured) return true;

  try {
    await Superwall.configure({ apiKey: SUPERWALL_API_KEY });
    isConfigured = true;
    return true;
  } catch (err) {
    console.warn('[Superwall] Configuration notice:', err);
    return false;
  }
}

/**
 * Registers a paywall placement trigger with Superwall.
 */
export async function triggerPaywall(placement: string = 'campaign_trigger'): Promise<void> {
  if (!isConfigured) {
    const ok = await initSuperwall();
    if (!ok) return;
  }
  try {
    await Superwall.shared.register({ placement });
  } catch (err) {
    console.warn('[Superwall] Register placement error:', err);
  }
}

/**
 * Links user ID to Superwall profile.
 */
export async function identifySuperwallUser(userId: string): Promise<void> {
  if (!isConfigured) return;
  try {
    await Superwall.shared.identify({ userId });
  } catch (err) {
    console.warn('[Superwall] Identify error:', err);
  }
}

/**
 * Resets user identification on logout.
 */
export async function resetSuperwall(): Promise<void> {
  if (!isConfigured) return;
  try {
    await Superwall.shared.reset();
  } catch (err) {
    console.warn('[Superwall] Reset error:', err);
  }
}
