# Överlämning — SafePath

**Datum:** 2026-11-20
**Uppdragsgivare:** Mario Lundqvist OÜ
**Leverans:** källkod, signerad Android-APK, design, dokumentation, juridiska utkast
**Paket:** `safepath-projekt-2026-11-20.zip` (27,4 MB, 379 filer)

---

## 1. Sammanfattning på fem rader

SafePath är en samtyckesstyrd positionsdelning för vuxna i en sluten grupp. Appen är
byggd, testad och signerad men **aldrig körd på en fysisk telefon** — det är den enskilt
största kvarvarande risken. Användarvillkor och integritetspolicy finns som juridiska
utkast som behöver organisationsnummer, adress och en granskning innan publicering.
AppGallery-paketet är tekniskt färdigt; betalning i appen är inte integrerad.

---

## 2. Vad som levereras

| Del | Innehåll | Status |
| --- | --- | --- |
| `server/` | API i Node 20, ett beroende (`pg`). PostgreSQL i produktion, JSON-lager för demo | Klar, 83 säkerhetstester gröna |
| `mobile/` | React Native-app, Expo SDK 58, RN 0.88, svenskt gränssnitt | Bygger, 122 enhetstester gröna |
| `mobile/android/` | Fungerande Android-projekt: compileSdk 37, signerad release, Huawei-queries | Bygger till signerad APK |
| `mobile/artifacts/` | Signerad release-APK för AppGallery | Verifierad med `apksigner` |
| `design/` | HTML-underlag, 19 PNG-skärmar, ikoner, generatorer | Klar |
| `docs/legal/` | Användarvillkor och integritetspolicy på svenska | **Utkast** — se § 7 |
| `docs/` | Arkitektur, testresultat, hotmodell, lanseringskrav, AppGallery-guide | Klar |

Antal automatiska kontroller: **247** (83 API-säkerhet, 21 webbläsar-E2E, 122 enhetstester,
21 avtalstester klient↔server).

---

## 3. APK:n — exakta data

| Fält | Värde |
| --- | --- |
| Fil | `mobile/artifacts/safepath-release.apk` |
| Storlek | 34 203 255 byte |
| SHA-256 (fil) | `9d44ace4175300008e30e674a68ce6ec636fabc81ca3262a962ff94fc584fb71` |
| Signatur | APK Signature Scheme v2, `apksigner verify` → **Verifies** |
| Certifikat | `CN=Mario Lundqvist OU, O=Mario Lundqvist OU, L=Tallinn, C=EE` |
| Certifikat SHA-256 | `A2:55:26:E3:31:B9:22:DA:B9:80:13:6E:72:B9:07:4B:3D:CF:19:17:39:71:75:CA:49:5C:FC:31:E4:7F:BD:C9` |
| Nyckel | RSA 4096, 30 år, alias `safepath` |
| Paketnamn | `app.safepath.client` |
| versionCode / versionName | 2 / 1.0.0 |
| SDK | minSdk 24, targetSdk 36, compileSdk 37 |
| ABI | arm64-v8a, armeabi-v7a |

Behörigheter i APK:n: plats (grov, exakt, bakgrund), foreground service + plats-variant,
notiser, internet, nätverksstatus. **Ingen** kamera, mikrofon, kontakter, lagring,
rita-över-andra-appar eller starta-vid-omstart.

### Signeringsnyckeln — läs det här

```
mobile/android/safepath-release.keystore      ← nyckeln
mobile/android/keystore.properties           ← lösenordet i klartext
```

- **Ingår inte i ZIP:en** och är `.gitignore`-ad. Det är avsiktligt.
- Utan nyckeln kan appen **aldrig uppdateras** på AppGallery — bara publiceras som ny app
  med nytt paketnamn.
- Ta en säkerhetskopia **nu**, i ett lösenordshanterat valv, och förvara den utanför både
  git och okrypterad molnlagring.
- Körs `scripts/make-keystore.sh` igen skapas en **ny** nyckel med nytt fingeravtryck. Om
  det sker efter publicering är appen fast — kontrollera alltid fingeravtrycket före bygge.

---

## 4. Kom igång

### API:t lokalt

```bash
npm install
npm start                      # http://localhost:8787, JSON-lager, demokoder i loggen
```

### Appen

```bash
cd mobile
npm install
npm test                       # 122 enhetstester, ~4 s
node e2e/contract.mjs          # 21 avtalstester, kräver att API:t körs
bash scripts/build-android.sh  # signerad APK → mobile/artifacts/
```

Krav för Androidbygget: **JDK 21**, Android SDK med `platforms;android-37.0`,
`build-tools;36.0.0`, `ndk;27.1.12297006`, samt `cmake` och `ninja` på systemet.
Detaljerade felmeddelanden och lösningar: `mobile/BUILD.md`.

### Efter varje `expo prebuild`

Prebuild genererar om `android/` och **raderar** signering, Huawei-queries,
`allowBackup=false`, behörighetsrensningen och minnesinställningarna. Kör alltid:

```bash
node scripts/configure-android.mjs
```

Skriptet är idempotent och anropas automatiskt av `build-android.sh`.

### Miljöfällan som kostade mest tid

Den här typen av container tappar **JDK, build-tools, NDK, cmake, ninja, `node_modules`
och swapfilen** när den startas om. Symptomen är missvisande: NDK:n finns kvar som en
18 MB skalrest utan `source.properties`, vilket ger `[CXX1101]`, och `gradlew` tappar
körningsbiten. Återställ med:

```bash
sudo apt-get install -y openjdk-21-jdk-headless cmake ninja-build
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "build-tools;36.0.0" "ndk;27.1.12297006"
sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
cd mobile && npm install
```

Bygget kräver swapfilen: maskinen har 2 GB RAM och Gradle dödas utan den.

---

## 5. Vad som är verifierat — och vad som inte är det

### Verifierat

| Område | Bevis |
| --- | --- |
| Behörighetskontroll på servern | 83 tester; grupp A kan inte läsa grupp B, inbjudan kan inte återanvändas |
| Paus, utträde, radering, återkallat samtycke stoppar insamling **och** sändning, inklusive köade positioner | Enhetstester i `core/controller.test.ts`, `core/outbox.test.ts` |
| Gammal position visas aldrig som live | `core/freshness.test.ts`; regeln finns i `PositionCard` som inte går att kringgå |
| Inga koordinater eller hemligheter i loggar | 12 av 14 säkerhetstester läser serverns egen utdata efter en riktig position |
| Produktion vägrar starta med demoautentisering | Testat; servern avslutar med förklaring |
| GPS-kvalitet | `core/gpsQuality.ts`, 13 tester: >200 m fel, 0,0, framtida tidsstämpel och saknad noggrannhet kastas |
| APK signerad och komplett | `apksigner verify`, `aapt2 dump badging` |
| Ingen historik | Retentionsfönster 15 min, ersätts vid varje mätning |

### Inte verifierat — behandla som öppna risker

1. **Appen har aldrig installerats på en telefon.** Ingen fysisk enhet fanns tillgänglig.
   Positionsnoggrannhet, batteriförbrukning, bakgrundsläge, beteende vid låst skärm och
   överlevnad vid omstart är **oprövat**. Inga siffror om detta får användas i marknadsföring
   förrän de är uppmätta. Testplanen ligger i `docs/DEVICE-TEST-PLAN.md` (F1–F5, B1–B8,
   P1–P6, G1–G6, E1–E6).
2. **Betalning i appen integrerad via Superwall och StoreKit.** Ett komplett paket för hela familjen (upp till 8 personer) erbjuds med två produkt-ID:n: `monthly` ($4.99/mån) och `yearly` ($29.00/år, spara 51%). Köp och återställning kan testas i TestFlight via Apple Sandbox utan skarp debitering. För Android/Huawei krävs IAP-aktivering före skarp release om köp ska ske i appen.
3. **E-postutskick i produktion är inte kopplat** — kräver leverantörsnyckel, se
   `docs/CREDENTIALS-NEEDED.md`.
4. **Huawei-telefon utan Google Play-tjänster** är hanterad i koden (expo-location faller
   tillbaka på Androids platsleverantör, Huawei-paketen är deklarerade i `<queries>`), men
   aldrig provad på en sådan enhet.

---

## 6. Juridik — vad som finns och vad som måste göras

### Finns

- `docs/legal/terms-sv.md` — användarvillkor, 14 avsnitt: 18-årsgräns, inbjudan ≠ samtycke,
  priser, ångerrätt med **oförkryssad** ruta, ansvarstak motsvarande 12 månadsavgifter med
  50 USD golv och uttryckligt undantag för uppsåt och grov vårdslöshet (VÕS § 106).
- `docs/legal/integritetspolicy-sv.md` — rättslig grund per behandling, lagringstider
  (position 15 min, kö på enheten 10 min, inloggningskod 10 min, inbjudan 30 min, session
  12 h, driftloggar 30 d, säkerhetsloggar 90 d, backup 14 d, bokföring 7 år), rättigheter,
  AKI som tillsynsmyndighet.
- `docs/legal/open-decisions.md` — beslutsunderlaget bakom texterna.

### Måste göras före publicering

- [ ] Fyll i **organisationsnummer** och **fullständig postadress** för Mario Lundqvist OÜ.
- [ ] Juridisk granskning av ansvarstaket mot tvingande konsumenträtt.
- [ ] Publicera båda dokumenten på **öppna URL:er** — AppGallery kräver det, filuppladdning
      fungerar inte.
- [ ] Verifiera att `support@byggbartech.com (märk "SafePath")` och `support@byggbartech.com (märk "SafePath Dataskydd")` är aktiva.
- [ ] Genomför och arkivera DPIA:n (`docs/PRIVACY-RISK-ASSESSMENT.md`).
- [ ] DPO-bedömning enligt art. 37 finns dokumenterad; omvärdera vid >10 000 MAU.

Ingen av texterna är juridiskt granskad. De är strukturerade utkast byggda på de beslut som
dokumenterats i `open-decisions.md` — inte rådgivning.

---

## 7. Ekonomi och priser

| Paket | Medlemmar | Månadspris (ID: `monthly`) | Årspris (ID: `yearly`, spara 51 %) |
| --- | --- | --- | --- |
| SafePath Familj | Upp till 8 personer | 4,99 USD / månad | 29,00 USD / år (ca 2,42 USD/mån) |

- **Ingen gratis provperiod.** Ordet får inte förekomma i app, butikstext eller marknadsföring.
- Priset ska läsas **live från butiken** vid köp — aldrig hårdkodas. Butikspriser varierar
  per land och valuta.
- Kostnadsmodellen i `docs/COST-MODEL.md` är **uppskattningar**. Ingen betald tjänst är
  godkänd. Forskningsbudget, marknadsestimat och förvärvsantaganden är **inte beslutade**.

---

## 8. Kvarvarande arbete, i prioritetsordning

| # | Uppgift | Varför den ligger först |
| --- | --- | --- |
| 1 | **Testa på fysisk telefon** enligt `docs/DEVICE-TEST-PLAN.md` | Allt annat vilar på att appen fungerar i verkligheten. Bakgrundsläge är kärnan i produkten och helt oprövat. |
| 2 | **Besluta om betalning** — skjut upp köp i appen eller integrera Huawei IAP | Utan beslut kan appen inte publiceras som betaltjänst. Enklaste vägen: publicera gratis först. |
| 3 | **Fyll i och publicera juridiken** | Krävs för butiksgranskning, blockerar allt annat |
| 4 | **Skärmbilder och listning** i AppGallery | Kräver en telefon — hänger på punkt 1 |
| 5 | **Koppla e-postleverantör** i produktion | Utan den kan ingen logga in i skarp miljö |
| 6 | **Kraschrapportering** (AppGallery Connect) | Fältfel blir annars osynliga |

Publiceringsstegen står i `docs/HUAWEI-APPGALLERY.md`, med avslagsorsaker och färdiga
behörighetsförklaringar att klistra in.

---

## 9. Vad appen medvetet inte gör

Dessa är produktbeslut, inte brister. De ska inte "fixas" utan ett nytt beslut:

- **Ingen positionshistorik.** Ingen karta över var någon varit.
- **Inga kartrutor.** Positioner ritas på ett rutnät med skala och sann noggrannhetscirkel.
  En kartleverantör hade lagt till ytterligare en personuppgiftsbiträde.
- **Inga barnkonton.** Testning sker med vuxna som samtyckt. Barnfunktioner kräver egen
  design med vårdnadshavarkontroll.
- **Inga löften.** Inget i gränssnittet utlovar oavbruten spårning, larmfunktion eller
  garanterad position. Därför finns lägena aktuell/inaktuell/otillgänglig.
- **Ingen reklam, ingen analys, ingen tredjepartsspårning.**

---

## 10. Vad som inte får göras

| Får inte | Skäl |
| --- | --- |
| Checka in `mobile/android/*.keystore` eller `keystore.properties` | Nyckeln blir publik; vem som helst kan signera en falsk uppdatering |
| Publicera med demoautentisering påslagen | Servern vägrar starta — men kontrollera `NODE_ENV=production` i driftsättningen |
| Skriva ut koordinater eller tokens i loggar | Redigeringen i `src/core/redact.ts` täcker klienten; servern loggar aldrig koordinater |
| Ändra paketnamnet `app.safepath.client` | Kan inte ändras efter publicering |
| Höja `versionCode` bakåt | AppGallery avvisar uppladdningen |
| Lägga till "prova gratis" någonstans | Uttryckligt beslut: ingen provperiod |
| Påstå mätvärden för batteri, noggrannhet eller tillförlitlighet | Inga sådana mätningar finns |

---

## 11. Nyckelkontakter och resurser

| Resurs | Plats |
| --- | --- |
| Projektkarta och kom-igång | `SA-HAR-DU-PROJEKTET.md` |
| Teknisk översikt | `README.md` |
| Byggfel och lösningar | `mobile/BUILD.md` |
| Arkitektur och hotmodell | `docs/ARCHITECTURE.md`, `docs/SECURITY-TESTS.md` |
| Testresultat i detalj | `docs/TEST-RESULTS.md` |
| Integritetsbedömning (DPIA-underlag) | `docs/PRIVACY-RISK-ASSESSMENT.md` |
| Enhetstestplan | `docs/DEVICE-TEST-PLAN.md` |
| Vad som krävs av dig som driftar | `docs/CREDENTIALS-NEEDED.md` |
| Publicering | `docs/HUAWEI-APPGALLERY.md` |
| Design | `design/README.md`, `design/png/` |

---

## 12. Kvittens

Överlämningen är komplett när följande är gjort:

- [ ] ZIP uppackad och `npm install` körd i rot och i `mobile/`
- [ ] `npm test` i `mobile/` → 122/122
- [ ] `node e2e/contract.mjs` → 21/21 (med API:t körande)
- [ ] APK:ns SHA-256 kontrollerad mot `9d44ace4…fb71`
- [ ] **Signeringsnyckeln kopierad till säkert valv utanför git**
- [ ] Fingeravtrycket `A2:55:26:E3:…:BD:C9` antecknat
- [ ] `docs/legal/` granskad och kompletterad med organisationsuppgifter

---

*Dokumentet beskriver läget 2026-11-20. Siffror som rör batteri, noggrannhet och
tillförlitlighet saknas medvetet — de kan bara tas fram på en fysisk enhet.*
