import { SuperwallExpoModule } from 'expo-superwall';

export const STORE_PRODUCTS = {
  small4: 'app.safepath.plan.small4',
  medium6: 'app.safepath.plan.medium6',
  large8: 'app.safepath.plan.large8',
} as const;

export const PLAN_TO_STORE_PRODUCT: Record<'small_4' | 'medium_6' | 'large_8', string> = {
  small_4: STORE_PRODUCTS.small4,
  medium_6: STORE_PRODUCTS.medium6,
  large_8: STORE_PRODUCTS.large8,
};

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
    await SuperwallExpoModule.configure(SUPERWALL_API_KEY);
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
    await SuperwallExpoModule.registerPlacement(placement);
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
    await SuperwallExpoModule.identify(userId);
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
    await SuperwallExpoModule.reset();
  } catch (err) {
    console.warn('[Superwall] Reset error:', err);
  }
}

/**
 * Purchases a store product via Superwall / StoreKit.
 */
export async function purchaseStoreProduct(productId: string) {
  if (!isConfigured) return null;
  try {
    return await SuperwallExpoModule.purchase(productId);
  } catch (err) {
    console.warn('[Superwall] Purchase error:', err);
    return null;
  }
}
