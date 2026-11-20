# Test results

Four kinds of results live here and they are never mixed:

- **§1 Automated API — actually executed** in this environment, on the date shown, with
  the exact commands. Reproducible. Two backends: JSON file store and PostgreSQL 17.
- **§2 Browser end-to-end — actually executed**, but with a **simulated** location
  source (Playwright's geolocation override). This proves the *flow*, not the GPS.
- **§3 Mobile unit tests — actually executed**, on Node, with the OS watcher and the
  network faked. This proves the *logic*, not the platform.
- **§4 Physical device — NOT RUN.** Empty by design.

---

## 1. Automated API security and privacy suite

**Executed:** 27 October 2026 · `node tests/security-suite.mjs`
**Result: 81 of 81 passed, 0 failed** (JSON file store)
**Executed again on PostgreSQL 17:** `TEST_BACKEND=postgres TEST_PG_BASE=… node tests/security-suite.mjs`
**Result: 83 of 83 passed, 0 failed** — two extra checks read the `audit` table directly.
Machine-readable output: `tests/results/security.json`, `tests/results/security-postgres.json`

Each run boots its own server instances with short TTLs so expiry and retention are
tested by *actually waiting*, not by mocking the clock.

| Section | Passed | What it proves |
| --- | --- | --- |
| Authentication and sessions | 9/9 | Unauthenticated, forged-cookie and replayed-code access are refused; codes are single-use and burned after 5 wrong attempts; emails are normalised |
| Native bearer auth | 2/2 | A native client can authenticate with a bearer token; browsers never receive the token in the body |
| CSRF and transport hardening | 4/4 | Missing client header and cross-origin writes are refused; cookie is HttpOnly + SameSite=Lax; CSP is restrictive |
| Group creation and membership | 3/3 | Creating a group shares nothing and records no consent |
| Invitations | 10/10 | Token stored hashed only; peek reveals the group name but no positions; single-use; **expired** and **withdrawn** invitations refused; non-owners cannot mint invitations |
| Authorisation between families | 4/4 | Cross-family read returns 404; anonymous read 401; non-member cannot delete |
| Consent gates on location | 8/8 | Consent → sharing → position, in that order; no-sharing and no-consent both block writes; out-of-range, future-dated and absurd-accuracy coordinates rejected |
| No remote control of another person | 4/4 | No endpoint lets one member change another's sharing; a check-in request cannot start sharing |
| Pause, withdrawal and deletion of position data | 4/4 | Pausing **deletes** the position; withdrawal deletes it and stops sharing; check-in works without re-enabling live sharing |
| Data minimisation and retention | 7/7 | 5 updates leave 1 row; no history structure exists; audit log contains no coordinates; current→stale→unavailable transitions and physical deletion verified |
| Removal and leaving | 6/6 | Only the owner can remove; a removed member loses access immediately; their position is purged; an owner cannot "remove" themselves |
| Session lifetime | 1/1 | Sessions expire on schedule |
| Rate limiting | 1/1 | Code requests are throttled (429) |
| Account deletion | 8/8 | User, memberships, positions and sessions all removed; session stops working; a group with no remaining members is deleted |
| Logging and secret handling | 12/12 (JSON) · 14/14 (Postgres) | After posting a real fix, the server's own output contains no latitude, no longitude, no coordinate-shaped number and no bearer token; the issued sign-in code never appears; the activity feed and the `audit` table expose no coordinates or token hashes; production **refuses to start** with `DEV_DELIVERY=1` and says why |

### Failures found and fixed during this work

These were real defects, found by the suite, not by inspection:

1. A wrong-code attempt loop returned "not correct" instead of locking out — the
   final permitted attempt now burns the code.
2. A withdrawn invitation returned `403 forbidden` instead of `403 invite_revoked`;
   `errors.forbidden` could not carry a code.
3. Posting a position with no consent returned `sharing_off` instead of
   `consent_required` — the check order was wrong, which would have produced a
   misleading message.
4. `POST /api/me/sharing` silently ignored an unexpected `memberId` field. It now
   rejects unknown fields outright (`assertFields`), so an attempt to address another
   member fails loudly rather than being ignored.
5. A client-side crash: `renderMap` mixed member objects with wrapped point objects,
   throwing after the pins were drawn and aborting the rest of the render. The map
   looked plausible while the member list stayed stale.
6. The browser's `hidden` attribute was being overridden by a CSS `display` rule, so
   the "nobody is sharing" overlay never cleared.

---

## 2. Browser end-to-end run

**Executed:** 27 October 2026 · `node tests/e2e-web.mjs`
**Result: 21 of 21 passed, 0 failed.**
Machine-readable: `tests/results/e2e-browser.json` · screenshots: `tests/results/e2e-*.png`

Two isolated browser contexts act as two adults. Location source:
**`Playwright geolocation override` — a simulated coordinate pair, not a GPS fix.**
The coordinates are fixed (51.50735, −0.12776, accuracy 22 m for one person;
51.51520, −0.11840, accuracy 65 m for the other), so this run says nothing about
real-world accuracy, drift or battery.

| # | Check | Result |
| --- | --- | --- |
| 1 | Owner signs in with a one-time code | PASS |
| 2 | Group created and opened | PASS |
| 3 | Creating a group does not enable sharing | PASS |
| 4 | Map is empty before anyone shares | PASS |
| 5 | Owner can create an expiring, single-use invitation | PASS |
| 6 | Invitation preview shows the group before joining | PASS |
| 7 | Invitee joins | PASS |
| 8 | Joining does **not** authorise location access | PASS |
| 9 | Owner cannot see a position for a non-consenting member | PASS |
| 10 | Consent + sharing turns the invitee live | PASS |
| 11 | Owner sees state, age and accuracy radius | PASS |
| 12 | Accuracy radius rendered from the reported value (65 m) | PASS |
| 13 | Map plots both members | PASS |
| 14 | Invitee can pause their own sharing | PASS |
| 15 | Paused member shows no coordinates | PASS |
| 16 | Check-in shares one position without re-enabling live sharing | PASS |
| 17 | Check-in does not change the pause state | PASS |
| 18 | A member cannot fetch a family they do not belong to | PASS |
| 19 | Owner can remove a member | PASS |
| 20 | Removed member is ejected from the group view | PASS |
| 21 | No uncaught client errors during the flow | PASS |

**What this does not prove:** that a phone can obtain a fix, that a fix is accurate,
that updates continue when the screen is locked, or anything about battery. See §3.

---

## 3. Mobile unit tests — executed

**Executed:** 27 October 2026 · `cd mobile && npm test`
**Result: 122 of 122 passed, 0 failed** across 9 suites, ~2 s (GPS-kvalitet tillkom 19 nov).
Type check: `npm run typecheck` — no errors.

The tests import the real modules that ship in the app (`src/core/*`, `src/api.ts`).
Two things are faked, and only two: the OS location watcher and `fetch`. The keychain
is faked by the API test. Nothing else is stubbed.

| Suite | Tests | What it proves |
| --- | --- | --- |
| `core/sharing.test.ts` | 17 | Every branch of the gate: signed out, removed, server-revoked, paused, off, consent withdrawn, background not consented. A check-in is allowed while paused but never without consent. Gate copy never contains a coordinate. |
| `core/outbox.test.ts` | 17 | Ordering, the size cap, expiry, corrupt storage, purge counts, and the important one: **the gate is re-asked before every item**, so a pause during a flush abandons the rest. Transient failures keep items, permanent ones drop only that item. |
| `core/controller.test.ts` | 21 | Watcher stops on pause / sign-out / removal / consent withdrawal / leaving; the queue is destroyed at the same moment; a straggler sample after a pause is dropped; a 403 from the server tears the membership down; a check-in does not restart a watcher; recovery after resume. |
| `core/freshness.test.ts` | 17 | Current / stale / unavailable thresholds, expiry hiding coordinates, clock skew treated as stale, and that no stale label claims to be live. |
| `core/format.test.ts` | 6 | Timestamps in a pinned time zone, so the tests do not depend on the machine. |
| `core/redact.test.ts` | 10 | Coordinates under known keys, coordinates inside strings, bare high-precision decimals, query strings, long opaque secrets, and the console wrapper the app installs at startup. |
| `core/samples.test.ts` | 9 | Raw OS locations are validated before they can become a position: impossible coordinates, the 0,0 "no fix" placeholder, a missing timestamp and a missing accuracy are all handled; the headless background task runs this same code with no UI to warn in. |
| `api.test.ts` | 12 | Bearer token issuance and storage, refusal when the server returns no token, typed errors with retryability, logout clearing the token even on failure, and that the client has no endpoint which changes another member's sharing. |

### Contract test — the client against the real server

**Executed:** 27 October 2026 · `cd mobile && node e2e/contract.mjs` · **21 of 21 passed**

The Jest tests mock `fetch`, so they prove what the client sends, not that the server
accepts it. `e2e/contract.mjs` boots the real server and replays the exact requests
`src/api.ts` makes — same paths, same headers, same bodies — then asserts the responses
the screens depend on: a bearer token for the mobile header, the invitation accepted as
an opaque token, the fix payload accepted, the other member seeing a `current` state with
a capture timestamp, an accuracy radius and a distance, pausing removing the position
from the group view, a check-in being accepted while paused without resuming sharing,
leaving, and deletion invalidating the token.

It caught one real mismatch while being written: the client posted an invitation `code`
where the server expected an opaque `token`. That bug would have reached a device run and
looked like "the invitation link does not work".

**What this does not prove.** That Android's location service delivers what the fake
watcher delivers. Background callbacks after the app is killed, vendor battery
managers, and permission revocation mid-flight are all outside what a Node test can
observe. Section 4 is where that gets recorded, and it is still empty.

---

## 4. Physical device tests

**Status: NOT RUN.** No iOS or Android hardware was available.

| ID | Test | Status |
| --- | --- | --- |
| F1–F5 | Foreground baseline | **Not run** |
| B1–B8 | Background, locked screen, force-quit, stop-means-stop | **Not run** |
| P1–P6 | Permission variants and degradation | **Not run** |
| G1–G6 | Weak GPS, no GPS, network loss, clock skew | **Not run** |
| E1–E6 | Battery measurements | **Not run** |

Therefore, in this delivery:

- **Background location is implemented in source and unverified.** No claim is made
  about it working, and none should be made in any material derived from this.
- **No battery figures exist.** Any battery number you see elsewhere (including in
  the supporting market appendix, if it quotes one) is not a measurement of this
  product.
- **Reliability is unquantified.** Do not describe the prototype as reliable.

The procedure, pass criteria and recording format are in `DEVICE-TEST-PLAN.md`.

---

## 5. Build result — executed

**Executed:** 27 October 2026 · `cd mobile/android && ./gradlew assembleRelease`
**Result: BUILD SUCCESSFUL in 16m 8s from cold, 333 tasks. APK 39,918,001 bytes.**

The build was run three times: once cold (16m 8s, downloads and native compilation),
then twice incrementally (59 s and 46 s) after two source fixes found during review — a
wrong field name in the join flow, and a genuine defect where a headless background task
started with no UI would have dropped its locations. The artefact in `artifacts/` is from
the final run, and its JS bundle was searched for the fixed symbol names to confirm it is
not a stale copy.

| Check | Result |
| --- | --- |
| Package / version | `app.safepath.client`, versionName `0.2.0`, versionCode `1` |
| SDK levels | min 24, target 36, compile 37 |
| ABIs in the APK | `arm64-v8a`, `x86_64` |
| JS bundle | `assets/index.android.bundle`, Hermes bytecode v99, 1,424,672 bytes |
| Location permissions in the manifest | `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION` present |
| Bundle contains this app's copy | `"Not current"`, `"Sharing paused"`, `"Demo sign-in code"` all found in the bytecode |
| Signature | Android **debug** keystore — installable on a test device, not shippable |
| Installed or run | **No.** No device and no KVM for an emulator in this environment |

Full record and toolchain versions: `mobile/BUILD.md`.

## 6. Reproducing everything above

```bash
cd safepath
npm install                 # playwright + pg; the server itself has no runtime deps beyond pg
npm run test:security       # 81 checks, ~9 s, boots its own servers

# the same suite against a real PostgreSQL (provisions and drops a database per run)
TEST_BACKEND=postgres TEST_PG_BASE=postgres://user@127.0.0.1:5432/postgres \
  node tests/security-suite.mjs

npm run test:e2e            # 21 checks in headless Chromium, ~16 s

cd mobile
npm install
npm test                    # 122 mobile unit tests, ~2 s
npm run typecheck
bash e2e/run-device-tests.sh   # needs a device + Maestro; see DEVICE-TEST-PLAN.md
```

Every suite starts and stops its own server instances with temporary data
directories (or temporary databases), so they neither depend on nor disturb the
running dev server.

The Android build record is in `mobile/BUILD.md`. Installing the APK and running the
device harness are the two steps that remain before any runtime claim can be made.
