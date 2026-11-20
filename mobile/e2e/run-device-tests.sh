#!/usr/bin/env bash
#
# Device test harness for the SafePath mobile client.
#
# This script is meant to be run on a developer machine with an Android device
# or emulator attached. It:
#
#   1. checks the prerequisites and fails with an actionable message if absent
#   2. starts a throwaway API server (unless --base-url points elsewhere)
#   3. seeds exactly two isolated accounts with the prefixes
#      e2e-user-a-<run> and e2e-user-b-<run>
#   4. runs the Maestro flows against the installed app
#   5. always cleans the accounts up again, and verifies they are gone
#   6. greps the device log for coordinates and tokens, failing the run if any
#      leaked
#
# Usage:
#   bash e2e/run-device-tests.sh                     # emulator, local server
#   bash e2e/run-device-tests.sh --device emulator-5554
#   bash e2e/run-device-tests.sh --base-url http://192.168.1.10:8790
#   bash e2e/run-device-tests.sh --skip-build       # app already installed
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E="$ROOT/e2e"
RUNTIME="$E2E/.runtime"
APP_ID="app.safepath.client"

DEVICE="${ANDROID_SERIAL:-}"
BASE_URL=""
SKIP_BUILD=0
PORT=8790

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

fail() { printf '\nFAIL: %s\n' "$1" >&2; exit 1; }
step() { printf '\n== %s\n' "$1"; }

mkdir -p "$RUNTIME"
SERVER_PID=""
cleanup_done=0

cleanup() {
  [[ $cleanup_done -eq 1 ]] && return
  cleanup_done=1
  step "Cleaning up E2E accounts"
  node "$E2E/fixtures.mjs" cleanup --base "${BASE_URL_RESOLVED:-}" || echo "cleanup reported an error" >&2
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------- prerequisites
step "Checking prerequisites"

command -v node >/dev/null || fail "Node.js is required (>= 20)."
command -v adb >/dev/null || fail "adb not found. Install Android platform-tools and put them on PATH."
command -v maestro >/dev/null || fail "Maestro not found. Install it with: curl -Ls https://get.maestro.mobile.dev | bash"

if [[ -z "$DEVICE" ]]; then
  DEVICE="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
fi
[[ -n "$DEVICE" ]] || fail "No Android device or emulator is attached. Start one, or pass --device."
echo "device: $DEVICE"

adb -s "$DEVICE" shell pm list packages | grep -q "$APP_ID" \
  || fail "The app ($APP_ID) is not installed on $DEVICE. Build and install it first:
    cd $ROOT && npx expo run:android --device
  or: bash scripts/build-android.sh && adb -s $DEVICE install -r android/app/build/outputs/apk/release/app-release.apk"

# ---------------------------------------------------------------- server
if [[ -z "$BASE_URL" ]]; then
  step "Starting throwaway API server on port $PORT"
  PORT="$PORT" node "$E2E/server.mjs" > "$RUNTIME/server.log" 2>&1 &
  SERVER_PID=$!
  BASE_URL="http://127.0.0.1:$PORT"
  for _ in $(seq 1 40); do
    if curl -sf "$BASE_URL/api/health" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  curl -sf "$BASE_URL/api/health" >/dev/null || { cat "$RUNTIME/server.log" >&2; fail "E2E server did not start."; }
  echo "server: $BASE_URL (pid $SERVER_PID)"
fi
BASE_URL_RESOLVED="$BASE_URL"

# The device cannot see the host's loopback. On an emulator the host is
# 10.0.2.2; on a physical device it is the machine's LAN address.
DEVICE_BASE_URL="${DEVICE_BASE_URL:-$BASE_URL}"
if [[ "$BASE_URL" == *"127.0.0.1"* || "$BASE_URL" == *"localhost"* ]]; then
  if [[ "$DEVICE" == emulator-* ]]; then
    DEVICE_BASE_URL="${BASE_URL/127.0.0.1/10.0.2.2}"
    DEVICE_BASE_URL="${DEVICE_BASE_URL/localhost/10.0.2.2}"
    echo "device will reach the API at: $DEVICE_BASE_URL (emulator host alias)"
  else
    LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"
    if [[ -z "$LAN_IP" ]]; then
      fail "Could not determine the host LAN address for a physical device. Pass --base-url http://<host>:<port>."
    fi
    DEVICE_BASE_URL="${BASE_URL/127.0.0.1/$LAN_IP}"
    echo "device will reach the API at: $DEVICE_BASE_URL (host LAN address)"
  fi
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  step "Rebuilding and installing the app against $DEVICE_BASE_URL"
  ( cd "$ROOT" && EXPO_PUBLIC_API_BASE="$DEVICE_BASE_URL" npx expo run:android --device "$DEVICE" --no-bundler ) \
    || fail "expo run:android failed; see the output above."
fi

# ---------------------------------------------------------------- fixtures
step "Seeding two isolated E2E accounts"
SEED_JSON="$(node "$E2E/fixtures.mjs" seed --base "$BASE_URL")" || fail "Could not seed E2E accounts."
echo "$SEED_JSON" > "$RUNTIME/seed.json"

read_field() { node -e "const r=require('$RUNTIME/seed.json');console.log(r$1)" ; }
EMAIL_A="$(read_field ".accounts[0].email")"
EMAIL_B="$(read_field ".accounts[1].email")"
FAMILY_NAME="$(read_field ".familyName")"
FAMILY_ID="$(read_field ".familyId")"
RUN_ID="$(read_field ".runId")"
OWNER_NAME="$(node -e "console.log(require('$RUNTIME/seed.json').accounts[0].email.split('@')[0].slice(0,40))")"
EMAIL_B_NAME="$(node -e "console.log(require('$RUNTIME/seed.json').accounts[1].email.split('@')[0].slice(0,40))")"

# The fixture script sets displayName to the local part of the address, which is
# what the app shows in the member list.
printf 'run %s\n  A: %s\n  B: %s\n  group: %s (%s)\n' "$RUN_ID" "$EMAIL_A" "$EMAIL_B" "$FAMILY_NAME" "$FAMILY_ID"

# ---------------------------------------------------------------- logcat baseline
step "Clearing device log"
adb -s "$DEVICE" logcat -c || true

# ---------------------------------------------------------------- flows
step "Running Maestro flows"
MAESTRO_STATUS=0
maestro test "$E2E/flows" \
  -e EMAIL_A="$EMAIL_A" \
  -e EMAIL_B="$EMAIL_B" \
  -e EMAIL_B_NAME="$EMAIL_B_NAME" \
  -e OWNER_NAME="$OWNER_NAME" \
  -e FAMILY_NAME="$FAMILY_NAME" \
  --device "$DEVICE" \
  --test-output-dir "$RUNTIME/maestro" 2>&1 | tee "$RUNTIME/maestro.log" || MAESTRO_STATUS=$?

# `tee` masks maestro's exit code through the pipe, so recover it.
if [[ ${PIPESTATUS[0]} -ne 0 ]]; then MAESTRO_STATUS=${PIPESTATUS[0]}; fi

# ---------------------------------------------------------------- log leak check
step "Checking the device log for coordinates and tokens"
adb -s "$DEVICE" logcat -d -s ReactNativeJS:V > "$RUNTIME/logcat-reactnative.txt" 2>/dev/null || true

LOG_FILE="$RUNTIME/logcat-reactnative.txt"
leak=0

if grep -Eq -- '-?[0-9]{2,3}\.[0-9]{5,}' "$LOG_FILE"; then
  echo "Coordinate-like values found in the device log:" >&2
  grep -Eo -- '-?[0-9]{2,3}\.[0-9]{5,}' "$LOG_FILE" | head -5 >&2
  leak=1
fi

if grep -Eq -- '(Bearer [A-Za-z0-9._-]{16,}|sessionToken)' "$LOG_FILE"; then
  echo "Token-like values found in the device log:" >&2
  grep -E -- '(Bearer [A-Za-z0-9._-]{16,}|sessionToken)' "$LOG_FILE" | head -3 >&2
  leak=1
fi

if [[ $leak -eq 1 ]]; then
  echo "Log leak check FAILED" >&2
  MAESTRO_STATUS=1
else
  echo "No coordinates or tokens in $(wc -l < "$LOG_FILE") log lines."
fi

step "Result"
if [[ $MAESTRO_STATUS -eq 0 ]]; then
  echo "PASS - device flows completed and the log is clean."
else
  echo "FAIL - see $RUNTIME/maestro.log and $LOG_FILE" >&2
fi

exit $MAESTRO_STATUS
