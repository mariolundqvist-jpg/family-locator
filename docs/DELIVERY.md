# Delivery note — what you have, what you don't, and what it costs

**Version 0.2 · 27 October 2026**

This is the handover index. It answers the five things you asked for, points at the
file that answers each one, and states plainly what is **not** established.

*Change in this version:* the mobile client is now a complete, buildable project with
its own test suite and device harness, the server has real email and PostgreSQL paths,
and every claim below is backed by a command that was actually run — except the ones
explicitly listed as not run, which is still everything involving a physical phone.

No decision from the earlier appendix has been treated as approved. The £4,000 research
budget, the market size estimates and the acquisition assumptions are **not** used
anywhere in this build. Where a cost appears, it comes from `tools/cost-model.mjs` and
says so.

---

## 1. The runnable prototype

**Where:** this directory. `npm install && npm start` → <http://localhost:8787>
**Dependencies:** Node 20 and one package, `pg`, used only when the server is pointed at
PostgreSQL. Development with the JSON store needs nothing else. Playwright and Jest are
dev dependencies, for the tests.

**The complete flow you asked for is built and passing:**

```
create private group → invite another adult (expiring, single use)
  → they accept explicitly (and are told joining shares nothing)
  → they choose to share, consent recorded with a version + timestamp
  → location updates arrive and are validated server-side
  → authorised map display with state, age and accuracy radius
  → pause (position deleted) → check in → leave → delete everything
```

| Artefact | File |
| --- | --- |
| Run instructions and honest feature status | `README.md` |
| Server (authorisation, consent, retention) | `server/` |
| Client | `server/public/` |
| Native client (complete project) | `mobile/` — build it with `npm run build:android` |
| **Android release build record** | `mobile/BUILD.md` — `BUILD SUCCESSFUL in 7m 42s`, 39,752,647 B APK with the new icon, inspected |
| Device test harness (executable) | `mobile/e2e/run-device-tests.sh` |
| Demo screenshots (webklientskapet) | `docs/img/` |
| **Designunderlag för lansering** (svenska) | `design/launch-ui.html` + `design/png/` + `design/README.md` |
| **Appikon och startskärm (PNG)** | `mobile/assets/` (används av bygget) + `design/assets/` (förhandsvisning) + `design/make-assets.py` |
| **Vad som gör appen till en riktig app** (svenska, status per krav) | `docs/LAUNCH-READY.md` |

**What I would show you first:** the moment where Dan joins the group and is *not*
sharing, and Maya's map is empty. That single state is the product thesis.

### The mobile client builds

```
cd mobile && npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
→ BUILD SUCCESSFUL in 16m 8s cold · 333 tasks
→ app-release.apk, 39,918,001 bytes, app.safepath.client 0.2.0
```

The APK was opened and checked, not just produced: it contains Hermes bytecode with this
application's strings — and the symbol names from the final source revision — in it, both
ABIs, and the location and foreground-service permissions the feature needs. Full record
in `mobile/BUILD.md`.

Review found two defects in the client after the first build, and both were fixed and
rebuilt: a wrong field name in the join flow, and a real one where a background task
started with no UI running would have dropped the locations it was given. That second
defect is the kind that only shows up on a device — which is exactly why the device
harness exists.

Two honest caveats on that build. It is **signed with the debug keystore**, so it is
installable on a test device and not shippable. And **it has never been installed** —
this environment has no device and no KVM for an emulator, so the build proves
compilation, not behaviour.

---

## 2. Architecture

**File:** `docs/ARCHITECTURE.md`

**The recommendation:** React Native (Expo) + `expo-location`/`expo-task-manager`, with
a thin HTTP API that is the sole authority for access decisions, and Postgres in
production. No commercial tracking SDK, no WebView wrapper, no Firebase-as-backend.

**The invariant:** the client is a view. A modified client can lie about its own
position; it cannot read another family's positions, mark a stale fix as current,
keep sharing after consent is withdrawn, or change anyone else's sharing state.

**Freshness is computed on the server** from the server's clock, using the device's
claimed capture time only as an input. That is what makes the current/stale/
unavailable distinction a trust signal rather than a decoration.

**Production gaps are enumerated, not glossed:** §6 of that document lists what must
change before real families use this. Two items on it are now **done** rather than
planned — PostgreSQL persistence (`server/lib/store-pg.js`, with a partial unique index
enforcing one active membership per user, and the JSON store refused in production) and
email sign-in (`server/lib/email.js`). Still open: shared rate limiting, geographic
hosting, audit rotation, backups, and the four migration mistakes that are easy to make.

---

## 3. Security tests

**Files:** `docs/SECURITY-TESTS.md` (what is and is not tested) ·
`tests/results/security.json` · `tests/results/security-postgres.json` ·
`tests/results/e2e-browser.json`

**Executed 27 Oct 2026:**

| Suite | Result | Backend |
| --- | --- | --- |
| API security and privacy | **81/81** | JSON file store |
| API security and privacy | **83/83** | **PostgreSQL 17** (two extra checks query the audit table directly) |
| Mobile unit tests (Jest) | **122/122** | plain Node, no device |
| Mobile ↔ server contract test | **21/21** | the client's exact requests against the real server |
| Browser end-to-end (Playwright) | **21/21** | JSON file store |

The same suite runs unchanged against both stores, which is what makes the
persistence claim worth anything: `TEST_BACKEND=postgres TEST_PG_BASE=… node
tests/security-suite.mjs`.

The four things you specifically asked to be tested, and how:

| You asked | How it is proven |
| --- | --- |
| Expired invitations | A server booted with a **900 ms** TTL; the test creates an invite, waits, then proves `410 invite_expired`. Waiting is real, not mocked. |
| Removed members | The owner removes a member → that member's next request returns `404`, and the stored position row is gone. |
| Attempts to access another family's location | A user in family B requests family A → `404` (not `403`, so they cannot even confirm it exists). Anonymous → `401`. A member also cannot *write* a position into another family's member record → `403`. |
| Server-side membership and access enforcement | Every read and write re-checks `members.state === 'active'`; there is no client-supplied authority anywhere in the request path. |

Plus: no endpoint exists that lets one member change another member's sharing or
consent, unknown body fields are rejected rather than ignored, invitation tokens are
stored only as HMACs, sessions are HttpOnly+SameSite, CSRF requires a custom header
and a matching origin, and account deletion removes user, memberships, positions and
sessions.

### Not tested, and it matters

- **Physical devices.** Nothing has run on a phone. See §7.
- **Concurrency at scale.** The Postgres store serialises every mutation with an
  advisory lock and loads rows per mutation. That is correct for one instance and a few
  hundred families; the single-use-invite race is safe within that, and *not* proven
  beyond it.
- **Independent penetration test.** Not performed.
- **Log retention on a hosted platform.** The suite proves the server's own output
  contains no coordinates; it cannot prove what a hosting provider does with stdout.

---

## 4. Estimated operating cost per active family

**Files:** `docs/COST-MODEL.md` · run `node tools/cost-model.mjs`

| Active families | Metered infrastructure | + DPO + support | Dominant cost |
| --- | --- | --- | --- |
| 100 | £0.20 / family / month | **£2.35** | Fixed DPO retainer spread thin |
| 1,000 | £0.02 | **£0.46** | Support minutes |
| 10,000 | £0.02 | **£0.29** | Support minutes |

**These are modelled from indicative prices, not invoices.** No provider price was
verified while writing them and nothing has been purchased. The transferable finding is
the shape: infrastructure is negligible at any plausible scale, and the irreducible
fixed cost of being accountable for other people's location data (a DPO retainer,
about £190/month) dominates until well past a thousand families.

The largest unmodelled risk is **support minutes per family**, assumed at 0.6. A
non-technical user base asking "why does it say stale?" can move that tenfold. Instrument
it from week one of any pilot.

---

## 5. Exact missing credentials

**File:** `docs/CREDENTIALS-NEEDED.md`

Short version, in the order they become blocking:

1. **`SAFEPATH_SECRET`** — a random string. The server refuses to start in production
   without one. Free.
2. **A domain and TLS (HTTPS)** — ~£10/year + ~£5–20/month. Browsers will not grant
   geolocation to a plain-HTTP origin, and Android release builds block cleartext, so
   this blocks *browser* geolocation and any install you would hand to someone else.
   **It does not, on its own, give you working background tracking** — see §6.
3. **Transactional email** (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`) — £0–15/month.
   Without it, sign-in falls back to a demo mode that the server refuses in production.
4. **PostgreSQL** — a managed instance, ~£0–15/month at this scale. The server runs on
   it today; the JSON file store is development-only and production start refuses
   without `DATABASE_URL`.
5. **Apple Developer Program ($99/year)** and **Google Play Console ($25 one-off)** —
   block distribution. They do **not** block building: an APK can be built and
   installed on a test device without either.
6. **ICO registration (£52+/year)** and a **named DPO** — block handling real families'
   data lawfully, regardless of what the code does.

Everything else (maps, push, error tracking) is optional for the next step and is
listed with its effect of omission.

## 6. What hosting would and would not buy you

**Hosting is not the only remaining requirement, and it is not the largest one.**
It is one line in the list above, and it changes nothing about the open questions
below it.

What a hosted, HTTPS deployment gives you:

- a browser client that can ask for geolocation at all,
- a release app build that can talk to the server without cleartext exceptions,
- a URL you can send to a reviewer.

What it does **not** give you:

- **Reliable iOS background tracking.** On iOS a backgrounded app is suspended;
  significant-location-change delivery is at the OS's discretion, `pausesUpdatesAutomatically`
  and the low-power state both override the app, and the system can stop the updates
  after a period without reopening the app. HTTPS is irrelevant to any of that. The
  same is true in a different way on Android, where several manufacturers kill
  foreground services or battery-optimise them away. Neither platform offers a
  guarantee, and this product's UI must never imply one. That is why the copy says
  "background updates are optional, use more battery, and may be delayed", and why
  the app shows the capture time next to every position rather than claiming it is live.
- **Verification.** No amount of hosting substitutes for the device test matrix in
  `docs/DEVICE-TEST-PLAN.md`. Until those rows are filled with real measurements,
  background behaviour, battery cost, locked-screen delivery and permission-loss
  behaviour under a real OS are unverified, and this document will keep saying so.
- **The other prerequisites**: email delivery, a named DPO, ICO registration, and the
  DPIA sign-off. Hosting is the easy part.

## 7. Verification status — the part that matters most

You asked for actual results to be reported separately from simulated ones. There are
five tiers, and they are never combined:

| Tier | What it is | Where |
| --- | --- | --- |
| **Executed — server** | 81 API checks (JSON store) and 83 (PostgreSQL), real HTTP, real TTLs, real database | `TEST-RESULTS.md` §1 |
| **Executed — browser** | 21 Playwright checks with a **simulated** position override — fixed coordinates, no GPS chip, no radio, no battery | `TEST-RESULTS.md` §2 |
| **Executed — mobile logic** | 122 Jest tests over the gate, outbox, controller, freshness, formatting, redaction, raw-sample validation and the API client | `TEST-RESULTS.md` §3 |
| **Executed — client ↔ server** | 21 contract checks: the client's exact requests replayed against the real server | `TEST-RESULTS.md` §3 |
| **Executed — build** | `BUILD SUCCESSFUL`, 39.9 MB release APK, archive inspected | `TEST-RESULTS.md` §5 · `mobile/BUILD.md` |
| **Not run** | Everything requiring a phone: install, background, locked screen, revoked permissions, weak GPS, lost network, battery | `TEST-RESULTS.md` §4 (empty by design) |

**What "executed" means for the mobile client, precisely.** The unit tests drive the
real `LocationController`, `Outbox` and gate code that ships in the app; only the OS
watcher and the network are fakes. So the statements "pause stops the watcher",
"pause destroys the queue", "a removed member cannot send", "a queued fix is never sent
after consent withdrawal" are proven at the level of this repository's logic. They are
**not** proven against a real Android or iOS location stack, where a delayed callback
or a manufacturer's battery manager could still surprise us.

**Background location is implemented and unverified.** No device was available. No
battery figure exists. No reliability claim is made.

The single largest unverified risk is **R-06 in the privacy assessment**: whether
background updates genuinely stop when consent is withdrawn on a locked device. The
logic now refuses to send and purges the queue, and there is a unit test for exactly
that path — but the interaction between that logic and the OS after the app is killed
has not been observed on hardware.

The procedure to close it — 25 tests across foreground, background, permissions,
signal degradation and battery, each with pass criteria and a recording format — is in
`docs/DEVICE-TEST-PLAN.md`. The harness that runs the automated part of it is
`mobile/e2e/run-device-tests.sh`, which seeds two isolated accounts, drives nine Maestro
flows, greps the device log for coordinates and tokens, and cleans up. Until those rows
are filled in, the README continues to say background tracking is unverified.

## 8. Decisions I made that you should confirm or overturn

| Decision | Why it was made | Cost if wrong |
| --- | --- | --- |
| No location history at all (15-minute last-known only) | Makes a breach survivable and removes profiling | Rules out any future "incident timeline" feature without a new assessment |
| Join flow has **no age field and no child path** | Following your instruction; child accounts are a separate design | Anyone testing must be an adult |
| Plain grid instead of map tiles | Avoids adding a data processor for zero prototype value | Less convincing in a demo; easy to swap in |
| PostgreSQL in production, JSON file for development | The runtime had no native SQLite; the JSON store keeps the test suite fast and dependency-free | Two storage paths to keep honest — mitigated by running the same 81 checks against both |
| Check-in shares **one** position even while paused | It is a deliberate, disclosed action by the sharer, and it does not re-enable tracking | If you consider check-in to be sharing, this needs to be gated on sharing being on |
| Deletion is built; Art. 15 **export is not** | Deletion is the higher-risk path and the one you asked for | Export is required before a public launch |

---

## 9. What is not activated

No paid service is enabled. No payment is taken. Nothing is published. No email is
sent. No analytics, no advertising, no third-party script, no CDN, no map provider.
