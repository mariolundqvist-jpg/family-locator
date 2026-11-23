#!/usr/bin/env bash
# Reproducible Android release AAB build for Google Play Console.
#
#   bash scripts/build-aab.sh [--clean]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" == "--clean" || ! -d android ]]; then
  npx expo prebuild --platform android --no-install
fi

node scripts/configure-android.mjs

( cd android && ./gradlew bundleRelease --no-daemon --console=plain )

AAB="android/app/build/outputs/bundle/release/app-release.aab"
mkdir -p artifacts
cp "$AAB" artifacts/safepath-release.aab
echo
echo "AAB created: artifacts/safepath-release.aab"
