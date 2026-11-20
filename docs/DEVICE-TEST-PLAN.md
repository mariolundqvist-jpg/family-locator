# Device test plan — background location and reliability

**Status: NOT EXECUTED.** No iOS or Android hardware was available in the
environment where this was built. Every row in the results table is empty on
purpose. Do not fill any of it in without a device, a name and a date.

Results must be recorded in `TEST-RESULTS.md`, in the "Physical device" section —
never mixed into the automated results.

The mobile client is now a complete, buildable project, and the automated part of
this plan is a script rather than a description. Running it is the first step:

```bash
cd mobile
bash e2e/run-device-tests.sh            # emulator, or:
bash e2e/run-device-tests.sh --device <serial>
bash e2e/run-device-tests.sh --base-url https://staging.example.com   # staging
```

What that script does, in order, and fails on:

1. **Prerequisites.** `node`, `adb`, `maestro`, a connected authorised device and the
   app installed under `app.safepath.client`. If any is missing it stops and tells you
   the exact command to fix it.
2. **Server.** Starts a throwaway API server on port 8790 with a temporary data
   directory (or uses `--base-url`). On an emulator it rewrites `127.0.0.1` to
   `10.0.2.2` for the app; on a physical device it uses the host's LAN address.
3. **Two isolated accounts.** `node e2e/fixtures.mjs seed` creates
   `e2e-user-a-<run-id>@safepath.test` and `e2e-user-b-<run-id>@safepath.test`, makes A
   the owner of a group, and has B accept a single-use invitation. The run id is in the
   address, so parallel runs cannot collide.
4. **Nine Maestro flows** in `mobile/e2e/flows/`: sign-in, opening the group, starting
   sharing (with the OS permission dialog), pause, resume, background opt-in, the second
   account signing in, consent withdrawal, and removal by the owner. JUnit XML is written
   to `mobile/e2e/.runtime/maestro-results.xml`.
5. **Log leak check.** `adb logcat` is cleared before the run and read afterwards; the
   script fails if it finds anything matching `-?\d{2,3}\.\d{5,}` (a coordinate) or a
   bearer token. This is the on-device counterpart to the server-side log checks in the
   API suite.
6. **Cleanup, always** — including when a flow fails or you press Ctrl-C. Both accounts
   delete themselves through `DELETE /api/me/data`, then the script verifies the owner
   can sign in again with no memberships left.

The script cannot test the things below that need a human holding a phone: battery,
vendor battery managers, real GPS drift, and what happens when the OS kills the app.
Those stay manual, and the tables below are for recording them.

---

## 0. Before you start

| Requirement | Detail |
| --- | --- |
| Build | `cd mobile && npm run build:android`, or `npx expo run:android --device` for a debug build with Metro |
| Server | For the automated flows, the script starts one. For manual runs: reachable from the phone. HTTPS is required for a browser client and for a release Android build; for a debug build on a LAN, cleartext is allowed and that is fine. |
| Accounts | Two consenting adults, two devices, two different email addresses. For automated runs the script creates and deletes them itself. |
| Instrumentation | Server logs with timestamps (`LOG_REQUESTS=1`) so the *arrival* time of each update can be compared with the *capture* time. Server logs never contain coordinates — that is asserted by the test suite. |
| Recording | For each run: device model, OS version, battery level at start, screen-lock method, network type |

**Test on at least:** one iPhone (Face ID or passcode lock) and one mid-range
Android (e.g. Pixel 6a / Samsung A-series). Do not test only on flagships — battery
behaviour on a mid-range Android is where this usually fails.

---

## 1. Foreground baseline (must pass before anything else)

| # | Test | How | Pass criteria |
| --- | --- | --- | --- |
| F1 | First run consent | Fresh install, create a group | Consent screen appears *before* any OS location prompt; declining leaves the app usable |
| F2 | Foreground fix | Turn sharing on | A position arrives within 30 s and is labelled `current` |
| F3 | Second adult sees it | Open the app on device B | Position appears with age and accuracy radius; the age is within 5 s of the true age |
| F4 | Permission revoked mid-session | Settings → deny location while app is open | App shows an explicit error; no position is claimed as current; server records no new fix |
| F5 | Check in while paused | Pause, then check in | One position is shared, labelled as a check-in; sharing state stays paused |

---

## 2. Background behaviour (the part a web preview cannot prove)

| # | Test | How | Pass criteria | Record |
| --- | --- | --- | --- | --- |
| B1 | Background consent is separate | Turn on sharing, do not touch the background control | No background task starts; `hasStartedLocationUpdatesAsync` is false; Android shows no persistent notification | ☐ |
| B2 | Background updates with screen locked | Enable background, lock the device, leave untouched for 30 minutes | Updates arrive at approximately the configured interval (120 s), not zero and not continuous | ☐ |
| B3 | Locked screen, 8 hours | Enable background, lock overnight | Count updates received; note any gap longer than 10 minutes and the battery delta | ☐ |
| B4 | Android foreground service visible | Enable background on Android | A persistent notification exists and names the app; it cannot be dismissed without stopping sharing | ☐ |
| B5 | iOS background indicator | Enable background on iOS | The blue status indicator appears while background updates are active | ☐ |
| B6 | Force-quit the app | Swipe-kill the app | Record what happens on each platform (iOS normally stops updates; Android behaviour depends on the service). **Record it, do not assume it.** | ☐ |
| B7 | Stop means stop | Turn off background while locked | No further updates arrive; notification disappears; server has no new fixes | ☐ |
| B8 | Consent withdrawn on another device | Sign in on device B as the same user, withdraw consent | Device A stops sending within one interval; server refuses further updates | ☐ |

---

## 3. Permissions and degradation

| # | Test | Pass criteria | Record |
| --- | --- | --- | --- |
| P1 | Approximate location only (iOS 14+ "Precise: off") | App works, accuracy radius is large, UI does not pretend otherwise | ☐ |
| P2 | "Allow once" on iOS | Position arrives; app does not claim background capability | ☐ |
| P3 | Android "Allow all the time" vs "While using the app" | Background control only offered when the OS grant supports it; otherwise the app explains what to change | ☐ |
| P4 | Location services off system-wide | Clear message, no crash, no false "current" | ☐ |
| P5 | Battery saver / low-power mode | Note interval and gaps; confirm the app does not present itself as reliable | ☐ |
| P6 | Background app refresh disabled (iOS) | Record actual behaviour | ☐ |

---

## 4. Weak signal, no signal, wrong signal

| # | Test | How | Pass criteria | Record |
| --- | --- | --- | --- | --- |
| G1 | Weak GPS (indoors, urban canyon) | Stand in a building, in a street between tall buildings | Accuracy radius grows honestly; the pin is not drawn tighter than the reported radius | ☐ |
| G2 | No fix at all | Airplane mode on | The member shows `unavailable`, not a stale dot pretending to be live | ☐ |
| G3 | Network loss | Airplane mode while sharing | Updates stop; the app says the update failed; on reconnect it resumes without duplicating | ☐ |
| G4 | Flapping network | Toggle airplane mode every 20 s for 5 minutes | No duplicate positions, no crash, no queued backlog uploaded later (positions must not be stored and replayed) | ☐ |
| G5 | Device clock wrong by +10 minutes | Change device time forward | Server rejects or marks `unavailable` (clock skew guard); app surfaces this honestly | ☐ |
| G6 | 24-hour offset | Set a wrong timezone | Timestamps still render correctly to the user | ☐ |

---

## 5. Battery

Battery claims must be **measured**, never estimated. Use each platform's own
battery screen and record the numbers.

| # | Test | Method | Record |
| --- | --- | --- | --- |
| E1 | Baseline drain | 1 hour, app installed but not sharing | Start %, end %, screen-on time | ☐ |
| E2 | Foreground only | 1 hour with 9 minutes of active session | % delta, attributed to app | ☐ |
| E3 | Background, 1 hour | Screen locked, background updates on | % delta | ☐ |
| E4 | Background, 8 hours | Overnight | % delta and any OS battery warning | ☐ |
| E5 | iOS battery usage by app | Settings → Battery → SafePath | Record the reported "Background" time | ☐ |
| E6 | Android battery optimisation | Settings → Battery usage | Record mAh and % if available | ☐ |

> A useful sanity check: at 120 s intervals with balanced accuracy, expect a
> noticeable but not dramatic drain on a modern device, and a much larger one on an
> older mid-range Android. That is a hypothesis. If you have not measured it, write
> "not measured" — do not write a number.

---

## 6. What to write up

For every row, record:

```
test_id · device (model, OS version) · date · observed behaviour ·
pass/fail · anything surprising · log excerpt (timestamps only, no coordinates)
```

Then copy the row into `TEST-RESULTS.md` §3 and update the reliability statement in
`README.md`. Until then the README must continue to say background tracking is
unverified.
