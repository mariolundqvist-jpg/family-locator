# SafePath — working family locator prototype

A consent-first family location prototype: you create a private group, another adult
joins through an expiring invitation, and **each person decides for themselves whether
to share**. An invitation asks someone to join. It never turns on their location.

The server runs on Node 20 with one dependency (`pg`, for the PostgreSQL production
path). It needs no cloud account, no keys, and no paid service; development uses a
JSON file store so the whole thing starts with `npm start`.

```bash
cd safepath
npm install
npm start            # http://localhost:8787, JSON store, demo sign-in codes
```

For the production configuration (PostgreSQL + real email, demo auth refused):

```bash
SAFEPATH_SECRET=$(openssl rand -base64 32) \
DATABASE_URL=postgres://user:pw@host:5432/safepath DATABASE_SSL=require \
EMAIL_PROVIDER=resend EMAIL_API_KEY=... EMAIL_FROM=signin@yourdomain \
NODE_ENV=production node server/index.js
```

Open two browser profiles (or one normal + one private window), sign in with two
different emails, and walk the flow. In development the sign-in code is shown in an
on-screen panel and printed in the server log — there is no email provider connected.

---

## What actually works, verified

| Requirement | Status | Evidence |
| --- | --- | --- |
| Create a private family group | **Working** | e2e #2 |
| Another adult joins via an expiring invitation | **Working** | e2e #5–7; expiry proven at API level with a real waiting TTL |
| Explicit acceptance — invitation does not authorise location | **Working** | e2e #8; API returns `locationAuthorisedByInvite: false` |
| Each person controls their own sharing | **Working** | e2e #10, #14; no endpoint accepts another member's id |
| Last reported location + timestamp + accuracy radius | **Working** | e2e #11–12 |
| Current / stale / unavailable clearly distinguished | **Working** | API tests: current → stale → unavailable with short TTLs |
| Pause sharing | **Working** | e2e #14–15; position deleted, not frozen |
| End group membership | **Working** | e2e #19–20; removed member loses access on next poll |
| Delete data | **Working** | 8 API tests: user, memberships, positions, sessions all removed |
| Check-in button | **Working** | e2e #16–17 |
| **Foreground location** | **Working, verified in Chromium with a simulated fix** | e2e suite — the coordinates come from Playwright, not a GPS chip |
| **Native app** | **Builds; not run on a device** | `mobile/` — `npx expo prebuild` + Gradle produce an APK. See `mobile/README.md`. |
| **Background location** | **Implemented and unit-tested; NOT verified on hardware** | `docs/DEVICE-TEST-PLAN.md`, `mobile/e2e/run-device-tests.sh` — no device was available |

**247 automated checks pass** — 83 API security/privacy (the same suite on PostgreSQL;
81 of them also run on the JSON store), 21 browser end-to-end, 122 mobile unit tests and
21 client-to-server contract checks. Reproduce with `npm run test:security`,
`npm run test:e2e`, `cd mobile && npm test` and `cd mobile && node e2e/contract.mjs`.

The Android client also **builds and is signed**: `BUILD SUCCESSFUL`, a 34.2 MB release
APK with a 4096-bit RSA key, verified with `apksigner`, in `mobile/artifacts/`. It has
never been installed on a phone — no device was available.

---

## What this build deliberately does not do

- **No background tracking in the browser.** Browsers cannot do it; the web preview is
  not evidence that a phone can.
- **No map tiles.** Positions are plotted on a plain grid with a scale bar and true
  accuracy circles. Adding a tile provider adds a data processor to the map.
- **No email delivery, no push notifications, no payments, no analytics, no ads.**
- **No child accounts.** Testing is for consenting adults only. Child features are a
  separate design with guardian controls and age-specific requirements — see
  `docs/PRIVACY-RISK-ASSESSMENT.md` §5.
- **No promises.** Nothing in the interface claims uninterrupted tracking, emergency
  response or a guaranteed location. The freshness states exist precisely because the
  system cannot promise those things.

---

## Try it in five minutes

1. `npm start`, open <http://localhost:8787>
2. Sign in as `maya@example.test` → **Create a family group**
3. Notice the group opens with you **not sharing** — and a consent dialog you can decline
4. **Invite someone** → copy the link → open it in a second browser profile
5. Sign in as `dan@example.test` → the invitation preview shows the group name and
   expiry, and states that joining does not share your location → **Join group**
6. Dan lands in the group **not sharing**. Dan presses **Turn on sharing** and consents.
   Maya refreshes and sees Dan's position, age and accuracy radius.
7. Dan presses **Pause sharing** — the pin disappears for Maya, because the position is
   deleted rather than kept.
8. Dan presses **Check in** — one position appears, labelled as a check-in, and Dan is
   still paused.

---

## Layout

```
safepath/
├── server/
│   ├── index.js              HTTP server, static files, error handling
│   ├── lib/config.js         all tunables, env-overridable
│   ├── lib/service.js        authorisation, consent gates, freshness, deletion
│   ├── lib/geo.js            state derivation, coordinate validation, distance
│   ├── lib/security.js       tokens, HMAC hashing, cookies, CSRF, rate limiting
│   ├── lib/store.js          atomic JSON store (development and tests)
│   ├── lib/store-pg.js       PostgreSQL store (production)
│   ├── lib/repo.js           backend factory; refuses the JSON store in production
│   ├── lib/email.js          sign-in code delivery (resend / postmark / console)
│   ├── lib/log.js            redaction: no coordinates, no tokens, ever
│   ├── migrations/001_init.sql
│   └── public/               the web client (no framework, no third-party code)
├── tests/
│   ├── security-suite.mjs    81 API security/privacy checks (83 on PostgreSQL)
│   ├── e2e-web.mjs           21 browser checks across two isolated users
│   ├── harness.mjs           boots isolated servers on free ports
│   └── results/              JSON + screenshots from the last run
├── mobile/                   React Native client — builds to a release APK
│   ├── src/core/             the gate, outbox, freshness, redaction (pure, tested)
│   ├── src/location/         expo-location wiring and the headless background task
│   ├── e2e/                  Maestro flows, fixtures, device harness, contract test
│   ├── artifacts/            the built APK
│   └── BUILD.md              the actual build record
├── tools/cost-model.mjs      operating cost per active family
└── docs/
    ├── DELIVERY.md           ← start here for the handover
    ├── ARCHITECTURE.md       stack recommendation, authz model, production path
    ├── PRIVACY-RISK-ASSESSMENT.md
    ├── SECURITY-TESTS.md     what is tested and what is not
    ├── TEST-RESULTS.md       executed vs simulated vs not-run
    ├── DEVICE-TEST-PLAN.md   the procedure nobody has run yet
    ├── COST-MODEL.md
    └── CREDENTIALS-NEEDED.md
```

---

## Honest statement of reliability

This prototype has been exercised only in headless Chromium, on one machine, with
**simulated coordinates**. It has never run on a phone, never held a GPS fix, never
been tested with a locked screen, and its battery impact has never been measured.

Any statement about location accuracy, battery use or background reliability that is
not in `docs/TEST-RESULTS.md` §1–2 does not exist.

---

## Safety and scope notes

- Not a safety service, not an emergency service, and not a substitute for one.
- Testers must be consenting adults who control their own accounts.
- No covert mode, hidden mode, or silent enablement exists anywhere in the code, and a
  regression test fails if such an endpoint is added.
- No paid service is activated, no payment is taken, and nothing is published.

---

*Prototype v0.1 · 27 October 2026. Supporting market analysis lives outside this
directory and is not used to justify any figure in it.*
