# Guide: Publicera SafePath på iOS (App Store & TestFlight)

Den här guiden beskriver steg-för-steg hur du bygger och publicerar SafePath som en iOS-app (IPA) till **TestFlight** och **Apple App Store**.

---

## ⚡ Snabbstart för Lumi: Bygg IPA för TestFlight på 3 minuter

Om du (Lumi) ska bygga och ladda upp appen till TestFlight:

1. **Klona repot och gå till mobilmappen:**
   ```bash
   git clone https://github.com/mariolundqvist-jpg/family-locator.git
   cd family-locator/mobile
   npm install
   ```

2. **Starta TestFlight-bygget via EAS (använd `production` eller `testflight` som har App Store-signering):**
   ```bash
   npx eas-cli login
   EXPO_PUBLIC_API_BASE="https://ditt-server-doman.com" npx eas-cli build --platform ios --profile production
   ```
   *(Obs: Använd profilen `production` eller `testflight` – profilen `preview` bygger endast ett internt ad-hoc-paket och kan inte skickas till TestFlight via Apple).*

3. **Skicka till TestFlight direkt från terminalen:**
   ```bash
   npx eas-cli submit --platform ios
   ```
   Bygget dyker automatiskt upp i **Apple App Store Connect → TestFlight** inom cirka 5–10 minuter!

---

## 1. Server på nätet (Viktigt innan TestFlight-bygge)

En iPhone i TestFlight kan **inte** nå `http://localhost:8787`. Servern måste köras på en publik HTTPS-adress.

Servern är en Node.js-tjänst med bakgrundsstädare (raderar positioner efter 15 minuter). Välj ett av följande kostnadsfria/billiga alternativ:

### Alternativ A: Render (Rekommenderas – 1 klick)
Projektet har en färdig `render.yaml`:
1. Skapa konto på [render.com](https://render.com).
2. Klicka på **New +** → **Blueprint** och koppla repot `mariolundqvist-jpg/family-locator`.
3. Render bygger och startar webbtjänsten automatiskt på t.ex. `https://safepath-server.onrender.com`.

### Alternativ B: Fly.io (Via Dockerfile)
Projektet har färdig `Dockerfile` och `fly.toml`:
```bash
fly launch
fly deploy
```

När servern är igång anger du dess HTTPS-adress vid bygge:
```bash
EXPO_PUBLIC_API_BASE="https://din-server.onrender.com" npx eas-cli build --platform ios --profile production
```

---

## 2. Publika adresser för App Store Connect

Apple kräver öppna webblänkar för support och integritetspolicy innan en app kan godkännas:

| Fält i App Store Connect | Publik URL |
|---|---|
| **Privacy Policy URL** | `https://family-locator-xi.vercel.app/privacy` |
| **Terms of Service URL** | `https://family-locator-xi.vercel.app/terms` |
| **Support URL** | `https://family-locator-xi.vercel.app/` |
| **Support Email** | `support@byggbartech.com` (märk *"SafePath"*) |

---

## 3. Positionering och Namn (Undvik Apple-avslag för "barnspårning")

Apple har mycket strikta regler kring appar för barn och föräldrakontroll. SafePath är **enbart för myndiga vuxna (18+) med 100 % frivilligt samtycke**.

- **Appnamn:** SafePath
- **Undertext / Tagline:** *"Samtyckesbaserad positionsdelning för vuxna och närstående (18+)"*
- **Kategorier i App Store:** *Navigation* eller *Lifestyle* (Välj **inte** *Kids*).
- **Åldersmärkning (Age Rating):** Vuxen/17+ i App Store Connect.

### Text att klistra in till Apples granskningsteam (App Review Notes):
> *"SafePath is a consent-first location sharing application built exclusively for consenting adults (18+). It is not designed for parental surveillance or child tracking. Location sharing is strictly voluntary: joining a group does NOT enable location, and no administrator or group owner can turn on tracking remotely. Background updates show a persistent iOS status bar indicator (showsBackgroundLocationIndicator=true) and can be paused at any time. Location data is never stored historically (deleted permanently after 15 minutes), and no data is sold or shared with third parties."*

---

## 4. Betalvägg och Köp i TestFlight

- **I TestFlight & Sandbox:** Betalväggen stöder StoreKit Sandbox-köp och köpåterställning via Superwall utan verklig debitering mot Apple-ID:t. Ett enda familjepaket för upp till 8 personer med val mellan månad och år.
- **Vid skarp App Store-lansering:** Skapa exakt dessa två auto-förnyande prenumerationer under **In-App Purchases** i App Store Connect:

| Produkt-ID | Period | Pris (USD) | Medlemmar |
|---|---|---|---|
| `monthly` | Månadsvis | **$4.99 / månad** | Upp till 8 personer |
| `yearly` | Årsvis (Mest populär ★) | **$29.00 / år** (spara 51%) | Upp till 8 personer |

---

## 5. Nödassistans (SOS & 112)

SafePath innehåller en integrerad SOS-knapp:
- Hämtar automatisk landsidentifiering via GPS och kopplar till landets lokala nödnummer (112 i Sverige och EU, 911 i USA, 999 i UK).
- Visar aktuella koordinater i stor fet text så att den nödställde enkelt kan läsa upp dem för SOS Alarm / larmcentralen.
- Överensstämmer med Apple Guideline 1.4.1 (initierar samtal via telefonens egna modem `tel:112` och informerar om AML).
