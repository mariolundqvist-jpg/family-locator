# Privacy risk assessment — SafePath prototype v0.1

**Status:** started alongside implementation, version 0.1, **not a completed DPIA**
**Date:** 27 October 2026
**Scope:** the runnable web prototype in `server/` and the native reference source in `mobile/`
**Who must own the next version:** a qualified DPO with children's-data experience. Nothing here substitutes for that.

> This is a working risk assessment written by the people who built the thing, at the
> point they built it. It exists so that the questions a DPIA will ask are answered
> from evidence rather than reconstructed later. It is deliberately honest about what
> is unmitigated.

---

## 1. What processing this prototype actually does

| # | Processing | Data | Lawful basis (proposed) |
| --- | --- | --- | --- |
| P1 | Sign-in by email | Email address, display name, IP, user agent (session only) | Contract (Art. 6(1)(b)) |
| P2 | Family group membership | User id, membership record, role, join/leave timestamps | Contract |
| P3 | **Last-known location** | Latitude, longitude, accuracy radius, capture time, source (foreground/checkin) | **Explicit consent** (Art. 6(1)(a)) |
| P4 | Consent records | Scope, version string, timestamp | Compliance record keeping (Art. 7(1)) |
| P5 | Security/audit log | Event name, opaque user id, IP for auth events **only** | Legitimate interests (Art. 6(1)(f)) — security |
| P6 | Background location *(native only, unimplemented in the running build)* | As P3, more frequently | Separate explicit consent |

**Not processed anywhere in this build:** contacts, address book, photo library,
advertising identifiers, device fingerprints, motion/activity recognition, continuous
location history, and any data about a person who has not signed in themselves.

### 1.1 The single most important design decision

**There is no location history table.** A position is stored as one row per member,
overwritten on each update and hard-deleted after the retention window. A breach of
this database reveals where each consenting member was *within the last 15 minutes*,
or nothing at all. That is a materially different risk profile from a breadcrumb
trail, and it is the cheapest mitigation in the entire product.

Consequence to accept: the "incident timeline" idea from the market research is
**not compatible with this data model** in version 1. It would require building a
history store and a much stronger justification. That trade-off is deliberate.

---

## 2. Data map — where data is processed and stored

| Location | What | Provider | Retention |
| --- | --- | --- | --- |
| Application server (single process) | All records in one JSON document, `0600`, atomic rewrite | Wherever this is hosted — **currently `localhost` only** | Until deleted or retention sweep |
| Append-only audit log (`audit.jsonl`) | Event names, opaque ids, IP for auth events | Same host | Indefinite in this build; **must be rotated and capped before production** |
| Browser | Session cookie (HttpOnly, SameSite=Lax) | User's device | Session TTL (12 h absolute, 2 h idle) |
| Browser | Nothing in `localStorage`; no analytics; no third-party scripts | — | — |
| Native client (built; not yet run on a device) | Session token in iOS Keychain / Android Keystore | User's device | Until sign-out or uninstall |

**There are no sub-processors in the running prototype.** No email provider, no push
provider, no map tiles, no analytics, no CDN. Every provider that would appear in a
production data map is listed in `CREDENTIALS-NEEDED.md` with what it would receive.

### 2.1 International transfers

None today. This changes the moment an email provider or managed database is added;
both are almost certainly US-headed, and would need the UK IDTA/Addendum and a
transfer risk assessment before use. Flagged as **R-09**.

---

## 3. Risk register

Scored before the mitigation that is already implemented.

| ID | Risk | Likelihood | Impact | Score | Implemented mitigation | Residual |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | **One adult enables another adult's tracking without their knowledge** | High in the category, **impossible here** | Severe | — | No API accepts another member's id for consent or sharing. `POST /api/me/sharing` takes only `{state}` and is scoped to the caller's own memberships; strict field validation rejects anything else (`assertFields`). Proven by test: *"No endpoint lets one member change another member's sharing"*. | **Accepted as designed-out.** No residual path exists in the code. |
| R-02 | **Invitation is read as location authorisation** | High in the category | Severe | — | Joining creates `sharingState:'off'` and an empty consent record. The API response states `locationAuthorisedByInvite: false`; the join dialog says so before the button. Proven by tests at the API and browser level. | Low. Wording review by a plain-language editor still recommended. |
| R-03 | Covert tracking via hidden or background mode | High in the category | Severe | — | Web build has no background capability. Native reference requires a **second explicit consent**, an OS-level background permission, and an undismissable Android foreground-service notification. | **Medium until device testing** — see R-06. |
| R-04 | Stale position read as current, leading a parent to believe a child is somewhere they are not | Medium | High | 6 | Freshness is computed **server-side** from the server's clock. Client cannot mark a fix as current. Three states (`current` ≤120 s, `stale` ≤15 min, `unavailable`) rendered distinctly with the age and the accuracy radius every time. A device clock more than 2 minutes ahead forces `unavailable`. Proven by test: *"A fix inside the stale window is reported as stale"*. | Low, but **the interface must never imply that a dot is a person**. Ongoing copy discipline. |
| R-05 | Leak of location data through another member's removed access | Medium | High | 6 | Membership checked server-side on every read; 404 (not 403) so a non-member cannot even confirm the group exists. Removal and leaving purge the stored position immediately. Proven by tests: cross-family read, removed-member access, cross-family position write. | Low. |
| R-06 | Background location keeps running after consent is withdrawn | Medium | Severe | 6 | Server refuses background updates without a recorded background consent. The native task stops itself on `401`/`sharing_off`/`consent_required`. **Not verified on a device.** | **High until device testing.** This is the single largest unverified risk in the build. |
| R-07 | Child's location processed without adequate safeguards | — | Severe | — | **Not applicable to this build: no child accounts exist.** The join flow has no age field and no child path. Testers must be consenting adults. See §5. | N/A now; **blocking for any child feature.** |
| R-08 | Audit log itself becomes a surveillance record | Low | Medium | 2 | Audit records event names and opaque ids only, never coordinates (proven by test). It is append-only and visible to the user as "your recent activity". | Medium: no rotation in this build. Cap and rotate before production. |
| R-09 | International transfer without a transfer mechanism | Medium (on any provider addition) | Medium | 4 | None yet, because no providers are integrated. | **Open.** Must be resolved before the first provider is added. |
| R-10 | Support burden leaks personal data (screenshots, emails containing locations) | Medium | Medium | 4 | No support channel exists yet. | **Open.** Needs a written no-location-in-screenshots rule and a redaction procedure. |
| R-11 | Account deletion leaves resurrectable traces | Low | Medium | 2 | Deletion removes user, memberships, positions, sessions and pending codes; the family is deleted if nobody remains. Proven by tests. Audit lines retain opaque ids that no longer resolve to a person. | **Low but stated**, in the delete confirmation and here. |

---

## 4. Data minimisation decisions and their costs

| Decision | What it costs us | Why it stays |
| --- | --- | --- |
| No location history | No "where were they at 15:40" feature; weaker retention | A breach is survivable; no profiling possible |
| Coordinates rounded to 6 dp (~11 cm), accuracy stored as a radius | Nothing meaningful | Precision beyond the reported accuracy is a liability, not a feature |
| 15-minute retention | Users who open the app after a gap see "unavailable" | Shortest window that still answers "where are they now" |
| No address-book upload | Slower invite flow | The most common way family apps leak data about *non-users* |
| No analytics SDK | No funnel visibility | Every third-party script is a processor we would have to name and justify |
| No ads tier | Lower revenue per free user | Structurally incompatible with the trust promise, and a children's-advertising hazard later |

---

## 5. Children — deliberately out of scope

The brief for this build is explicit, and the assessment follows it: **child accounts
are a separate design, not a configuration flag.** Reasons this is not a small add-on:

1. **Consent cannot come from the child.** Under UK GDPR, a child's consent for an
   information-society service is only valid from age 13 (Art. 8), and the ICO's Age
   Appropriate Design Code applies 15 standards to any child-facing service.
2. **Guardian authority must be verified, not asserted.** A "this is my child" checkbox
   is not a control; the design needs a verifiable guardian–child relationship, which
   is a separate build with its own abuse cases (the non-custodial-parent problem).
3. **The interface must change, not just the copy.** A child-facing view needs its own
   transparency statement, its own defaults (highest privacy), and no nudge techniques.
4. **The threat model inverts.** For an adult, the adversary is the platform. For a
   child, the adversary may be a family member. That is a different product.

**Until that work is done and assessed:** no age field, no child accounts, no
under-18 testers, and the phrase "kids safety" stays out of any listing copy.

---

## 6. Obligations status

| Obligation | Status in this build | Blocks a public launch |
| --- | --- | --- |
| DPIA (Art. 35) | **Started** (this document); not completed | Yes |
| Lawful basis recorded | Proposed in §1; needs DPO sign-off | Yes |
| Transparency notice (Art. 13) | In-app explanations written; no external privacy policy | Yes |
| DSAR / erasure (Art. 15/17) | Export not built; **deletion built and tested** | Export required for launch |
| Retention schedule | Implemented and tested (15 min, configurable) | No |
| Processor agreements (Art. 28) | None exist — no processors integrated | Yes, before any provider is added |
| Age assurance | N/A (no child accounts) | N/A |
| PECR / e-marketing | No marketing email exists | No |
| ICO registration | **Not registered** — required before any processing of personal data at scale | Yes |
| Children's Code | N/A now; blocking for child features | Later |
| Consumer subscription rules | No payments integrated | Later |

---

## 7. What must happen before this handles real families' data

1. DPO completes a full DPIA, starting from this document and challenging it.
2. ICO registration and fee paid.
3. Privacy notice published, plus a plain-English summary of exactly what is stored.
4. A real hosting decision, with a data map that names every processor and region.
5. The device test plan executed and R-06 closed with evidence.
6. Article 15 export built (deletion already exists).
7. Audit log rotation and a written support-redaction procedure.
8. Independent penetration test of the running system.
9. A named individual accountable for the "no covert tracking" promise, with a
   regression test in CI that fails the build if a new endpoint accepts another
   member's id for sharing or consent.
