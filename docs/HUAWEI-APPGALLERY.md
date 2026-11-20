# Publicera på Huawei AppGallery

Steg för steg, från den APK som ligger i `mobile/artifacts/` till en app som är live.
Allt som går att automatisera ligger i `mobile/scripts/`.

> **Kort version:** ladda upp den signerade APK:en. AppGallery tar emot APK upp till 4 GB
> med egen nyckel och kräver då inget App Signing-avtal. AAB (max 150 MB) kräver att
> Huawei signerar om appen — onödigt för det här projektet.

---

## 1. Innan du börjar

| Krav | Varför | Var |
| --- | --- | --- |
| Huawei ID | Utvecklarkonto, gratis | developer.huawei.com |
| Företagskonto verifierat | Betalappar och vissa behörigheter kräver det | AppGallery Connect → Konto |
| `app.safepath.client` | Paketnamnet kan aldrig ändras efter publicering | `mobile/app.json` |
| Signerad APK | Samma nyckel för alla framtida versioner | `mobile/android/safepath-release.keystore` |
| Villkor + integritetspolicy på öppen URL | Krävs i listningen | `docs/legal/` |

**Package name:** `app.safepath.client` — kontrollera att det inte är upptaget, det kan
inte bytas senare.

## 2. Nyckeln — det enda som är oåterkalleligt

```bash
cd mobile/android
keytool -list -v -keystore safepath-release.keystore -alias safepath
```

Anteckna **SHA-256-fingeravtrycket**. Det nuvarande är:

```
A2:55:26:E3:31:B9:22:DA:B9:80:13:6E:72:B9:07:4B:3D:CF:19:17:39:71:75:CA:49:5C:FC:31:E4:7F:BD:C9
```

- Tappa inte nyckeln. Utan den kan appen **aldrig** uppdateras — bara publiceras som ny app.
- Lägg en kopia i ett lösenordshanterat valv. Aldrig i git, aldrig i molnmapp utan kryptering.
- Nyckeln skapas om av `scripts/make-keystore.sh` om den saknas — det ger ett **nytt**
  fingeravtryck. Kör därför `node scripts/configure-android.mjs` innan bygget och
  kontrollera fingeravtrycket mot det som finns registrerat hos Huawei.

## 3. Bygg APK:n

```bash
cd mobile
bash scripts/build-android.sh
```

Skriptet kör `assembleRelease` och lägger APK:n i `mobile/artifacts/`. Efter varje
`expo prebuild` måste konfigurationen läggas tillbaka:

```bash
node scripts/configure-android.mjs
```

Det skriptet ser till att:

- releasen signeras med `safepath-release.keystore` via `keystore.properties`,
- `compileSdkVersion 37`, `targetSdkVersion 36`, `minSdk 24` finns i `android/build.gradle`,
- Huawei-paketen `com.huawei.hwid` och `com.huawei.hms.location` syns i `<queries>`,
- `android:allowBackup="false"` (en position ska inte hamna i en molnkopia),
- appbehörigheter som aldrig används är borttagna: `SYSTEM_ALERT_WINDOW`,
  `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, Huawei-badge.

**Kontrollera bygget innan uppladdning:**

```bash
BT=$ANDROID_HOME/build-tools/36.0.0
$BT/apksigner verify --print-certs mobile/artifacts/safepath-release.apk
$BT/aapt2 dump badging mobile/artifacts/safepath-release.apk | head -3
```

Du ska se `Verifies`, rätt SHA-256, `package: name='app.safepath.client'` och stigande
`versionCode`.

## 4. Höj versionCode för varje uppladdning

`versionCode` måste vara **högre än den senaste godkända versionen** — annars avvisas
uppladdningen. Ändra i `mobile/app.json`:

```json
"android": { "versionCode": 3, "versionName": "1.0.1" }
```

Kör sedan `npx expo prebuild --platform android --no-install`,
`node scripts/configure-android.mjs` och bygg om.

## 5. Skapa appen i AppGallery Connect

1. **My apps → New app.** Välj Android, fyll i paketnamn `app.safepath.client`
   och appnamn **SafePath**.
2. **App information** — kategori: *Lifestyle* eller *Tools*. Pris: **gratis nedladdning,
   betaltjänst i appen** (prenumeration).
3. **Upload APK** under *Version information*. Ladda upp `safepath-release.apk`.
   AppGallery läser behörigheterna ur APK:n och visar dem i granskningen.

## 6. Listning — det granskningen tittar på

| Fält | Innehåll |
| --- | --- |
| Appnamn | SafePath |
| Kort beskrivning | Dela din position med dem du väljer — bara när du själv slår på det. |
| Ikon | `design/png/ikon-primar-1024.png` (minst 512×512, ingen alfa i butiksikonen) |
| Skärmbilder | 3–8 st, **minst 1080×1920**, utan enhetsram om du vill undvika avslag. Använd `design/png/skarm-0*.png` eller ta riktiga skärmdumpar från telefon |
| Integritetspolicy | **Öppen URL** — krävs, kan inte laddas upp som fil. Texten finns i `docs/legal/integritetspolicy-sv.md` |
| Användarvillkor | `docs/legal/terms-sv.md` |
| Åldersgräns | **18+**. Ingen barnkategori, ingen familjedelning för barn |
| Behörighetsförklaring | Se avsnitt 7 |

**Skärmbilder:** ta dem på en riktig telefon när flödet är testat. Design-PNG:erna
fungerar för ett första utkast, men granskningen jämför ofta med det faktiska
gränssnittet — en skärmbild som visar något appen inte gör ger avslag.

## 7. Behörighetsförklaringar (kopiera dessa)

AppGallery kräver en motivering per känslig behörighet. Använd den här texten:

| Behörighet | Förklaring att klistra in |
| --- | --- |
| `ACCESS_FINE_LOCATION` | Används endast när personen själv har slagit på delning i appen, för att visa personens senaste position för den privata gruppen, med tidpunkt och noggrannhet. |
| `ACCESS_COARSE_LOCATION` | Reserv när exakt position inte är tillgänglig. Positionen visas då med större felmarginal, aldrig som exakt. |
| `ACCESS_BACKGROUND_LOCATION` | Frivilligt och avstängt från början. Slås på bara efter en separat förklaring, så att delningen fortsätter när skärmen är låst. Telefonen visar en ständig avisering medan det pågår och det kan stängas av när som helst. |
| `FOREGROUND_SERVICE_LOCATION` | Krävs för att kunna fortsätta dela position medan skärmen är låst, med synlig avisering. |
| `POST_NOTIFICATIONS` | Visar aviseringen som krävs medan positionsdelning pågår i bakgrunden, samt inbjudningar. |

**Det finns ingen kamera, mikrofon, kontakt- eller lagringsbehörighet i appen.**
Behörigheter som biblioteken lägger till tas bort av `configure-android.mjs` — kontrollera
efter varje bygge att listan stämmer:

```bash
$BT/aapt2 dump badging mobile/artifacts/safepath-release.apk | grep uses-permission
```

## 8. Prenumeration och betalning

Priserna är **4,98 €/vecka** och **49,98 €/år**, utan provperiod. AppGallery har egen
betalningsplattform (Huawei IAP) som kräver **HMS Core**-integrering — den finns **inte**
i den här byggnaden. Två vägar:

1. **Skjut upp köpet** — publicera som gratis app utan köp i appen först, lägg till IAP i
   nästa version. Enklast och minst riskabelt.
2. **Integrera Huawei IAP** innan publicering. Då behövs `@hmscore/react-native-hms-iap`
   eller motsvarande, testkonto i AppGallery Connect och en sandbox-testkörning.

Väljer du väg 2 måste betalningsskärmen i appen kopplas mot butikens pris — appen får
aldrig visa ett hårdkodat pris som avviker från butikens.

## 9. Granskning — typiska avslagsorsaker

- **Behörighet utan motivering.** Platsbehörighet i bakgrunden är den vanligaste.
  Använd texterna i avsnitt 7, ordagrant.
- **Skärmbild som inte matchar appen.** Ta nya efter sista designändringen.
- **Integritetspolicy som inte är nåbar.** Testa URL:en i inkognitofönster.
- **Saknad åldersgräns.** Appen är 18+; markera det i listningen.
- **`versionCode` som inte ökat.** Kontrollera mot föregående uppladdning.
- **Testkonto.** Granskningen kan begära inloggning. Inloggning sker med e-postkod;
  förbered ett konto och skriv in det i "Remarks to reviewer". Skriv också att
  inloggningskoden visas i appen i demomiljö — i produktion krävs e-post.

## 10. Efter publicering

- **Samma nyckel för allt framöver.** Ny version = höjd `versionCode`, samma keystore.
- **HMS-fallback:** appen använder `expo-location`, som faller tillbaka på Androids egen
  platsleverantör när Google Play Services saknas (Huawei-telefoner utan GMS). Ingen
  Google-inloggning, inga GMS-only-funktioner, inga Google-tjänster i APK:n — samma
  bygge fungerar på Huawei, Samsung och Xiaomi.
- **Kraschrapporter:** AppGallery Connect har egen kraschstatistik. Koppla in den innan
  lansering, annars är fältfel osynliga.

## 11. Checklista

- [ ] Utvecklarkonto verifierat som företag
- [ ] `app.safepath.client` reserverat
- [ ] SHA-256 antecknat och nyckeln säkerhetskopierad utanför git
- [ ] `node scripts/configure-android.mjs` körd efter senaste prebuild
- [ ] `apksigner verify` → `Verifies`, rätt fingeravtryck
- [ ] Behörighetslistan kontrollerad (inga `SYSTEM_ALERT_WINDOW`/`CAMERA`/`READ_CONTACTS`)
- [ ] `versionCode` höjd
- [ ] Villkor och integritetspolicy på öppen URL
- [ ] 3–8 skärmbilder i 1080×1920 eller större
- [ ] Ikon 512×512 utan alfa
- [ ] 18+ markerat
- [ ] Behörighetsförklaringar ifyllda
- [ ] Beslut taget om betalning (skjuta upp eller integrera IAP)
- [ ] Testkonto + "Remarks to reviewer" ifyllt
