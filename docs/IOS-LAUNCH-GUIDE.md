# Guide: Publicera SafePath på iOS (App Store & TestFlight)

Den här guiden beskriver steg-för-steg hur du bygger och publicerar SafePath som en iOS-app (IPA) till **TestFlight** och **Apple App Store**.

---

## 1. Förutsättningar

1. **Apple Developer Program:**
   - Kostar $99/år. Registrera på [developer.apple.com](https://developer.apple.com).
   - Skapa ett App ID med Bundle Identifier: `app.safepath.client`.
2. **Expo / EAS-konto:**
   - Skapa ett gratis konto på [expo.dev](https://expo.dev).
   - Installera EAS CLI lokalt på din dator:
     ```bash
     npm install -g eas-cli
     eas login
     ```

---

## 2. Bygga en IPA (iOS-paket)

SafePath är redan förberett med `mobile/eas.json` och `mobile/app.json`.

### Alternativ A: Molnbygge via EAS (Enklast, kräver ingen Mac)
Kör i `mobile/`-mappen på din dator:

```bash
cd mobile

# För internt TestFlight-test
eas build --platform ios --profile preview

# För skarp produktion (App Store)
eas build --platform ios --profile production
```

EAS hanterar automatiskt:
- Certifikat (Distribution Certificate)
- Provisioning Profiles
- Signering och kompilering av `.ipa`-filen

### Alternativ B: Lokalt bygge med Xcode (Kräver Mac med macOS)

```bash
cd mobile
npx expo prebuild --platform ios
cd ios
pod install
open safepath.xcworkspace
```
I Xcode: Välj **Product → Archive** → **Distribute App** → **App Store Connect**.

---

## 3. Bakgrundsplats på iOS (App Store Review)

Apple har strikta regler för appar som använder plats i bakgrunden. SafePath är redan förberett i `mobile/app.json` med:
- `UIBackgroundModes`: `["location"]`
- Tydliga förklaringstexter på svenska och engelska i `Info.plist`:
  - `NSLocationWhenInUseUsageDescription`
  - `NSLocationAlwaysAndWhenInUseUsageDescription`
  - `NSLocationAlwaysUsageDescription`

### Förklaring att klistra in vid App Store-granskning:
> *"SafePath is a consent-first family location sharing application. Background location is strictly voluntary and activated only when the user explicitly grants permission to share with their private family group. When background sharing is enabled, a persistent blue status bar indicator is shown (showsBackgroundLocationIndicator=true) as required by iOS guidelines. Location data is never stored historically (deleted after 15 minutes), and no data is shared with third parties or advertisers."*

---

## 4. Konfigurera köp i appen (In-App Purchases / StoreKit)

I **App Store Connect** under din app → **In-App Purchases**:
Skapa tre auto-förnyande prenumerationer i samma prenumerationsgrupp ("SafePath Family"):

| Produkt-ID | Nivå | Pris (USD / Tier) | Medlemmar |
|---|---|---|---|
| `app.safepath.plan.small4` | Liten familj | **$2.98 / år** (Tier 3) | Upp till 4 personer |
| `app.safepath.plan.medium6` | Mellanfamilj | **$3.98 / år** (Tier 4) | Upp till 6 personer |
| `app.safepath.plan.large8` | Stor familj | **4.98 € / år** (Tier 5) | Upp till 8 personer |

- **Varaktighet:** 1 år (1 Year).
- **Gratis provperiod:** Ingen (None).
- **Återställ köp:** SafePaths `PaywallModal` har redan knappen *"Återställ tidigare köp"* inbyggd, vilket uppfyller Apples granskningskrav (Guideline 3.1.1).

---

## 5. TestFlight — Testa på din egen iPhone

När EAS-bygget är klart:
1. Skicka bygget till TestFlight:
   ```bash
   eas submit --platform ios
   ```
2. I App Store Connect: Lägg till din e-postadress under **Internal Testing**.
3. Installera **TestFlight** från App Store på din iPhone och öppna inbjudningslänken för att installera SafePath direkt!
