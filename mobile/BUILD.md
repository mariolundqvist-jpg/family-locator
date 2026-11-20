# Build record — Android release APK

This is a record of a build that actually ran, with the numbers it produced. It is not
a description of what a build would do.

**Result: `BUILD SUCCESSFUL in 48s` incremental · 333 tasks · APK 39,752,647 bytes.**

**This is the fifth build**, made on 29 October 2026 after the workspace snapshot dropped
`mobile/assets/`, `mobile/artifacts/` and `design/assets/`. The assets were regenerated
with `design/make-assets.py` and the APK rebuilt to the **same size, byte for byte in
size terms** (39,752,647 B), which is what reproducibility is supposed to look like.
`safepath-release.apk` sha256 prefix: `fe8af23686395f44`.

**The fourth build**, also 29 October 2026, added the app icon and the splash screen. It replaced the artefact from the third build, which had the Expo
template's placeholder icon. The new APK contains the icon: `aapt2 dump resources`
lists `mipmap/ic_launcher_{background,foreground,monochrome}`, and the drawables were
extracted from the archive and rendered to `design/assets/verifiering-apk.png`.

The previous artefact, from the **third** run, was 39,918,001 bytes. The cold build took 16m 8s; two source
fixes were then found during review, and each rebuild took under a minute (59 s, 46 s)
because only bundling, shrinking and packaging were invalidated. The APK below is from
the final run, and its JS bundle was searched to confirm the fixes are in it.

---

## What was built

| | |
| --- | --- |
| Command | `./gradlew assembleRelease --no-daemon` in `android/` |
| Date | 29 October 2026 |
| Output | `android/app/build/outputs/apk/release/app-release.apk` |
| Copy kept at | `mobile/artifacts/safepath-release.apk` (build directories are not kept) |
| Package | `app.safepath.client` |
| versionName / versionCode | `0.2.0` / `1` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 37 |
| ABIs | `arm64-v8a` (physical devices), `x86_64` (emulators) |
| Size | 39,752,647 bytes |
| JS engine | Hermes, bytecode version 99, `assets/index.android.bundle` = 1,426,688 bytes |
| Signing | Android **debug** keystore — installable, **not shippable** |

## Toolchain

| Component | Version |
| --- | --- |
| Node | 20.20.2 (Expo warns it wants ≥ 22.13; the build succeeded regardless) |
| Expo SDK | 58.0.20 |
| React Native | 0.88.0 (new architecture enabled) |
| React | 19.3.0 |
| JDK | OpenJDK 21.0.13 (Debian) |
| Gradle | 9.4.1 |
| Android SDK | platform 36, build-tools 36.0.0, platform-tools 37.0.1 |
| NDK / CMake | CMake 3.22.1, installed automatically by the build |
| Host | 2 vCPU, ~2 GB RAM plus a 6 GB swap file |

The host is the reason the build took 16 minutes and needed a swap file; on a normal
developer machine with 8 GB or more this is a five-to-eight minute build. The first
attempt was killed by the OOM killer with the default Gradle heap (−Xmx2048m), which is
why `android/gradle.properties` in this repository now caps it at 1536 MB and builds a
single ABI pair. Those are local settings; delete them if your machine has the memory.

## Verification of the artefact

Not just "the build exited zero" — the archive was opened and inspected:

```
$ aapt dump badging app-release.apk
package: name='app.safepath.client' versionCode='1' versionName='0.2.0'
sdkVersion:'24'
targetSdkVersion:'36'
uses-permission: name='android.permission.ACCESS_BACKGROUND_LOCATION'
uses-permission: name='android.permission.ACCESS_FINE_LOCATION'
uses-permission: name='android.permission.FOREGROUND_SERVICE_LOCATION'
...

$ file assets/index.android.bundle
Hermes JavaScript bytecode, version 99

$ apksigner verify --print-certs app-release.apk
Signer #1 certificate DN: CN=Android Debug, ...
```

The bundle contains this application's strings and the symbols from the final source
revision, which is the check that the APK is neither a template artefact nor a stale copy
from an earlier run:

```
"Not current"                    FOUND     (UI copy)
"Sharing paused"                 FOUND
"Demo sign-in code"              FOUND
"Keep sharing while your screen is locked"   FOUND
handleHeadless                   FOUND     (the headless background fix)
normaliseSamples                 FOUND     (raw-location validation)
startWatcher                     FOUND     (gate-controlled watcher)
familyId on the accept response  absent    (the join-flow bug, fixed)
```

## What this proves, and what it does not

**Proven:** the project compiles from source, including React Native's C++ layer, the
autolinked native modules (`expo-location`, `expo-task-manager`, `expo-secure-store`,
AsyncStorage), Hermes bytecode generation, resource merging, R8 shrinking and APK
packaging and signing. The manifest carries the location and foreground-service
permissions the feature needs. The JS in the APK is this code.

**Not proven:** that it runs. No device or emulator was available in this environment
(no KVM, 2 GB RAM), so the APK has never been installed. Nothing about runtime
behaviour, background delivery, locked-screen behaviour or battery use follows from a
successful build, and no such claim is made. Installing it and running
`mobile/e2e/run-device-tests.sh` is the next step, and it is the only thing that can
produce those results.

**Also not done:** an iOS build. That requires macOS and an Apple developer account;
neither was available. `npx expo prebuild --platform ios` is the equivalent first step.

## Rebuilding elsewhere

```bash
cd mobile
npm install
npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease
```

Or `bash scripts/build-android.sh`, which also copies the result into `artifacts/`.
Before distributing anything, generate a real keystore (`keytool -genkeypair`) and
configure `signingConfigs.release`; shipping the debug-signed APK would be a mistake.


---

## Rebuilding from a clean workspace

The workspace snapshot does not keep large SDK binaries or package caches, so a rebuild
from scratch needs these installed first. Each was hit and solved on 29 October 2026.

| Problem | Message | Fix |
| --- | --- | --- |
| No JDK 17+ | `java 11` | `sudo apt-get install openjdk-21-jdk-headless`, then `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64` |
| Stripped NDK in the SDK | `[CXX1101] NDK at …/ndk/27.1.12297006 did not have a source.properties file` | Delete the directory — the Android Gradle Plugin downloads the correct NDK itself (2.0 GB) |
| No CMake/Ninja | `[CXX1416] Could not find Ninja on PATH or in SDK CMake bin folders` | `sudo apt-get install ninja-build cmake`, then add `cmake.dir=/usr` to `android/local.properties` |
| `expo prebuild` resets memory tuning | Gradle daemon OOM on 2 GB RAM | Re-apply `-Xmx1280m -XX:MaxMetaspaceSize=768m`, `org.gradle.parallel=false`, `org.gradle.workers.max=1`, `kotlin.compiler.execution.strategy=in-process`, `reactNativeArchitectures=arm64-v8a,x86_64` |
| Lint runs out of metaspace | `java.lang.OutOfMemoryError: Metaspace` at `:app:lintVitalAnalyzeRelease` | Raise `-XX:MaxMetaspaceSize` to at least 768m and run Kotlin in-process; with 384m the lint step kills the daemon |
| Stale Gradle daemons hold the journal lock | `Could not acquire lock … journal-1.lock` | `pkill -f "bootstrap[.]GradleDaemon"` and `pkill -f "kotlin[.]daemon"`, then rerun |
| Android SDK present but hollow | `ClassNotFoundException: com.android.sdklib.tool.sdkmanager.SdkManagerCli` | The snapshot strips large SDK binaries; re-download the command-line tools zip and reinstall platforms, build-tools and the NDK |
| No swap | daemon killed during linking | 6 GB swap file held the build |

The APK is still **debug-signed**. It installs on a device; it cannot be published.
