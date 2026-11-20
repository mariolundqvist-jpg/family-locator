/**
 * Vilka mätningar som får bli en position.
 *
 * Ren logik utan React eller inbyggda moduler, av samma skäl som resten av
 * `core/`: regeln ska kunna köras och testas på Node utan telefon. Den körs
 * dessutom i den huvudlösa bakgrundstjänsten, där det inte finns någon skärm att
 * visa en varning på — därför kastas dåliga mätningar i stället för att rättas.
 */

/** Sämre noggrannhet än så här sparas ingen position. */
export const MAX_ACCURACY_M = 200;

/** Ett mätvärde från framtiden betyder att klockan går fel. */
export const MAX_CLOCK_SKEW_MS = 5_000;

export type RawFix = {
  lat: unknown;
  lng: unknown;
  accuracyM: unknown;
  capturedAt: unknown;
};

export type FixRejection =
  | 'missing'
  | 'out_of_range'
  | 'null_island'
  | 'bad_time'
  | 'clock_ahead'
  | 'too_imprecise';

export type FixDecision =
  | { ok: true; lat: number; lng: number; accuracyM: number; capturedAt: number }
  | { ok: false; reason: FixRejection };

/**
 * Avgör om en mätning får användas.
 *
 * Ordningen spelar roll: en koordinat utanför jorden avvisas innan vi pratar om
 * noggrannhet, eftersom felmeddelandet annars blir missvisande.
 */
export function decideFix(raw: RawFix | null | undefined, now: number = Date.now()): FixDecision {
  if (!raw) return { ok: false, reason: 'missing' };

  const { lat, lng, accuracyM, capturedAt } = raw;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'missing' };
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: 'out_of_range' };
  // 0,0 ligger i Atlanten och är nästan alltid en platshållare för "ingen fix".
  if (lat === 0 && lng === 0) return { ok: false, reason: 'null_island' };

  if (typeof capturedAt !== 'number' || !Number.isFinite(capturedAt)) return { ok: false, reason: 'bad_time' };
  if (capturedAt > now + MAX_CLOCK_SKEW_MS) return { ok: false, reason: 'clock_ahead' };

  // Saknad noggrannhet behandlas som okänd, inte som perfekt — men den får inte
  // bli en position som ser exakt ut. Vi kräver ett värde och ett rimligt sådant.
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return { ok: false, reason: 'too_imprecise' };
  }
  if (accuracyM > MAX_ACCURACY_M) return { ok: false, reason: 'too_imprecise' };

  return { ok: true, lat, lng, accuracyM: Math.round(accuracyM), capturedAt };
}

/** Kort svensk förklaring, för den skärm som behöver säga varför inget visas. */
export function explainRejection(reason: FixRejection): string {
  switch (reason) {
    case 'too_imprecise':
      return 'Mätningen var för oprecis. Gå ut eller stå närmare ett fönster och försök igen.';
    case 'clock_ahead':
      return 'Telefonens klocka går fel, så positionen kan inte användas.';
    case 'out_of_range':
    case 'null_island':
      return 'Telefonen lämnade ingen giltig position.';
    case 'bad_time':
      return 'Mätningen saknade tidpunkt och kan därför inte visas.';
    default:
      return 'Ingen position tillgänglig.';
  }
}
