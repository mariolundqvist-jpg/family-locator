# Architecture

Version 0.2 · 27 October 2026 · prototype, not production

---

## 1. Recommendation in one page

**Build the product as a React Native (Expo) app with a thin HTTP API, and keep a
web client only for testing and for the invitation acceptance page.**

| Layer | Recommendation | Why |
| --- | --- | --- |
| Client | React Native + Expo (continuous native generation) | Background location and push have maintained native modules. One codebase for iOS and Android. No per-install licence fee, unlike commercial background-geolocation SDKs. |
| Location | `expo-location` + `expo-task-manager` | Wraps `CLLocationManager` and `FusedLocationProviderClient`; supports an Android foreground service and iOS background modes. |
| Map | `react-native-maps` / MapLibre, **with a no-tiles fallback** | A map-provider outage must never blank the family view. The prototype deliberately renders positions on a plain grid to prove the layout works without tiles. |
| Auth | Email one-time code → session token | No passwords to leak, no social login dependency, and email is the one identifier every adult has. Token in Keychain/Keystore on device; HttpOnly cookie in the browser. |
| API | Node (this prototype) → any runtime | The authorisation rules are the asset, not the framework. |
| Data | **Postgres** with row-level constraints, single-region UK | The JSON store is a prototype shortcut; see §6 for the exact migration. |
| Push | APNs/FCM via `expo-notifications` | Used **only** for "someone asked you to check in" and consent reminders. Never for tracking. |

**What we deliberately did not choose:** a WebView wrapper (iOS WKWebView cannot do
background location at all), Firebase-only (fine for auth, but the server must remain
the authorisation authority — see §3), and any commercial tracking SDK (per-install
cost, and a third party between the family and their data).

---

## 2. System shape

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  iOS (native)   │   │ Android (native)│   │  Web (browser)  │
│  Expo app       │   │ Expo app        │   │  prototype/PWA  │
│  keychain token │   │ keychain token  │   │  HttpOnly cookie│
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │  HTTPS, bearer token│                     │ HTTPS, cookie
         └──────────┬──────────┴──────────┬──────────┘
                    ▼                     ▼
        ┌───────────────────────────────────────────┐
        │  API  — the only place authorisation is    │
        │  decided                                   │
        │                                            │
        │  · session resolution                      │
        │  · membership checks on every read/write   │
        │  · consent gates                           │
        │  · freshness derivation (server clock)     │
        │  · retention sweep                         │
        └───────────────┬───────────────────────────┘
                        ▼
        ┌───────────────────────────────────────────┐
        │  Postgres (production)                     │
        │  users, families, members, invites,        │
        │  locations (one row per member), audit     │
        └───────────────────────────────────────────┘
```

### The one invariant everything else follows from

> **The client is a view. The server decides who may see what, and how fresh it is.**

A compromised or modified client can lie about *its own* coordinates. It cannot:
read another family's positions, mark a fix as current, keep sharing after consent is
withdrawn, or change anyone else's sharing state. That is the security boundary.

---

## 3. Authorisation model

Three questions, asked in this order on every request:

1. **Who are you?** Session token → user. Expired or forged tokens fail closed.
2. **Are you in this group?** `members.state === 'active'` for (user, family).
   Failure returns **404**, not 403 — a non-member should not be able to confirm a
   group exists.
3. **Are you allowed to do this particular thing?**
   - Write a position → only for *your own* membership, only if
     `consent.foreground` **and** `sharingState === 'on'` (or a one-off check-in).
   - Change sharing/consent → `POST /api/me/*` takes no member id at all. It is
     structurally impossible to address someone else.
   - Invite, remove, delete group → `role === 'owner'`.
   - Read a position → the target member must be sharing or have checked in.

**No endpoint accepts a member id for a consent or sharing change**, and unknown body
fields are rejected (`assertFields`) rather than ignored. This is the mechanism that
makes "nobody can silently enable your tracking" a property of the code rather than a
promise in a policy. It is covered by a regression test.

### Freshness is a server decision

`deriveState()` runs on the server, using `Date.now()` and the device's claimed
`capturedAt`:

| State | Condition | Client may display |
| --- | --- | --- |
| `current` | age ≤ 120 s | a solid pin, "now" |
| `stale` | 120 s < age ≤ 900 s | an outlined pin, "last seen 6 min ago" |
| `unavailable` | no row, expired, or clock skew > 2 min | no pin at all, and a stated reason |

The client renders what it is told. It cannot promote a stale fix.

---

## 4. Data model (prototype shape; production schema in §6)

```
users      id, email (unique, lowercased), displayName, createdAt
sessions   id(=HMAC(token)), userId, createdAt, lastSeenAt, expiresAt
families   id, name, ownerId, createdAt
members    id, familyId, userId, role(owner|adult), state(active|left|removed),
           joinedAt, sharingState(on|off|paused), sharingUpdatedAt,
           consent{ foreground:{version,at}|null, background:{version,at}|null }
invites    id, familyId, createdByUserId, tokenHash, expiresAt,
           usedAt, usedByUserId, revokedAt
locations  memberId → lat, lng, accuracyM, capturedAt, receivedAt, source
           ONE ROW PER MEMBER. No history table exists.
audit      append-only JSONL: ts, event, opaque ids only — never coordinates
```

Deliberate omissions: no address book, no contacts, no device fingerprint, no
advertising id, no location history, no free-text notes that could contain personal
data.

---

## 5. Consent flows

```
                     ┌──────────────────────────────────────┐
   invitation link → │ 1. peek: group name + expiry only     │  (no positions)
                     └───────────────┬──────────────────────┘
                                     ▼
                     ┌──────────────────────────────────────┐
                     │ 2. join: creates member, sharing OFF, │
                     │    consent empty. Response states     │
                     │    locationAuthorisedByInvite: false  │
                     └───────────────┬──────────────────────┘
                                     ▼
                     ┌──────────────────────────────────────┐
                     │ 3. consent screen (separate, explicit)│
                     │    decline → still sees others        │
                     └───────────────┬──────────────────────┘
                                     ▼
                     ┌──────────────────────────────────────┐
   native only  →    │ 4. background consent (separate)      │
                     │    explains battery + notification    │
                     └───────────────┬──────────────────────┘
                                     ▼
              pause / stop / leave / delete — each purges the stored position
```

**Revocation order matters:** withdrawing foreground consent also withdraws
background consent; the native task stops itself when the server refuses it.

---

## 6. What changes for production

Two rows of this table are now **done**, not planned: the store and email delivery.
`server/lib/store-pg.js` implements the Postgres store (8 tables, no location-history
table, a partial unique index enforcing one active membership per user per family,
tokens stored as keyed HMACs), and `server/lib/repo.js` refuses to hand back the JSON
store when `NODE_ENV=production`. `server/lib/email.js` sends through Resend or
Postmark with a `console` provider for development. `config.assertProductionInvariants`
refuses to start unless a secret, a database URL and an email provider are all present
and demo delivery is off. The whole API suite runs against both stores.

| Area | Prototype | Production | Why |
| --- | --- | --- | --- |
| Store | ~~Single JSON file~~ → **Postgres implemented** (`store-pg.js`): advisory-lock transactions, partial unique index on active members | Scale beyond one process; connection pooling per instance | A single-use invite consumed by two people concurrently must be atomic. The current PgStore loads rows per mutation under an advisory lock — correct, but only suitable to hundreds of families. |
| Sessions | In-memory token hashes | Same shape, plus device binding and remote revocation list | Needed for "sign out everywhere" |
| Hosting | localhost | UK region, TLS, WAF, managed backups | Data residency + transfer assessment |
| Email | ~~Dev panel prints the code~~ → **provider implemented** (`email.js`: Resend, Postmark, console) | A provider account (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`) | One-time codes need delivery |
| Maps | Plain grid, no tiles | Tile provider **or** self-hosted style | Cost and privacy; a provider must be named as a processor |
| Push | None | APNs/FCM for check-in nudges | Requested feature, not tracking |
| Audit | JSONL, unbounded | Append-only table, rotated, capped in UI | R-08 |
| Rate limiting | In-memory fixed window | Shared store (Redis) or edge limiter | Multi-instance |
| Observability | `LOG_REQUESTS=1` | Structured logs **without coordinates**, error tracking with PII scrubbing | Never log a lat/lng |
| Backups | None | Encrypted, 7-day retention, restore tested | Deletion must also delete from backups within a stated window |

### Migration notes that are easy to get wrong

1. **Deleting a user must delete their positions, not orphan them.** The prototype
   does this; the SQL version needs `ON DELETE CASCADE` from `locations` to `members`.
2. **The retention sweep must run even when traffic is zero** — a cron, not a
   request-triggered sweep.
3. **`receivedAt` must be assigned by the database, not the app**, so clock skew
   between app servers cannot make a fix look fresher.
4. **Never add a "location history" table "for the incident timeline"** without
   revisiting the risk assessment first. That one table changes the entire risk
   profile.

---

## 7. Threat model (abbreviated)

| Adversary | Capability | Mitigation |
| --- | --- | --- |
| Another family member | Can see the group, wants to enable someone's tracking | No endpoint exists; unknown fields rejected; sharing is self-only; audited |
| Removed member | Keeps an old session or invite | Membership re-checked per request; invites single-use and revocable; positions purged |
| Curious outsider | Guesses family ids | UUIDv4 ids + membership check + 404 (not 403) |
| Attacker with database dump | Reads the JSON/SQL file | Tokens and invites stored as keyed HMACs, not plaintext; positions expire in 15 min; no history to steal |
| Malicious client | Modified app claims to be someone else | Bearer token bound to a session; every write scoped to the caller's own membership |
| Network attacker | Sees traffic | TLS in production; HSTS; no tokens in URLs (invite token lives in the URL **fragment**) |
| Insider / support | Wants to look someone up | No admin read path exists in this build; must be designed deliberately if ever added |

**Explicitly out of scope for v1:** nation-state adversaries, compromised OS,
malicious guardian (child case — deferred), and physical device theft beyond normal
OS protections.

---

## 8. Deliberate limitations of this delivery

1. **No map tiles.** Positions are plotted on a grid with a scale bar and true
   accuracy circles. Intentional: it proves the freshness/accuracy presentation
   without adding a provider and a data processor.
2. **No background location in the web build.** The browser cannot do it. The native
   client implements it and is unit-tested; it is **unverified on hardware**
   (`mobile/README.md`, `DEVICE-TEST-PLAN.md`).
3. **Email delivery is implemented but unconfigured.** Without `EMAIL_PROVIDER` the
   server runs in development mode and shows the code on screen; production refuses to
   start in that mode. No provider account exists.
4. **No push notifications.**
5. **Single-process storage.** Not safe for more than one instance.
6. **No payments, no ads, no analytics** — by instruction and by design.
7. **No child accounts** — see `PRIVACY-RISK-ASSESSMENT.md` §5.
