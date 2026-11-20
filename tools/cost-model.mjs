#!/usr/bin/env node
/**
 * Operating cost model: cost per active family per month.
 *
 * Every figure below is an INPUT you can change. The published list prices these
 * constants are based on were not re-verified against provider price pages while
 * writing this file, so treat each one as an assumption to confirm before any
 * budget is committed. Nothing here is a quote.
 *
 * Run: node tools/cost-model.mjs
 *      node tools/cost-model.mjs --json
 */
import fs from 'node:fs';

const INPUT = {
  fx: { gbpPerUsd: 0.79, note: 'GBP per USD; restate before use' },

  // Fleet sizes to model.
  scales: [100, 1000, 10000],

  // Household shape.
  adultsPerFamily: 2.1,
  adultsSharingShare: 0.65,        // share of adults who keep sharing switched on

  // Foreground-only behaviour (what the prototype does).
  fg: {
    sessionsPerDay: 3.0,           // times the app is opened and left open
    sessionMinutes: 9,
    updateIntervalSec: 30,
    pollIntervalSec: 10,           // other families' positions while open
    bytesPerResponse: 2600,        // JSON for a 3-person family
  },

  // Background-enabled behaviour (native app; NOT built or verified here).
  bg: {
    hoursPerDay: 14,               // waking hours with background updates on
    updateIntervalSec: 120,        // OS-batched, adaptive
    enabledShare: 0.55,
  },

  // Prices (USD). Confirm before committing.
  price: {
    computePerVcpuHour: 0.024,     // small shared container
    vmBaselineMonthly: 7.00,       // one small always-on instance
    dbBaselineMonthly: 18.00,      // managed Postgres, small
    dbStoragePerGbMonthly: 0.115,
    egressPerGb: 0.09,
    emailPer1000: 1.00,            // transactional email (sign-in codes)
    pushPerMillion: 0.50,          // FCM is free at this volume; kept non-zero
    mapMauFirst25k: 0,             // map SDK free tier
    mapPerMauAfter: 0.0005,        // $0.50 / 1,000 MAU indicative
    observabilityMonthly: 0,       // free tier at prototype scale
    onCallRetainerMonthly: 0,      // excluded: people cost is not infra cost
  },

  // Unit costs of the *other* things a run-rate needs, ex-infra.
  run: {
    dpoHoursPerMonth: 2,
    dpoHourlyRate: 95,             // GBP
    supportMinutesPerFamilyMonth: 0.6,
    supportHourlyRate: 25,         // GBP
    supportEmailCost: 0,           // in minutes-per-family above
  },
};

function monthlyUnits(scale, mode) {
  const families = scale;
  const adults = families * INPUT.adultsPerFamily;
  const sharingAdults = adults * INPUT.adultsSharingShare;

  let writes;
  let reads;
  let egressBytes;
  if (mode === 'foreground') {
    const { sessionsPerDay, sessionMinutes, updateIntervalSec, pollIntervalSec, bytesPerResponse } = INPUT.fg;
    const sessionSec = sessionMinutes * 60;
    const updatesPerSession = sessionSec / updateIntervalSec;
    writes = families * sharingAdults / families * sessionsPerDay * updatesPerSession * 30;
    // One poll returns the whole family view; count polls per *person*, not
    // per family per person (that double count exaggerated egress 100x).
    const pollsPerSession = sessionSec / pollIntervalSec;
    reads = adults * sessionsPerDay * pollsPerSession * 30;
    egressBytes = reads * bytesPerResponse;
  } else {
    const { hoursPerDay, updateIntervalSec, enabledShare } = INPUT.bg;
    const bgAdults = adults * enabledShare;
    writes = bgAdults * (hoursPerDay * 3600) / updateIntervalSec * 30;
    reads = adults * INPUT.fg.sessionsPerDay * (INPUT.fg.sessionMinutes * 60) / INPUT.fg.pollIntervalSec * 30;
    egressBytes = reads * INPUT.fg.bytesPerResponse;
  }

  const emails = families * 2.2;                 // sign-in attempts per family per month
  const pushes = families * 0.8 * adults;        // occasional nudges
  const dbStorageGb = 0.02;                      // last-known positions only
  const mapMau = adults;

  return {
    families, adults, sharingAdults, writes, reads, egressBytes, emails, pushes, dbStorageGb, mapMau,
  };
}

function costFor(scale, mode) {
  const u = monthlyUnits(scale, mode);
  const p = INPUT.price;

  const vcpuScale = Math.max(1, Math.ceil(scale / 1200));   // one vCPU carries ~1,200 families
  const compute = p.vmBaselineMonthly * vcpuScale;
  const db = p.dbBaselineMonthly + u.dbStorageGb * p.dbStoragePerGbMonthly;
  const egressGb = u.egressBytes / 1e9;
  const egress = egressGb * p.egressPerGb;
  const email = (u.emails / 1000) * p.emailPer1000;
  const push = (u.pushes / 1_000_000) * p.pushPerMillion;
  const maps = u.mapMau > 25000
    ? (u.mapMau - 25000) * p.mapPerMauAfter
    : p.mapMauFirst25k;
  const observability = p.observabilityMonthly;
  const onCall = p.onCallRetainerMonthly;

  const infraUsd = compute + db + egress + email + push + maps + observability + onCall;
  const infraGbp = infraUsd * INPUT.fx.gbpPerUsd;

  const dpoGbp = INPUT.run.dpoHoursPerMonth * INPUT.run.dpoHourlyRate;
  const supportGbp = (INPUT.run.supportMinutesPerFamilyMonth / 60) * INPUT.run.supportHourlyRate * scale;
  const totalGbp = infraGbp + dpoGbp + supportGbp;

  return {
    scale,
    mode,
    units: u,
    breakdownUsd: { compute, db, egress, email, push, maps, observability, onCall },
    infraGbp,
    dpoGbp,
    supportGbp,
    totalGbp,
    perFamilyInfraGbp: infraGbp / scale,
    perFamilyTotalGbp: totalGbp / scale,
    writesPerFamily: u.writes / scale,
  };
}

const rows = [];
for (const scale of INPUT.scales) {
  for (const mode of ['foreground', 'background']) {
    rows.push(costFor(scale, mode));
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ input: INPUT, rows }, null, 2));
} else {
  const gbp = (n) => `£${n.toFixed(2)}`;
  console.log('SafePath — operating cost model');
  console.log(`FX: £1 = $${(1 / INPUT.fx.gbpPerUsd).toFixed(3)}  (vendors priced in USD)`);
  console.log('');
  console.log('Per active family per month');
  console.log('──────────────────────────────────────────────────────────────────────────────');
  console.log('scale   mode         writes/family/mo   infra/family   +DPO+support   total');
  console.log('──────────────────────────────────────────────────────────────────────────────');
  for (const r of rows) {
    console.log(
      `${String(r.scale).padStart(5)}   ${r.mode.padEnd(11)}  ${String(Math.round(r.writesPerFamily)).padStart(16)}   `
      + `${gbp(r.perFamilyInfraGbp).padStart(12)}   ${gbp(r.perFamilyTotalGbp).padStart(12)}   ${gbp(r.perFamilyTotalGbp)}`,
    );
  }
  console.log('');
  console.log('Monthly totals');
  console.log('──────────────────────────────────────────────────────────────────────────────');
  for (const r of rows) {
    const b = r.breakdownUsd;
    console.log(
      `${String(r.scale).padStart(5)} ${r.mode.padEnd(11)} total ${gbp(r.totalGbp).padStart(9)}  `
      + `[compute ${gbp(b.compute * INPUT.fx.gbpPerUsd)}, db ${gbp(b.db * INPUT.fx.gbpPerUsd)}, `
      + `egress ${gbp(b.egress * INPUT.fx.gbpPerUsd)}, email ${gbp(b.email * INPUT.fx.gbpPerUsd)}, `
      + `push ${gbp(b.push * INPUT.fx.gbpPerUsd)}]`,
    );
  }
  console.log('');
  console.log('Notes');
  console.log('  · "infra/family" is the metered cloud + email + push + map cost only.');
  console.log('  · The DPO and support lines are people costs, held constant across scale for the DPO');
  console.log('    and linear in families for support. They dominate below ~1,000 families.');
  console.log('  · Background mode multiplies write volume. That is the main cost consequence of');
  console.log('    turning on continuous updates, and it has not been measured on a real device.');
  console.log('  · No figure here has been confirmed against a current provider price list.');
}
