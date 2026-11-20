#!/usr/bin/env node
/**
 * Efter `expo prebuild` — gör om det som prebuild skriver över.
 *
 *   node scripts/configure-android.mjs
 *
 * `expo prebuild` genererar om hela android/ från app.json. Allt som inte kan
 * uttryckas i app.json försvinner då, och det är just de sakerna som behövs för
 * AppGallery: Huawei-queries i manifestet, allowBackup=false, signering med en
 * riktig nyckel, samt minnesinställningar som får bygget att gå igenom på en
 * maskin med 2 GB RAM.
 *
 * Skriptet är idempotent: kör det hur många gånger som helst.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = join(ROOT, 'android');

if (!existsSync(ANDROID)) {
  console.error('android/ saknas. Kör: npx expo prebuild --platform android');
  process.exit(2);
}

let changed = [];
const edit = (path, fn) => {
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after !== before) {
    writeFileSync(path, after);
    changed.push(path.replace(ROOT + '/', ''));
  }
};

/* ---------------------------------------------- 1. gradle.properties */
edit(join(ANDROID, 'gradle.properties'), (s) => {
  const wanted = {
    // 2 GB RAM: en enda JVM, serialiserat arbete, Kotlin i samma process.
    'org.gradle.jvmargs': '-Xmx1024m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC',
    'org.gradle.parallel': 'false',
    'org.gradle.workers.max': '1',
    'kotlin.compiler.execution.strategy': 'in-process',
    // Google Play kräver 64-bitars. armeabi-v7a behålls för äldre telefoner,
    // x86_64 tas bort: det behövs bara för emulatorer och dubblar byggtiden.
    reactNativeArchitectures: 'arm64-v8a,armeabi-v7a',
  };
  const lines = s.split('\n');
  for (const [key, value] of Object.entries(wanted)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  return lines.join('\n');
});

/* ---------------------------------------------- 2. local.properties */
const localProps = join(ANDROID, 'local.properties');
const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
if (sdkDir) {
  let s = existsSync(localProps) ? readFileSync(localProps, 'utf8') : '';
  s = s
    .split('\n')
    .filter((l) => !l.startsWith('sdk.dir=') && !l.startsWith('cmake.dir='))
    .filter((l) => l.trim() !== '');
  s.push(`sdk.dir=${sdkDir}`);
  // CMake från systemet när SDK:ts egen CMake-binär saknas (vanligt i containrar).
  if (!existsSync(join(sdkDir, 'cmake'))) s.push('cmake.dir=/usr');
  writeFileSync(localProps, s.join('\n') + '\n');
  changed.push('android/local.properties');
}

/* ---------------------------------------------- 3. signering */
edit(join(ANDROID, 'app', 'build.gradle'), (s) => {
  if (!s.includes('keystore.properties')) {
    s = s.replace(
      /    signingConfigs \{\n(?:.*\n)*?    \}/,
      `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        // Riktig signeringsnyckel för AppGallery och Google Play. Filen skapas
        // av scripts/make-keystore.sh och ligger aldrig i versionshantering.
        // Saknas den faller bygget tillbaka på debugnyckeln.
        release {
            def keystoreProps = new Properties()
            def keystoreFile = rootProject.file('keystore.properties')
            if (keystoreFile.exists()) {
                keystoreProps.load(new FileInputStream(keystoreFile))
                storeFile rootProject.file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }`,
    );
  }
  if (s.includes('signingConfig signingConfigs.debug') && s.includes('release {')) {
    s = s.replace(
      /(        release \{\n)(?:            \/\/.*\n)*            signingConfig signingConfigs\.debug/,
      `$1            // Använd den riktiga nyckeln när den finns, annars debugnyckeln
            // (installerbar men inte publicerbar).
            signingConfig rootProject.file('keystore.properties').exists()
                ? signingConfigs.release
                : signingConfigs.debug`,
    );
  }
  return s;
});

/* ---------------------------------------------- 4. manifestet */
edit(join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml'), (s) => {
  // Huawei: telefoner utan Google Play-tjänster använder Huaweis
  // platsleverantör. expo-location väljer automatiskt, men paketen måste vara
  // synliga för appen på Android 11+. Inget av detta är ett beroende.
  if (!s.includes('com.huawei.hms.location')) {
    s = s.replace(
      '  </queries>',
      `    <package android:name="com.huawei.hwid"/>
    <package android:name="com.huawei.hms.location"/>
  </queries>`,
    );
  }
  // Ingen säkerhetskopiering av appdata: en position ska inte hamna i en
  // molnkopia som användaren inte bad om.
  s = s.replace('android:allowBackup="true"', 'android:allowBackup="false"');
  // Behörigheter som appen aldrig använder och som ser misstänkta ut i
  // butiksgranskning (rita över andra appar, starta vid omstart, vibration,
  // Huawei-badge). De kommer från bibliotekens manifest — ta bort dem.
  for (const perm of [
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
    'com.huawei.android.launcher.permission.CHANGE_BADGE',
  ]) {
    s = s.replace(`  <uses-permission android:name="${perm}"/>\n`, '');
  }
  // AppGallery läser appnamnet härifrån.
  if (!s.includes('com.huawei.appgallery.appname')) {
    s = s.replace(
      '<meta-data android:name="expo.modules.updates.ENABLED"',
      '<meta-data android:name="com.huawei.appgallery.appname" android:value="SafePath"/>\n    <meta-data android:name="expo.modules.updates.ENABLED"',
    );
  }
  return s;
});

/* ---------------------------------------------- 5. nyckel */
const keystore = join(ANDROID, 'safepath-release.keystore');
if (!existsSync(keystore)) {
  console.log('Ingen signeringsnyckel hittades — skapar en ny med scripts/make-keystore.sh …');
  try {
    execFileSync('bash', [join(ROOT, 'scripts', 'make-keystore.sh')], { stdio: 'inherit' });
    changed.push('android/safepath-release.keystore (ny)');
  } catch {
    console.warn('Kunde inte skapa nyckel. Bygget blir debug-signerat och kan inte publiceras.');
  }
}

console.log(changed.length ? `Ändrade:\n  ${changed.join('\n  ')}` : 'Inget att ändra — redan konfigurerat.');
