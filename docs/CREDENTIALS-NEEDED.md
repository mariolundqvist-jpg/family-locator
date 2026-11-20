# Missing credentials and external services

Nothing in this list has been purchased, activated, or configured. **No paid service
is live.** The prototype runs with zero external dependencies — that is why it runs at
all in this environment.

Each item states exactly what is missing, where it goes, what breaks without it, and
what it costs *if* it is approved. Nothing here should be bought before the decision
is made deliberately.

---

## 1. Required to test with real people over the internet

| # | Service | Env var / config | Without it | Indicative cost | Blocker for |
| --- | --- | --- | --- | --- | --- |
| C-1 | **Hosting with HTTPS** (e.g. Fly.io, Render, Railway, a UK VPS) | `PORT`, `HOST`, TLS termination | Runs on `localhost` only. Browsers refuse geolocation on plain HTTP, and a release Android build blocks cleartext, so no browser client and no shareable install. It does **not** by itself make iOS background tracking work — see the note below. | £5–20 / month | Browser client, shareable install |
| C-2 | **TLS certificate** (usually included with C-1) | — | Secure cookies are disabled; bearer tokens travel in clear text | £0 with most hosts | Everything |
| C-3 | **`SAFEPATH_SECRET`** — session/invite signing key | `SAFEPATH_SECRET` (≥32 chars) | The server **refuses to start** when `NODE_ENV=production` | £0 — generate it | Production start |
| C-4 | **A real domain** | — | Invitation links point at an IP address; no email deliverability, no trust | £8–12 / year | Invitations in the wild |
| C-5 | **Transactional email** (Postmark, Resend, SES, Mailgun) | `EMAIL_PROVIDER` (resend/postmark), `EMAIL_API_KEY`, `EMAIL_FROM` | Sign-in falls back to the demo path, which the server **refuses** when `NODE_ENV=production` | £0–15 / month at prototype volume | Real sign-in |
| C-5b | **PostgreSQL** (managed, UK/EU region) | `DATABASE_URL`, `DATABASE_SSL=require` | The JSON file store is development-only; production start refuses without a database URL | £0–15 / month at this scale | Any multi-instance or durable deployment |

`SAFEPATH_SECRET` is generated automatically in development and written to
`server/data/.dev-secret` (`0600`). That fallback is disabled in production on
purpose: a predictable secret would let anyone forge a session.

### What HTTPS does not fix

HTTPS is necessary for a browser client and for a release Android build, and it is
required before inviting anyone to install the app. It is **not** what determines
whether iOS background tracking works. On iOS a backgrounded app is suspended; updates
are delivered at the system's discretion, are suppressed in Low Power Mode, and can
stop entirely after a period without the app being opened. No certificate changes that.
The same class of problem exists on Android through manufacturer battery managers. This
is why the app never promises uninterrupted tracking, always shows the capture time
next to a position, and reports an explicit "not current" state instead of a stale
point presented as live.

---

## 2. Required for the native app and background location

| # | Service | Detail | Without it | Cost | Blocker for |
| --- | --- | --- | --- | --- | --- |
| C-6 | **Apple Developer Program** | Team ID, signing certificates, provisioning profiles | Cannot install on a physical iPhone, so iOS device tests and any iOS distribution are blocked. (It does not block Android work.) | **$99 / year** | iOS device tests, iOS release |
| C-7 | **Google Play Console** | Developer account | Cannot distribute to Android testers via Play | **$25 one-off** | Play distribution (a release APK can be built and sideloaded over USB without it) |
| C-8 | **Apple Push Notification key** (APNs) | `.p8` key, Key ID, Team ID | No check-in nudges on iOS | £0 | Push features |
| C-9 | **Firebase project + FCM** | `google-services.json`, server key | No push on Android | £0 at this volume | Push features |
| C-10 | **Google Maps SDK key** (only if Google tiles are used) | `EXPO_PUBLIC_MAPS_KEY`, `android.config.googleMaps.apiKey` | Map shows the grid fallback (which is fully functional) | £0 up to the free tier, then metered | Optional |
| C-11 | **Mapbox token** (alternative to C-10) | `MAPBOX_TOKEN` | As C-10 | Free tier, then metered | Optional |
| C-12 | **Android `keystore`** | Signing key + passwords | Cannot sign a build for distribution. A local release build works with the debug keystore Expo generates; do not ship that. | £0 — generate and **back it up** | Android distribution |

---

## 3. Required before handling real families' data (not prototype)

| # | Item | Detail | Without it | Cost |
| --- | --- | --- | --- | --- |
| C-13 | **ICO registration + data protection fee** | UK controller registration | Unlawful to process personal data at scale | £40–2,900 / year depending on size; tier 1 is £52 |
| C-14 | **Managed Postgres** (UK region) | Connection string, TLS | The JSON store is single-process only | £12–25 / month |
| C-15 | **DPO / privacy counsel** | Not a credential, but a named person | No completed DPIA; no launch | Day rate or retainer |
| C-16 | **Object storage for exports** (Art. 15 DSAR) | Bucket + expiry policy | No data export feature | ~£0 |
| C-17 | **Error tracking with PII scrubbing** (e.g. Sentry) | DSN, scrub rules that drop lat/lng | Blind to production failures | £0–20 / month |
| C-18 | **Uptime monitoring** | HTTP check on `/api/health` | You learn about outages from users | £0–10 / month |
| C-19 | **Domain email / DMARC** | SPF, DKIM, DMARC records | Sign-in codes land in spam | included |

---

## 4. Explicitly NOT needed yet, and why

| Not needed | Reason |
| --- | --- |
| Payment provider (Stripe / App Store IAP) | Instruction: do not accept customer payments. No billing code is present. |
| Analytics (GA4, Amplitude, Mixpanel) | Would add a processor to the data map and a consent problem for zero prototype value |
| Ad networks | Structurally incompatible with the product's promise |
| Crash reporting on day one | Useful later; adds a processor now |
| CDN | One small static bundle |

---

## 5. Exact list to hand over

```
SAFEPATH_SECRET=            ≥32 random characters (openssl rand -base64 48)
PORT=8787
HOST=0.0.0.0
NODE_ENV=production
DEV_DELIVERY=0

# After the first paid/registered item is approved:
EMAIL_PROVIDER=postmark|resend|ses
EMAIL_PROVIDER_KEY=
EMAIL_FROM="SafePath <hello@yourdomain>"
DATABASE_URL=postgres://...

# Native builds only:
EXPO_PUBLIC_API_BASE=https://api.yourdomain
APPLE_TEAM_ID=
APPLE_APNS_KEY_ID=
APPLE_APNS_KEY_PATH=
GOOGLE_SERVICES_JSON=./mobile/google-services.json
EXPO_PUBLIC_MAPS_KEY=            (optional; grid fallback works without it)
```

Verify none of these are committed: `.gitignore` already excludes `server/data/`,
`.runtime-data/`, `*.p8`, `google-services.json` and `.env*`.
