# Operating cost per active family

**Model:** `tools/cost-model.mjs` — every input is an editable constant.
**Run:** `node tools/cost-model.mjs` (or `--json`)

> **Read this first.** These are *modelled* costs built from indicative list prices.
> No provider price page was checked while writing them and **no invoice has been
> paid**. Treat the shape of the answer as useful and the exact figures as unconfirmed.

## Results

```
SafePath — operating cost model
FX: £1 = $1.266  (vendors priced in USD)

Per active family per month
──────────────────────────────────────────────────────────────────────────────
scale   mode         writes/family/mo   infra/family   +DPO+support   total
──────────────────────────────────────────────────────────────────────────────
  100   foreground               2211          £0.20          £2.35   £2.35
  100   background              14553          £0.20          £2.35   £2.35
 1000   foreground               2211          £0.02          £0.46   £0.46
 1000   background              14553          £0.02          £0.46   £0.46
10000   foreground               2211          £0.02          £0.29   £0.29
10000   background              14553          £0.02          £0.29   £0.29

Monthly totals
──────────────────────────────────────────────────────────────────────────────
  100 foreground  total   £235.12  [compute £5.53, db £14.22, egress £0.19, email £0.17, push £0.01]
  100 background  total   £235.12  [compute £5.53, db £14.22, egress £0.19, email £0.17, push £0.01]
 1000 foreground  total   £464.04  [compute £5.53, db £14.22, egress £1.89, email £1.74, push £0.66]
 1000 background  total   £464.04  [compute £5.53, db £14.22, egress £1.89, email £1.74, push £0.66]
10000 foreground  total  £2856.60  [compute £49.77, db £14.22, egress £18.87, email £17.38, push £66.36]
10000 background  total  £2856.60  [compute £49.77, db £14.22, egress £18.87, email £17.38, push £66.36]

Notes
  · "infra/family" is the metered cloud + email + push + map cost only.
  · The DPO and support lines are people costs, held constant across scale for the DPO
    and linear in families for support. They dominate below ~1,000 families.
  · Background mode multiplies write volume. That is the main cost consequence of
    turning on continuous updates, and it has not been measured on a real device.
  · No figure here has been confirmed against a current provider price list.
```

## Reading the numbers

**Infrastructure is not the cost driver.** At every modelled scale, metered
infrastructure is between £0.02 and £0.20 per active family per month. Even with
background updates — which raise write volume roughly sevenfold — the per-family
infrastructure cost does not move much, because the workload is tiny and the fixed
baseline dominates until well past 10,000 families.

**People are the cost driver.** The right-hand column adds a two-hour-per-month DPO
retainer (£190/month flat) and 0.6 minutes of support per family per month:

| Scale | Infrastructure | + DPO + support | What dominates |
| --- | --- | --- | --- |
| 100 families | £0.20 | **£2.35** | The fixed DPO retainer, spread over few families |
| 1,000 families | £0.02 | **£0.46** | Support minutes |
| 10,000 families | £0.02 | **£0.29** | Support minutes |

The practical conclusion: **this product can be run for pennies per family, and
cannot be run for pennies per family until it has enough families.** The fixed cost of
being accountable for other people's location data is about £190/month, whether there
are 10 families or 10,000.

## What is not in this model

| Excluded | Why it matters |
| --- | --- |
| Salaries / founder time | The largest real cost. Not infra. |
| App store fees | 15–30% of revenue, not of cost |
| Legal review, penetration test | One-off, £3–15K |
| ICO fee | £52/year at the smallest tier |
| Email beyond sign-in codes | Marketing email is not built |
| Map tiles at scale | Only kicks in above ~8,000 monthly adult users |
| Incident response | Unbudgetable by nature; do not pretend otherwise |

## Sensitivity

The model has three inputs that actually matter, in order:

1. **Support minutes per family per month** (0.6 assumed). A non-technical user base
   asking "why does it say stale?" can move this tenfold. This is the number to
   instrument from the first week of any pilot.
2. **Update frequency in background mode** (120 s assumed). Halving it roughly doubles
   write volume and egress, still leaving infrastructure well under £1/family.
3. **Number of adults who leave sharing on** (65% assumed). Drives everything above.

Coordinates are not stored beyond 15 minutes, so storage is effectively a constant:
a single-digit number of megabytes at any plausible scale.
