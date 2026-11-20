# SafePath mobile client

A React Native app that talks to the SafePath API in `../server`. It is a real,
buildable project: `npx expo prebuild` produces the native `android/` project, and
`./gradlew assembleRelease` produces an installable APK. See **Build** below.

> **Status, stated plainly.** The code builds and its logic is covered by 109 unit
> tests that run on Node. It has **not** been run on a physical phone. Background
> location, locked-screen behaviour and battery use are **unverified** — no results
> are reported for them anywhere in this repository, because none exist yet.
> `docs/DEVICE-TEST-PLAN.md` is the procedure that closes that gap, and
> `e2e/run-device-tests.sh` is the executable harness for it.

---

## What it does

| Screen | Behaviour |
| --- | --- |
| Sign in | Email → six-digit code. In a development build the server returns the code so a demo needs no mailbox; the app says so on screen. A production server refuses to start with that mode enabled. |
| Home | Create a group or accept an invitation. Accepting an invitation joins the group and **does not** start sharing. |
| Your sharing | Start / pause / stop. Background opt-in with the cost explained first. Check in once. Withdraw consent. Leave. Delete account. |
| Group | Every member's state, with the time the position was captured and its accuracy radius. "Not current" for anything older than two minutes. |

Deliberate absences: no location history, no map tiles, no analytics, no crash
reporter, no push messages, no child accounts, no way to change anyone else's sharing.

---

## Architecture

```
App.tsx
 └─ SessionProvider (src/state)        loads /api/me, pushes facts into the gate
     └─ screens/                      pure presentation
 src/controller.ts                    the single LocationController instance
     ├─ core/sharing.ts               mayCollect() / transmissionGate()
     ├─ core/outbox.ts                queue with purge-on-close
     ├─ core/freshness.ts             current / stale / unavailable
     └─ location/native.ts            expo-location + expo-task-manager
 src/location/backgroundTask.ts       headless task, defined before React mounts
```

**`src/core` imports nothing native and nothing from React.** Every rule that decides
whether a position leaves the phone lives there, which is why it can be tested on
Node without an emulator.

### Why Expo (SDK 58) rather than bare React Native

- `expo-location` + `expo-task-manager` are the supported way to get background
  location on both platforms, including the Android foreground service and the iOS
  background mode.
- `expo prebuild` generates a real native project, so the build is reproducible and
  is not tied to a hosted build service. Nothing here requires an Expo account.
- `expo-secure-store` gives Keychain/Keystore storage for the session token, which a
  plain AsyncStorage string would not.

### The rule the tests protect

Pause, sign-out, removal, leaving and consent withdrawal all do the same three things
in the same order, in `LocationController.setContext`:

1. stop the OS watcher (so the GPS stops, not just the upload),
2. destroy the outbox (so a position captured before the pause cannot be sent after
   it),
3. record the reason so the UI can explain it.

`Outbox.flush` re-asks the gate before *every* item, so a pause that happens mid-flush
stops the remainder. `src/core/controller.test.ts` asserts each of these against a
fake watcher and a fake network.

### Freshness

`classifyPosition` calls a fix **current** only below 120 s, **stale** below 15 min,
and **unavailable** after that (coordinates are hidden rather than shown old). A fix
whose timestamp is more than a minute in the future is treated as stale, because a
wrong device clock must not make a position look fresh. `PositionCard` is the only
component that renders a position, and it always renders the timestamp and the
accuracy radius; there is no prop that removes them.

---

## Build

Prerequisites: Node 20+ (22 LTS recommended), JDK 17 or 21, Android SDK with
platform 36 and build-tools 36, and `ANDROID_HOME` set.

```bash
npm install
npx expo prebuild --platform android --no-install   # generates ./android
cd android && ./gradlew assembleRelease             # -> app/build/outputs/apk/release/app-release.apk
```

`npm run build:android` wraps those two steps (see `scripts/build-android.sh`) and
copies the APK to `artifacts/`.

For a debug build on a connected device, which also starts Metro:

```bash
npx expo run:android --device
```

The API base URL is compiled in: `EXPO_PUBLIC_API_BASE`. Default
`http://localhost:8787`. An Android emulator reaches the host as `http://10.0.2.2:8787`;
a physical device needs the host's LAN address. Release builds block cleartext HTTP,
so a real deployment needs HTTPS.

---

## Tests

### Unit tests — no device required

```bash
npm test          # 109 tests, ~2 s
npm run typecheck
```

| File | What it covers |
| --- | --- |
| `src/core/sharing.test.ts` | every gate branch: signed out, removed, revoked, paused, off, consent withdrawn, background not consented, check-in while paused |
| `src/core/outbox.test.ts` | ordering, cap, expiry, corruption, purge, gate re-check per item, transient vs permanent failures |
| `src/core/controller.test.ts` | watcher start/stop, pause/logout/removal/consent teardown, stragglers, 403 teardown, recovery |
| `src/core/freshness.test.ts` | current/stale/unavailable, clock skew, labels never claim liveness |
| `src/core/format.test.ts` | timestamps in a pinned time zone |
| `src/core/redact.test.ts` | coordinates and tokens removed from logs |
| `src/api.test.ts` | bearer auth, typed errors, no endpoint that changes another member's sharing |

### Contract test — client against the real server (no device)

```bash
node e2e/contract.mjs        # 21 checks, starts its own server
```

Replays the exact requests `src/api.ts` makes against the real API and asserts the
responses the screens rely on. This is what proves the client is wired to the real
authorised API rather than to a mock that happens to agree with it.

### Device tests — require a phone or emulator

```bash
bash e2e/run-device-tests.sh
```

That script is the executable harness. It checks the prerequisites and stops with an
actionable message if one is missing, starts a throwaway API server, seeds **two
isolated accounts** (`e2e-user-a-<run>…`, `e2e-user-b-<run>…`), runs nine Maestro flows
in `e2e/flows/`, greps the device log for coordinates and tokens, and always deletes
the accounts again.

Nothing in this repository claims a device run has happened. The command above is what
produces the first real result.

---

## What is not implemented

- **No map.** Positions are shown as state + timestamp + accuracy, deliberately; tiles
  add a data processor for no value at this stage.
- **No push notification** for check-in requests or invitations. The requester and
  the recipient see state only when the app is open.
- **No offline sign-in.** The token is in the keychain, but `refresh()` needs the
  server; with no network the app shows the last known group state and collects
  nothing it cannot send.
- **No iOS build was produced here.** The same source and the same `app.json` produce
  the iOS project on a Mac (`npx expo prebuild --platform ios`); nothing constrains it
  that does not also apply to Android, but it is untested.
- **Locked-screen reliability is not guaranteed** by any part of this code. Android
  vendors and iOS both suspend or delay background work; `app.json` requests the
  permissions and the app explains the cost, but no promise of continuous tracking is
  made anywhere in the UI.
