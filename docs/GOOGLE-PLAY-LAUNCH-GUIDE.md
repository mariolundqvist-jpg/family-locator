# Publicera SafePath på Google Play Console

Komplett guide för att lägga upp **SafePath Family Locator** under utvecklarkontot **Byggbar Tech** i Google Play Console.

---

## 1. Skapa appen i Google Play Console

1. Gå till [Google Play Console](https://play.google.com/console) och logga in med utvecklarkontot för **Byggbar Tech**.
2. Klicka på **Skapa app** (Create app):
   - **Appens namn:** `SafePath Family Locator`
   - **Standardspråk:** Svenska (eller Engelska)
   - **App eller spel:** App
   - **Kostnadsfri eller betald:** Kostnadsfri (Gratis med köp i appen / prenumerationer)
3. Godkänn utvecklarvillkoren och klicka på **Skapa app**.

---

## 2. Grundläggande appuppgifter & Integritet

Under **Innehåll i appen** (App content) i vänstermenyn fyller du i följande:

### Integritetspolicy (Privacy Policy)
- **URL:** `https://safepath-server-v8qp.onrender.com/privacy.html`

### Åtkomst till appen (App Access)
- Välj: *Alla funktioner är tillgängliga utan särskild åtkomst* (eller ange testkonto med e-post och en engångskod).

### Annonser (Ads)
- Välj: *Nej, min app innehåller inte annonser*.

### Målgrupp och innehåll (Target Audience)
- Välj **18 år och äldre** (SafePath är byggt för samtyckande vuxna).

### Platsbehörigheter och förgrundstjänster
Google Play ställer frågor om bakgrundsplats och `FOREGROUND_SERVICE_LOCATION`:
- **Syfte:** Frivillig platsdelning i familjen med aktiv indikator.
- **Deklaration:** Appen visar en persistent notifikation så länge delning är aktiv, användaren kan när som helst pausa delningen, och inga historiska positioner sparas (raderas automatiskt efter 15 minuter).

### Radering av konto (Account Deletion)
- Ange att användare kan radera sitt konto direkt inuti appen samt via webben (`https://safepath-server-v8qp.onrender.com/`).

---

## 3. Bygga och ladda upp AAB (Android App Bundle)

Google Play accepterar formatet `.aab` (Android App Bundle).

### Alternativ A: Bygg via Expo EAS i molnet (Rekommenderat)
Kör följande i mappen `mobile/`:
```bash
npx eas-cli build --platform android --profile production
```
- EAS genererar automatiskt en Android Keystore-signeringsnyckel och bygger AAB-filen i molnet.
- När bygget är klart laddar du ner filen `safepath-production.aab` från den länk EAS ger dig.

### Alternativ B: Bygg lokalt med Gradle
```bash
cd mobile
npx expo prebuild --platform android --no-install
node scripts/configure-android.mjs
cd android && ./gradlew bundleRelease
```
Den färdiga filen sparas under `mobile/android/app/build/outputs/bundle/release/app-release.aab`.

---

## 4. Ladda upp till Intern testning (Internal Testing)

1. Gå till **Testa och släpp** $\rightarrow$ **Testning** $\rightarrow$ **Intern testning** (Internal testing).
2. Klicka på **Skapa ny version** (Create new release).
3. Dra och släpp den signerade `.aab`-filen i rutan för App Bundles.
4. Ange versionsnamn: `1.0.0 (2)`.
5. Klicka på **Spara** och sedan **Granska version**.
6. Lägg till din egen e-postadress under listan över interna testare.
7. Du får en testlänk som låter dig installera SafePath direkt från Google Play Store på valfri Android-telefon!

---

## 5. Lägg till prenumerationerna i Google Play Console

När den första AAB-filen är uppladdad har Google registrerat paket-ID:t `app.safepath.client`. Nu kan prenumerationerna skapas:

1. Gå till **Monetarisera** $\rightarrow$ **Produkter** $\rightarrow$ **Prenumerationer** (Subscriptions).
2. Skapa de två produkterna:

| Produkt-ID | Namn | Faktureringsperiod | Pris (USA) |
| :--- | :--- | :--- | :--- |
| **`monthly`** | SafePath Family Monthly | 1 månad | $4.99 |
| **`yearly`** | SafePath Family Yearly | 1 år | $29.00 |

3. Aktivera basplanerna (Base plans) för båda produkterna.
4. Klart! Nu fungerar köp och förnyelser automatiskt i appen på Android.
