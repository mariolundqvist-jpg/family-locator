# Cover note and open decisions: SafePath (Family Locator) legal drafts

**Date:** 29 October 2026
**Operator:** Mario Lundqvist OÜ, registry code 17229617, Lõõtsa tn 5, 11415 Tallinn, Estonia
**Contact:** <mario.lundqvist@gmail.com>
**Governing law:** Estonia
**Version:** filled in — each open item now carries a decision, a basis and what still has to happen

***

## How to read this version

Every item below keeps its original question and then adds three lines:

| Marker | Meaning |
| --- | --- |
| **DECIDED** | Settled by the operator. The drafts can be updated to match; no further input needed. |
| **PROPOSED** | A recommendation with a reason. Needs a yes/no from the operator, and in some cases a lawyer's confirmation. |
| **OPEN** | Cannot be closed without something external: a domain, a provider choice, an accountant's answer, or a lawyer's opinion. |

Nothing in this document is legal advice. It records what the product actually does, so
that a lawyer can review the drafts against reality instead of against a description.

***

## Important statement

**These drafts have NOT been reviewed by a licensed Estonian lawyer.** They are general
drafting material and research aids. They are not legal advice and do not guarantee
compliance with GDPR, the Estonian Personal Data Protection Act, consumer law, or App
Store and Google Play rules. A licensed Estonian lawyer should review them before
publication, particularly the items marked as high priority.

***

## Files in this set

| File | Document | Language |
| - | - | - |
| privacy-policy-en.md / privacy-policy-sv.md | Privacy policy (GDPR Art. 13 and 14) | English / Swedish |
| terms-en.md / terms-sv.md | Terms of service | English / Swedish |
| cookie-policy-en.md / cookie-policy-sv.md | Cookie policy (app uses no cookies; website section conditional) | English / Swedish |
| integrations-policy-en.md / integrations-policy-sv.md | Third-party services and processors | English / Swedish |
| consent-summary-en.md / consent-summary-sv.md | In-app consent summary (about 120 words) | English / Swedish |
| open-decisions.md | This note | English |

All `[TODO]` markers in the drafts correspond to an entry below.

***

# HIGH: must resolve before any store submission or launch

## 1. Age rule

**Original:** The drafts state 18 and over. This drives the store age rating. Confirm, then align the store listing. There is no child mode in V1.

**PROPOSED — keep 18 and over.**

Reason: the service is location sharing between adults in a private group. There is no
child mode, no guardian verification, no moderation and no way to prevent an adult from
inviting a minor to a group. Allowing 13–17 would pull in GDPR Art. 8 (conditions for a
child's consent in information society services), plus a safeguarding duty the product
does not implement. Setting 18+ is the honest limit of what has been built.

**What follows from 18+**

| Item | Value | Note |
| --- | --- | --- |
| Terms of service | 18 years or older | Same sentence in EN and SV |
| Store rating, Apple | 17+ | Apple has no 18+ band; 17+ is the closest truthful label |
| Store rating, Google (IARC questionnaire) | Expect 18+ or 16+ | Answer the questionnaire truthfully; do not choose a lower band to widen reach |
| Consent text | No guardian flow | State that a group member who appears to be a minor may be removed |

**Still needed:** a yes/no from the operator. Then one change to `terms-*.md` and to the
purchase screen footer, and the store questionnaire is filled to match.

## 2. DPO appointment

**Original:** The drafts say no DPO is appointed. Systematic location sharing at scale may trigger GDPR Art. 37(1)(b).

**PROPOSED — no DPO in V1, but a written Art. 37 assessment on file and a named privacy contact.**

Art. 37(1)(b) turns on *large scale*. The indicators that matter are the number of data
subjects, the volume of data, the duration, and the geographic extent. V1 stores **one
position per person, overwritten, no history**, in groups a user has explicitly joined,
with no profiling, no advertising and no transfer to third parties. On any reasonable
reading that is not large scale.

**Threshold that should force a re-assessment** — write it into the internal register, not
into the policy:

- more than 10,000 monthly active users, or
- any form of location history or movement profiling, or
- any transfer of location data to a third party (mapping, analytics, advertising), or
- any public or cross-company deployment.

If any of those is reached, appoint a DPO or an external service and update the privacy
policy and the record of processing.

**What the drafts keep:** "No data protection officer has been appointed. Privacy
questions go to <mario.lundqvist@gmail.com> and are answered within one month."

**Still needed:** operator confirmation; the threshold table goes into the internal
compliance file, not the public documents.

## 3. DPIA

**Original:** Systematic location monitoring is likely to need a DPIA under GDPR Art. 35. The project's risk document is a starting point, not a substitute.

**PROPOSED — a DPIA is required and should be written before launch, using the existing risk assessment as input.**

Location sharing between adults, where one member can see another's movements in real
time, is systematic monitoring of individuals. It is also the kind of processing where
the failure mode is domestic control rather than a data breach, which is why Art. 35(3)
and most supervisory authority lists treat it as high risk.

**Method:** use the Estonian Data Protection Inspectorate's DPIA guidance and the
project file `docs/PRIVACY-RISK-ASSESSMENT.md`, which already lists risks and
mitigations. The DPIA needs four sections the risk document does not have: necessity and
proportionality, consultation of data subjects, residual risk acceptance, and a review
date.

**Risks that must appear in the DPIA** (each already has a mitigation in the code):

| Risk | Mitigation already built |
| --- | --- |
| A member uses the app to control or track another adult | Invitation must be accepted; sharing is opt-in per person; pause deletes the stored position and stops transmission; leaving or removal stops collection |
| Covert tracking by installing the app on someone else's phone | No auto-start, the ongoing notification is always visible, ToS prohibits it, and the app never hides its own icon |
| Location disclosed to someone outside the group | Server-side authorisation on every read, tested; no public links; invites expire in 30 minutes and are single use |
| Data kept longer than needed | No history in V1; one position per person; deletion on pause, leave and account deletion |
| Breach reveals where someone is | Minimal data set, no coordinates in logs, encrypted transport |

**Still needed:** the DPIA itself (half a day of work, not a provider purchase), then a
lawyer's read. It should be signed off before the store submission, not after.

## 4. Processor list and data processing agreements

**Original:** Named providers are missing for email delivery, hosting and database, support email, and (if used) crash reporting, maps and push notifications.

**DECIDED — what the product actually uses in V1:** one hosting provider, one email
provider, one support mailbox. No map provider, no push notification service, no crash
reporting, no analytics, no advertising SDK. This is verifiable in `mobile/package.json`
and in the server configuration, and it should stay that way as long as possible.

**PROPOSED — the list below.** Regions and providers are recommendations; each needs an
Art. 28 agreement before the first real user.

| Role | What it receives | Recommendation | Region | Transfer question |
| --- | --- | --- | --- | --- |
| Hosting + PostgreSQL | Email address, hashed codes, group names, latest positions | One EU provider — Hetzner (DE/FI), Scaleway (FR) or OVHcloud (FR); database on the same host, no managed third party | EU | None, if the region is in the EEA |
| Email delivery | Email address, sign-in code in the message body | **Change from Resend/Postmark (both US)** to an EU provider — Brevo or Mailjet (FR), or Scaleway Transactional Email. If US is chosen, SCCs plus a transfer impact assessment are required | EU | None, if EU |
| Support mailbox | Whatever the user writes in an email | The OÜ's existing mailbox provider; Proton (CH) is covered by an adequacy decision | EEA/CH | Adequacy decision |
| Crash reporting | Stack trace, device model, app version — **never** coordinates, email or group name | Only if adopted: Sentry with the EU data region, or self-hosted GlitchTip | EU | None, if EU |
| Maps | Nothing — there is no map provider in V1 | If added later: MapLibre with self-hosted or EU tiles, and coarse viewport rounding so exact homes are never in tile requests | EU | Depends on provider |
| Push notifications | Nothing — not used in V1 | If added later: Expo Push (US) or a self-hosted alternative | US | SCCs |

**Engineering note:** the server currently accepts `EMAIL_PROVIDER=resend|postmark`.
Choosing an EU email provider is a small adapter, not a rewrite; the send path is
already isolated in `server/lib/email.js`.

**Still needed:** pick the hosting and email providers, then sign the DPAs. Until then
the integrations policy keeps the phrase "the specific providers will be named here
before launch".

## 5. Location retention

**Original:** Decide whether only the latest position is stored, or whether any history is kept, and for how long. The drafts say pausing deletes the stored position; they do not say how long a position may remain while sharing is on.

**DECIDED — no history in V1.** The database holds at most one position row per person.
It is overwritten on the next update and deleted when the user pauses, leaves the group,
removes a member, withdraws consent or deletes the account. This is built and tested, not
intended.

**PROPOSED — the remaining number:**

| Data | Retention | Deleted when |
| --- | --- | --- |
| Latest position | Until replaced, and at most **24 hours** after the last update; then discarded automatically | Pause, leave, removal, withdrawal of consent, account deletion |
| Sign-in code | **10 minutes**, single use, stored hashed | Used or expired |
| Invitation | **30 minutes**, single use | Accepted, cancelled or expired |
| Session | **12 hours** | Sign-out, passwordless re-login, account deletion |
| Server logs | **30 days**, no coordinates, no tokens | Rolling deletion |
| Crash reports (if adopted) | **30 days** | Rolling deletion |
| Security events without personal data | **90 days** | Rolling deletion |
| Backup copies | **14 days** rolling | Automatic expiry |
| Deleted account | Personal data deleted immediately; payment settlement records kept **7 years** | Accounting Act § 12 |

**What the drafts must say:** the 24-hour rule, and that a position older than that is
not shown at all rather than shown as stale. Note that this is stricter than most
competitors and is a selling point, not a weakness.

**Still needed:** the accountant's confirmation of the 7-year period, and confirmation
that the hosting provider can honour 14-day rolling backups.

## 6. Withdrawal right for a digital subscription with no free trial

**Original:** Confirm how the EU consumer withdrawal right applies when the service starts immediately.

**PROPOSED — rely on Art. 16(m) of the Consumer Rights Directive, with an express
request and a separate acknowledgement collected before payment.**

The rule: a consumer normally has 14 days to withdraw from a distance contract. For
digital content supplied immediately, that right is lost only if the consumer gave
**express consent** to immediate performance **and** acknowledged that the right is
thereby lost. If that wording is missing, the 14-day right survives — and with a weekly
plan at €4.98 that is a real refund exposure.

**Proposed wording, Swedish (shown in the app, unticked):**

> ☐ Jag vill ha åtkomst direkt och förstår att jag förlorar min 14 dagars ångerrätt när
> åtkomsten börjar.

**Proposed wording, English:**

> ☐ I want access immediately and understand that I lose my 14-day right of withdrawal
> once access begins.

**Rules for the screen:**

- The checkbox is **not pre-ticked**, and the purchase cannot complete without it.
- It sits next to the price button, not in the terms document.
- The order button is labelled with the obligation to pay ("Prenumerera – 49,98 €/år"),
  never "Fortsätt" or "Nästa".
- Cancellation and renewal information is on the same screen. See LOW #1.

**Still needed:** a lawyer's confirmation of the exact wording for Estonia and for the
consumer's member state, and the store agreement's rule on who handles refunds —
typically the store, which means the withdrawal request lands in App Store Connect or
the Play Console, not in the operator's inbox.

***

# MEDIUM: needed for a complete and accurate launch

## 1. Legal basis for location data

**Original:** GDPR Art. 9 does not treat plain location as a special category. A lawyer should confirm this framing.

**DECIDED — consent under Art. 6(1)(a) for sharing, contract under Art. 6(1)(b) for
account and authentication.** Two separate records: the account exists under contract;
the position is shared under consent that can be withdrawn at any time without ending
the account.

**Why not legitimate interest:** the product's whole claim is that nothing is shared
without a yes. A legitimate-interest basis would contradict the consent screen and would
undermine the story in every store listing.

**Still needed:** the lawyer's confirmation that the framing holds. The implementation
already records consent with a version and a timestamp, and withdrawal is tested.

## 2. Crash reporting

**Original:** Choose a provider and confirm its region, IP handling, and that nothing beyond stack trace and device model is sent.

**PROPOSED — adopt it only when there is something to debug, and make it off by default
when it arrives.**

- Provider: Sentry with the EU data region, or self-hosted GlitchTip.
- Payload: stack trace, app version, OS version, device model. **No** coordinates, no
  email, no group name, no user id — the logging rule in the server already forbids this
  and the same rule applies on the device.
- IP addresses: discarded at ingest, not stored.
- Consent: no consent required if the payload is genuinely non-identifying; but given
  the product's promise, the switch is **off** until the user turns it on, prompted once
  after a crash rather than at first launch.

**Still needed:** a decision on whether to have it at all in V1. Doing without it is
defensible; shipping it silently is not.

## 3. Retention periods

Covered in HIGH #5, with the full table. The open part is the accounting period,
which the accountant must confirm.

## 4. Account deletion and active subscriptions

**Original:** Decide whether deletion is blocked while a subscription is active, or whether we cancel it.

**DECIDED — deletion is never blocked. Deleting an account does not cancel a store
subscription, and the app says so before the button is pressed.**

Blocking deletion while a subscription runs would breach App Store guideline 5.1.1(v)
and the equivalent Play policy, and it would be indefensible in a privacy product.
Cancelling on the user's behalf is not possible: subscriptions are managed by Apple or
Google, not by the app.

**Proposed flow:**

1. The privacy screen shows the subscription status, read from the store.
2. If a subscription is active, the delete button is preceded by a plain sentence:
   *"Din prenumeration avslutas inte när du raderar kontot. Säg upp den i App Store
   eller Google Play."* with a link that opens the subscription management page.
3. Deletion then proceeds immediately: group memberships removed, position deleted,
   email and display name removed, sessions invalidated.
4. What remains is a settlement record with no location and no email, kept for the
   accounting period only.

**Still needed:** confirmation from the store documentation that the management deep
link works in both stores for a subscription sold through that store.

## 5. Map provider

**DECIDED — no third-party map in V1.** The app shows members on a schematic view, not
on third-party tiles. `mobile/package.json` contains no map library. This removes a
whole category of transfers and is worth keeping for as long as the product can.

**PROPOSED if a map is added later:** MapLibre with self-hosted or EU-hosted tiles, and
rounding of viewport coordinates so that tile requests cannot be read back as someone's
home address. Never send the member's exact coordinate in a tile URL.

## 6. Display name

**DECIDED — an optional display name is collected, and it is the only name shown to
other members.**

- Free text, maximum 40 characters, sanitised.
- If it is empty, other members see **"Medlem"**. The email address is never shown to
  anyone but the account owner, not even partially.
- The display name is visible only inside groups the person has joined.
- It is deleted with the account, and it is not used for the crash reports, logs or
  support exports.

**Still needed:** nothing. The drafts should be updated to say this instead of leaving
the field ambiguous.

## 7. Liability cap and dispute wording

**Original:** The draft cap is 12 months of fees. Confirm the amount and the court and dispute resolution wording.

**PROPOSED — cap at the amount the user paid in the previous 12 months, with a floor of
€50, plus mandatory carve-outs.**

With a €49.98 annual plan the draft cap is €49.98, which is low enough that the clause
starts to look like a term the consumer gains nothing from. Under the Estonian Law of
Obligations Act (VÕS) § 42 a standard term in a consumer contract is unreasonably
prejudicial if it excludes or limits the trader's statutory liability for death or
personal injury, or for damage caused intentionally or by gross negligence
(§ 42(3) 1). VÕS § 106(2) separately bars excluding liability for intentional breach.
A floor of €50 keeps the cap meaningful without touching those carve-outs.

**Carve-outs that cannot be capped under Estonian law:** intent and gross negligence
(VÕS § 42(3) 1, § 106(2)), death or personal injury, and any liability that mandatory
consumer law imposes.

**Dispute wording:** governing law Estonia; the consumer may bring proceedings in their
own country of residence under the Brussels I bis rules, so the clause must say so rather
than pretend Tallinn is the only forum. Offer the European Consumer Centre and the
online dispute resolution route even though the ODR platform was discontinued — the
consumer still has the right to go to a consumer dispute body.

**Still needed:** a lawyer's redraft of the clause. This is the item most likely to be
unfair — in both directions.

***

# LOW: confirm before publication

## 1. Prices

**Original:** Not stated in any document, by design. Store price changes must be reflected in the purchase screen only.

**DECIDED — the price levels, set by the operator on 29 October 2026:**

| Plan | Price | Billing period | Free trial |
| --- | --- | --- | --- |
| Weekly | **€4.98** | Every 7 days, auto-renewing | None |
| Annual | **€49.98** | Every 12 months, auto-renewing | None |

**The arithmetic the purchase screen must show, because the two plans differ by a factor
of five:**

| | Weekly plan | Annual plan |
| --- | --- | --- |
| Price per period | €4.98 | €49.98 |
| Equivalent per year | **€258.96** (52 × €4.98) | **€49.98** |
| Equivalent per week | €4.98 | €0.96 |
| Saving versus a year of weekly payments | — | **€208.98 (80.7 %)** |

**Why this matters legally, not just commercially.** A weekly headline price that is
5.18 times the annual plan is exactly the pattern consumer authorities look at when they
test for a misleading "subscription trap". It is lawful to offer both. It becomes a
problem when the weekly option is made to look cheap and the annual plan is hidden, and
when the total yearly cost is not visible before payment. Therefore:

- Both plans are shown on the **same screen**, side by side.
- The weekly plan shows its annual equivalent next to the price, not in small print:
  *"4,98 €/vecka · 258,96 €/år"*.
- The annual plan is the one shown as selected, because it is the cheaper option; the
  weekly plan is never pre-selected. The selection is visible, not implied by colour alone.
- No pre-ticked consent boxes anywhere; the withdrawal acknowledgement starts empty.
- The price appears **in the button**, and again below it, together with the period,
  auto-renewal and cancellation.
- The sentence **"Ingen gratis provperiod"** stands on the same screen. It is not a
  footnote and not hidden in the terms.
- "Återställ köp" is always present.
- No countdown, no crossed-out price that was never charged, no pre-ticked box.

**Prices in the legal documents:** none. The documents say that the price, the period
and the renewal terms are shown in the app before payment, and that the applicable
price is the one displayed by the store at the time of purchase. This keeps the
documents valid when a price point changes.

**Store mechanics:**

- The figures above are **targets**, not guaranteed values. Apple and Google each have
  their own price points and set prices per territory; €4.98 may resolve to €4.99 on
  Apple. The app must read the live price from the store and never hard-code it.
- VAT: the stores act as merchant of record for in-app purchases and handle VAT. The
  operator receives the net settlement.
- Commission: expect 15 % on subscriptions, up to 30 % outside the small-business
  programmes. Confirm current rates before modelling revenue. As arithmetic only: at
  15 % the operator receives about €42.48 per annual subscription and €4.23 per weekly
  one, before VAT is accounted for by the store as merchant of record.
- Swedish krona and other currencies: set per territory in the store console, never in
  the app.

**Still needed:** check that the chosen price points exist in both stores, and confirm
the commission rates.

## 2. Contact details of the supervisory authority

**DECIDED — verified on 29 October 2026 against aki.ee:**

> Andmekaitse Inspektsioon
> Tatari 39, 10134 Tallinn, Estonia
> +372 627 4135 · info@aki.ee · www.aki.ee

The drafts should also name the consumer body and state that a complaint can be made to
the supervisory authority in the user's own country.

## 3. Website

**DECIDED — no SafePath website is published in V1. Remove the conditional website
section from the cookie policy.**

The app stores nothing in cookies and uses no analytics. The cookie policy keeps one
sentence: the app uses no cookies and no tracking, and the statement is kept for as long
as that is true.

**Exception:** the stores require a public URL for the privacy policy. See LOW #4.

## 4. Publication date and URLs

**OPEN — requires a domain, which requires the operator's purchase.**

Proposed, pending the domain:

| Store field | Proposed URL |
| --- | --- |
| Privacy policy | `https://<domain>/privacy` |
| Terms | `https://<domain>/terms` |
| Support | `https://<domain>/support` or `mailto:mario.lundqvist@gmail.com` |
| Account deletion (Apple requires a web route too) | `https://<domain>/delete-account` |

The privacy page can be a single static HTML file, no cookies, no scripts, no analytics —
which is what makes the cookie policy a one-liner. Nothing on it may load a third-party
font or a tracking pixel; a self-hosted file with system fonts is enough.

## 5. Encryption and security description

**PROPOSED wording, to be used only once each line is true:**

| Claim | Status before launch |
| --- | --- |
| TLS 1.2+ on every connection, HSTS enabled | **To do** — a reverse proxy in front of the Node server; the app already refuses plain HTTP in production builds |
| Passwords never stored | **True today** — passwordless sign-in, codes are hashed and expire in 10 minutes |
| Data encrypted at rest | **Depends on the provider** — choose a host whose volume and backups are encrypted, and say so only then |
| No coordinates in logs | **True today** — enforced in the logging layer and covered by tests |
| Access enforced on the server, not in the app | **True today** — every read is authorised server-side and tested |
| Breach notification within 72 hours | **To do** — a written procedure and a named contact, tested once on paper |

**Still needed:** the reverse proxy and the provider choice. Until then the documents say
"transport is encrypted" and nothing more.

## 6. Store declarations

**OPEN — prepared after decisions HIGH #1–#6 are settled.**

Apple's *App Privacy* and Google's *Data safety* sections must match the privacy policy
word for word on the following: email address (collected, for the account), approximate
and precise location (collected, shared with other users of the app), display name,
crash data (only if adopted), and — the part reviewers look for — whether the data is
encrypted in transit, whether users can request deletion, and whether any of it is used
for advertising or tracking (answer: no, and it must stay no).

***

## Claims deliberately avoided in all drafts

* SafePath does not alert emergency services and is not a safety service.
* No claim that location is accurate, live, or guaranteed.
* No free trial, anywhere — in the documents, in the store listing, or on the purchase screen.
* No price figures in the legal documents; the price is shown in the app, from the store's live value.
* No analytics or advertising by default, and no crash reporting unless the user switches it on.
* No covert tracking; acceptable use prohibits it.

***

## Changes this filled version makes to the drafts

| Document | Change |
| --- | --- |
| `terms-*.md` | 18+ confirmed; liability cap = 12 months of fees, floor €50, with carve-outs; dispute wording names the consumer's own forum; deletion does not cancel a subscription |
| `privacy-policy-*.md` | Retention table from HIGH #5; no history in V1; no map, push or analytics processors; contact and AKI details |
| `cookie-policy-*.md` | Website section removed; one sentence about no cookies in the app |
| `integrations-policy-*.md` | Processor table from HIGH #4, with region and DPA status; EU email provider preferred over US |
| `consent-summary-*.md` | Unchanged in substance; add that a deleted account does not cancel a store subscription |
| Purchase screen (not a legal document) | Both plans on one screen, annual equivalent of the weekly plan, express consent to immediate access, no pre-ticked boxes, "Ingen gratis provperiod" |

***

## Decisions I could not make for you

These still need an answer from the operator or a provider, and the drafts mark them
rather than guess:

1. **Age rule** — confirm 18+ (PROPOSED).
2. **Hosting and email provider** — pick from the table in HIGH #4, then sign the DPAs.
3. **Crash reporting** — yes or no for V1; if yes, off by default.
4. **Domain** — needed for every store URL.
5. **Accountant** — confirm the 7-year settlement record period.
6. **Lawyer** — the liability clause, the withdrawal wording, and the DPIA sign-off.
7. **Store price points** — check that €4.98 and €49.98 exist in both stores; adjust the
   targets if they do not.

## Suggested next step

1. Answer the seven items above. Two of them (age rule, crash reporting) are one-line
   decisions; three need a provider; two need a professional.
2. Sign a hosting and email provider in the EU, and keep the database on the same host.
3. Write the DPIA using `docs/PRIVACY-RISK-ASSESSMENT.md`, before the store submission.
4. Commission the lawyer's review with the DPIA and the processor list as inputs —
   specifically on the liability clause, the withdrawal wording, and the DPIA sign-off.
5. Update the drafts from the change table, then fill the store declarations from the
   final text.
