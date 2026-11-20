# Security tests — scope, method, and known gaps

**Files:** `tests/security-suite.mjs` (81 checks on JSON, 83 on PostgreSQL) ·
`tests/e2e-web.mjs` (21 checks) · `mobile/src/**/*.test.ts` (109 mobile unit tests) ·
`mobile/e2e/` (device harness, not yet executed)
**Run:** `npm run test:security`, `npm run test:e2e`, `cd mobile && npm test`
**Last executed:** 27 October 2026 · 81/81 (JSON), 83/83 (PostgreSQL), 21/21, 109/109

---

## Method

Every check drives the **real HTTP surface of the real server**. Nothing is mocked:

- Expiry is tested by booting a server with a 900 ms invitation TTL and waiting.
- Retention is tested with a 1.2 s retention window and a 400 ms sweeper.
- Session expiry is tested with a 1.2 s session TTL.
- Rate limiting is tested against a server with production defaults.
- Each run gets a fresh temporary data directory and its own port.
- The whole suite runs twice: once against the JSON file store and once against a real
  PostgreSQL 17 instance, which provisions and drops a database per run. The Postgres
  run adds two checks that query the `audit` table directly, which the HTTP surface
  cannot see.

This matters because the alternative — stubbing the clock — tends to test the stub.

---

## Coverage against the requirements

### Server-side membership and access

| Requirement | Test | Asserts |
| --- | --- | --- |
| Membership enforced on read | A user in family B reads family A | `404` (not `403`, so existence is not confirmed) |
| Membership enforced on write | Family B member posts with family A's `memberId` | `403` — member ids are scoped to the caller |
| Anonymous access | No session reads a family | `401` |
| Forged session | Hand-made cookie string | `401` |
| Session expiry | Server with 1.2 s TTL | `200` then `401` |
| Deleted user's session | Delete account, reuse cookie | `401` |

### Expired and invalid invitations

| Requirement | Test | Asserts |
| --- | --- | --- |
| Expiry | 900 ms TTL server, wait, then peek | `410 invite_expired` |
| Single use | Accept, then a second person accepts | `410 invite_used` |
| Withdrawal | Owner revokes, then accept | `403 invite_revoked` |
| Nonexistent token | Random 44-char string | `404` |
| Non-owner minting | Adult tries to create an invite | `403` |
| Token storage | Read the database file | Plaintext token absent, hash present |

### Removed members

| Requirement | Test | Asserts |
| --- | --- | --- |
| Immediate loss of access | Owner removes → removed member reads | `404` |
| Data purge | Inspect store after removal | Zero location rows for that member |
| Privilege | Adult tries to remove another member | `403` |
| Self-removal | Owner removes themselves via the member endpoint | `409` |

### Consent as a gate (not a formality)

| Requirement | Test | Asserts |
| --- | --- | --- |
| No consent → no position | Post a fix before consenting | `409 consent_required` |
| Consent ≠ sharing | Consent, then post without turning sharing on | `409 sharing_off` |
| Invitation ≠ consent | Accept invite → membership is `sharingState:'off'`, consent empty | API + browser tests |
| (Native) no background consent | Post with `source:'background'` | `409 background_consent_required` |
| Withdrawal deletes | Withdraw consent | Position row gone, sharing off |
| Pause deletes | Pause | Position row gone (not frozen) |

### No remote control of another person

| Requirement | Test | Asserts |
| --- | --- | --- |
| No such endpoint | Three plausible attack shapes (nested member sharing route, `memberId` in the body, family-level sharing route) | All fail: `400/404/405` |
| Unknown fields rejected | `POST /api/me/sharing` with an extra key | `400 unexpected_field` |
| Nudge ≠ control | Check-in request against a non-sharing member | `200`, and the member is still `sharingState:'off'` with no location |

### Data minimisation

| Requirement | Test | Asserts |
| --- | --- | --- |
| No history | 5 updates, then inspect the store | Exactly 1 row for that member |
| No history structure | Scan store keys | No `*histor*` collection exists |
| No coordinates in logs | Scan the audit JSONL | No `lat`/`lng`/`latitude`/`longitude` keys |
| Retention | Short-retention server | `current` → `stale` → `null`, and the row is physically deleted |
| Clock skew | Fix claimed 10 minutes in the future | `400` at write; `unavailable` if stored |

### Transport and session hardening

| Requirement | Test | Asserts |
| --- | --- | --- |
| CSRF header | Omit `x-safepath-client` on a POST | `403 csrf_header_missing` |
| Cross-origin | `Origin: https://evil.example` | `403` |
| Cookie flags | Inspect `Set-Cookie` | `HttpOnly`, `SameSite=Lax` |
| CSP | Inspect response headers | `default-src 'self'`, `object-src 'none'` |
| Native auth | Bearer token, no cookie | `200`; and the browser never receives the token in the body |

### Account deletion

Eight assertions: user record, positions, memberships and sessions all removed; the
session stops working; a family whose only member deleted their account is removed.

---

## Defects this suite found (and that were fixed)

1. Wrong-code loop returned "not correct" instead of locking out.
2. Withdrawn invitations returned a generic `403` without the `invite_revoked` code.
3. Wrong check order returned `sharing_off` where it should have said
   `consent_required`.
4. `POST /api/me/sharing` silently ignored an unexpected `memberId` — now rejected.
5. Browser crash in `renderMap` that left the member list stale after drawing pins.
6. A CSS `display` rule overriding the `hidden` attribute, so the "nobody is sharing"
   overlay never cleared.

Items 4–6 were found by the browser suite and would have shipped as visible bugs.

---

## Known gaps — stated, not hidden

| Gap | Consequence | How to close it |
| --- | --- | --- |
| **No device testing** | Background behaviour, permissions and battery are unverified | `DEVICE-TEST-PLAN.md` |
| **Single-process store** | Concurrent writes across processes are not safe; invite races are only proven within one process | Postgres with a unique constraint on active membership |
| **In-memory rate limiter** | Limits reset on restart and are per-instance | Shared store or edge limiter |
| **No penetration test** | Unknown unknowns | Commission one before launch |
| **No WAF / DDoS protection** | Not tested under load | Hosting layer |
| **No CSRF token, header only** | Relies on `SameSite=Lax` + custom header + origin check; adequate but not belt-and-braces | Add a per-session CSRF token if a same-site XSS ever becomes plausible |
| **No email verification beyond possession of the inbox** | Anyone with access to an inbox can sign in | That is the design; note it in any risk review |
| **Audit log unbounded** | Privacy and disk growth | Rotate and cap (R-08) |
| **No test for the native task** | R-06 remains open | Device testing |

---

## What would make me nervous about this build in production

1. The JSON store under a second process. It is the one shortcut that changes a
   correctness property.
2. Support conversations containing screenshots with coordinates in them.
3. Any future feature that needs location history — it would undo the central privacy
   decision and must go back through the DPIA.

---

## Secrets and coordinates never reaching a log

The server logs request lines without query strings, and the mobile client installs a
console filter at startup. Both are tested rather than asserted in prose.

| Requirement | Test | Asserts |
| --- | --- | --- |
| Coordinates never logged | Sign in, post a fix at 47.497912 / 19.040235, read the server's own stdout/stderr | No latitude, no longitude, and no number matching `-?\d{2,3}\.\d{5,}` anywhere in the output |
| Session tokens never logged | Same run | No `Bearer …` value in the output |
| Sign-in codes never logged | Request a code, then scan the output | The issued code does not appear |
| Audit storage holds no coordinates | Postgres run: `select event, fields from audit` | No coordinate-shaped number, no 64-hex token digest |
| Activity feed holds no coordinates | `GET /api/me/activity` | No `lat`/`lng` keys, no coordinate-shaped number |
| Client-side redaction | `mobile/src/core/redact.test.ts` | Keys, strings, query strings and long opaque secrets are removed; the console wrapper is exercised |
| Demo auth cannot reach production | Spawn the server with `NODE_ENV=production DEV_DELIVERY=1` | Exits non-zero with "Refusing to start in production", naming `DEV_DELIVERY`, `DATABASE_URL` and `EMAIL_PROVIDER` |
| Storing a fix twice is not a history | Post two fixes, read the store | Exactly one row exists for that member |

## Gaps

- **No physical device has run the client.** The device harness exists and is
  executable, but its results are empty. See `TEST-RESULTS.md` §4.
- **No independent penetration test.**
- **Single-instance concurrency only.** The Postgres store serialises writes with an
  advisory lock and loads rows per mutation; that is correct but will not scale past
  hundreds of families. It is a known limitation, not a hidden one.
- **The mobile gate is tested on Node.** A real OS can deliver a callback after the
  gate closes; the code discards such a sample, and there is a unit test for it, but
  the platform behaviour itself is unverified.
