/**
 * Bättre GPS.
 *
 * Appen använder Android Fused Location Provider (Googles blandade
 * GPS + wifi + mobilnät) och inte en rå GPS-lyssnare. Skillnaden är stor i
 * praktiken: en kall GPS-start kan ta 30–60 sekunder och ge 50–150 m fel, medan
 * den blandade källan svarar på under en sekund och ofta inom 10–30 m när
 * telefonen nyligen vetat var den är.
 *
 * Tre saker görs dessutom som `expo-location` inte gör själv:
 *
 *   1. Ett första fix hämtas innan lyssnaren startar, så att gruppen ser en
 *      position direkt i stället för efter två minuter.
 *   2. Fix med dålig noggrannhet (< 200 m) kastas. En gissning på 500 m är
 *      värre än ingen position: den ser exakt ut och är fel.
 *   3. Vid köldstart accepteras ett äldre cachat fix bara om det är färskt —
 *      annars visas en position från i går som om den vore nu.
 *
 * Allt som avgör *om* en position får skickas ligger kvar i core/, oförändrat.
 * Den här filen får bara göra mätningen bättre, aldrig öppna grinden.
 */
import * as Location from 'expo-location';

import { POLICY } from '../config';
import type { Sample } from '../core/controller';
import { MAX_ACCURACY_M, decideFix } from '../core/gpsQuality';
import type { FixSource } from '../core/types';

export { MAX_ACCURACY_M };

/** Ett cachat fix får användas vid köldstart bara om det är yngre än så här. */
const MAX_CACHE_AGE_MS = 60_000;

/** Hur länge vi väntar på ett första fix innan lyssnaren tar över. */
const FIRST_FIX_TIMEOUT_MS = 8_000;

export type LatLng = { lat: number; lng: number };

export function toSample(
  position: Location.LocationObject | null | undefined,
  source: FixSource,
  now: number = Date.now(),
): Sample | null {
  if (!position) return null;
  const decision = decideFix(
    {
      lat: position.coords?.latitude,
      lng: position.coords?.longitude,
      accuracyM: position.coords?.accuracy,
      capturedAt: position.timestamp,
    },
    now,
  );
  if (!decision.ok) return null;

  // Grinden i core/ avgör fortfarande *om* positionen får skickas. Den här
  // funktionen avgör bara om mätningen är bra nog att bli en position.
  return {
    lat: decision.lat,
    lng: decision.lng,
    accuracyM: decision.accuracyM,
    capturedAt: decision.capturedAt,
    source,
  };
}

/**
 * Det bästa fix som redan finns på telefonen: senast kända om det är färskt,
 * annars ett nytt med kort tidsgräns. Returnerar null i stället för att gissa.
 */
export async function bestEffortFix(source: FixSource = 'foreground'): Promise<Sample | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: MAX_CACHE_AGE_MS, requiredAccuracy: MAX_ACCURACY_M });
    if (last) {
      const sample = toSample(last, source);
      if (sample) return sample;
    }
  } catch {
    // Ingen cache är inget fel — gå vidare till en färsk mätning.
  }

  try {
    const fresh = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    return toSample(fresh, source);
  } catch {
    return null;
  }
}

/**
 * Snabbstart: ger ett första fix till UI:t utan att blockera längre än
 * FIRST_FIX_TIMEOUT_MS. Lyssnaren kan startas direkt efteråt.
 */
export async function primeFirstFix(source: FixSource, onSample: (sample: Sample) => void): Promise<void> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_FIX_TIMEOUT_MS));
  const sample = await Promise.race([bestEffortFix(source), timeout]);
  if (sample) onSample(sample);
}

/** Inställningarna som både förgrunds- och bakgrundslyssnaren använder. */
export const watchSettings = {
  accuracy: Location.Accuracy.High,
  // Två minuter och 50 m: en familj behöver inte veta var någon står, bara var
  // de är på väg. Tätare uppdateringar kostar batteri utan att ge trygghet.
  timeInterval: POLICY.updateIntervalMs,
  distanceInterval: POLICY.distanceIntervalM,
  pausesUpdatesAutomatically: false,
  mayShowUserSettingsDialog: true,
} as const;
