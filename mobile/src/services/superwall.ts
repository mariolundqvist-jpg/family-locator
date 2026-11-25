export const STORE_PRODUCTS = {
  monthly: 'monthly',
  yearly: 'yearly',
} as const;

export type StoreProductKey = keyof typeof STORE_PRODUCTS;

const SUPERWALL_API_KEY = process.env.EXPO_PUBLIC_SUPERWALL_API_KEY ?? '';

let isConfigured = false;
let superwall: typeof import('expo-superwall').SuperwallExpoModule | null = null;

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
    // The package resolves its native module at import time. Loading it only
    // when configured prevents an absent/stale native module crashing startup.
    superwall = require('expo-superwall').SuperwallExpoModule;
    if (!superwall) return false;
    await superwall.configure(SUPERWALL_API_KEY);
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
    await superwall!.registerPlacement(placement);
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
    await superwall!.identify(userId);
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
    await superwall!.reset();
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
    return await superwall!.purchase(productId);
  } catch (err) {
    console.warn('[Superwall] Purchase error:', err);
    return null;
  }
}

/**
 * Restores store purchases via Superwall / StoreKit.
 */
export async function restoreStorePurchases() {
  if (!isConfigured) return null;
  try {
    return await superwall!.restorePurchases();
  } catch (err) {
    console.warn('[Superwall] Restore error:', err);
    return null;
  }
}
