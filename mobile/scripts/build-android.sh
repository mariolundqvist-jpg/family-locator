#!/usr/bin/env bash
# Reproducible Android release build.
#
#   bash scripts/build-android.sh [--clean]
#
# Requires JDK 17+ and ANDROID_HOME pointing at an SDK with platform 36 and
# build-tools 36.0.0. Output is copied to artifacts/ so it survives a clean.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
if [[ -z "$ANDROID_HOME" ]]; then
  echo "ANDROID_HOME is not set. Install the Android SDK and export ANDROID_HOME." >&2
  exit 2
fi

if ! command -v java >/dev/null; then
  echo "java not found. Install JDK 17 or 21." >&2
  exit 2
fi

JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
if [[ "$JAVA_MAJOR" -lt 17 ]]; then
  echo "Java $JAVA_MAJOR is too old; the Android Gradle Plugin needs 17 or newer." >&2
  exit 2
fi

if [[ "${1:-}" == "--clean" || ! -d android ]]; then
  npx expo prebuild --platform android --no-install
fi

# prebuild skriver om android/ och tar då bort signering, Huawei-queries,
# allowBackup=false, behörighetsrensning och minnesinställningarna. Det här
# skriptet är idempotent och lägger tillbaka dem — körs alltid, inte bara vid
# --clean, eftersom det inte kostar något när allt redan stämmer.
node scripts/configure-android.mjs

echo "$ANDROID_HOME" > android/local.properties.tmp
sed -i.bak "s|^sdk.dir=.*|sdk.dir=$ANDROID_HOME|" android/local.properties 2>/dev/null || echo "sdk.dir=$ANDROID_HOME" > android/local.properties
rm -f android/local.properties.tmp android/local.properties.bak

( cd android && ./gradlew assembleRelease --no-daemon --console=plain )

APK="android/app/build/outputs/apk/release/app-release.apk"
mkdir -p artifacts
cp "$APK" "artifacts/safepath-$(date -u +%Y%m%dT%H%M%SZ).apk"
cp "$APK" artifacts/safepath-release.apk
echo
echo "APK: $(ls -la artifacts/safepath-release.apk | awk '{print $5" bytes"}')"
echo "Install with: adb install -r artifacts/safepath-release.apk"
