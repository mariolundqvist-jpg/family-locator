# Vad som gör SafePath till en riktig app

**27 oktober 2026 · underlag för lansering, inte marknadsföring**

Det här dokumentet svarar på frågan *"hur ska appen se ut och funka för att fungera
som en riktig app"*. Det är skrivet som en granskningslista, inte som en vision: varje
rad har en status som går att kontrollera i källkoden eller i en körd testkörning.

Tre statusnivåer används:

| Status | Betyder |
| --- | --- |
| **Klart** | Byggt, testat och går att köra i dag. Hänvisning till fil eller test finns. |
| **Delvis** | Logiken finns och är testad, men ytan (skärmen) eller kopplingen mot en extern tjänst saknas. |
| **Saknas** | Inte byggt. Kräver beslut, konto eller betaltjänst innan det kan byggas. |

---

## 1. Kort svar

En app känns "riktig" när fem saker stämmer samtidigt. Alla fem måste vara på plats;
tre av fem räcker inte, och det är nästan alltid de två sista som saknas i prototyper.

| Lager | Frågan användaren ställer | Var SafePath står |
| --- | --- | --- |
| **1. Tekniken** | Startar den, kraschar den, går den att uppdatera? | Byggd och signerad (debug-nyckel). Krasch- och felrapportering saknas. |
| **2. Butiken** | Får den finnas, och går den att hitta? | Ikon, startskärm och butiksbilder klara. Poster, deklarationer och granskning saknas. |
| **3. Första minuten** | Förstår jag vad den gör och vad den vill? | Flödet finns i kod; välkomst- och betalskärmar saknas visuellt. |
| **4. Vardagen** | Vad händer när nätet försvinner, när positionen är gammal, när jag pausar? | Byggt och testat. Det här är appens starkaste del. |
| **5. Förtroendet** | Kan jag lita på att den inte delar mer än jag sagt? | Byggt och testat, även på serversidan. Kräver att gränssnittet aldrig lovar mer. |

---

## 2. Tekniken: det som avgör om den känns som en app och inte en demo

**Signering.** Android-versionen som ligger i `mobile/artifacts/` är signerad med
debugnyckeln. En debugnycklad app går att installera, men den kan inte uppdateras i
Play och den bör inte lämnas ut. För riktig distribution krävs en egen keystore som
förvaras utanför repot, plus lösenord i en hemlighetshanterare.

> **Status: Saknas.** Nyckeln finns inte och ska inte skapas av mig utan ditt godkännande,
> eftersom den som har nyckeln kan signera uppdateringar av din app.

**Apple.** iOS-versionen kräver ett Apple Developer-konto (99 USD/år), ett
provisioneringsprofil-förfarande och en byggd arkivering via Xcode. Det går inte att
bygga en iOS-binär i den här miljön — den kräver macOS.

> **Status: Saknas.** Kräver konto och Mac.

**Krash- och felrapportering.** Utan den vet du inte hur appen beter sig hos andra.
Rekommendationen är en leverantör som tar emot krascher men **inte** positionsdata:
appen skickar då bara stackspår och enhetsmodell, aldrig koordinater, e-post eller
gruppnamn. Det kravet gäller även loggarna, som redan i dag filtreras.

> **Status: Saknas.** Val av leverantör är ett beslut som kostar pengar; inget är
> aktiverat.

**Uppdateringar.** Android kan uppdateras utan butik (via APK), men det är en
sidoingång som kräver att användaren tillåter installation från okänd källa. Riktiga
appen uppdateras via Play Butik eller App Store.

> **Status: Delvis.** Bygget är reproducerbart (`mobile/scripts/build-android.sh`),
> men det finns ingen släppkanal.

**Enhetsprovning.** Appen är byggd men **aldrig installerad på en telefon**. Allt som
gäller GPS-noggrannhet, batteriförbrukning, bakgrundsläge och låst skärm är därför
fortfarande oprövat. Inga sådana siffror får publiceras innan de är uppmätta på riktig
hårdvara.

> **Status: Saknas.** Testplanen finns i `docs/DEVICE-TEST-PLAN.md`.

---

## 3. Butiken: det som avgör om appen får finnas

| Krav | Vad det innebär | Status |
| --- | --- | --- |
| Appikon | 1024×1024 utan genomskinlighet till App Store, 512×512 till Play, adaptiv ikon till Android | **Klart** — `mobile/assets/`, se avsnitt 6 |
| Startskärm | Märke + ordmärke, mörkgrön botten, ingen reklam, ingen laddningsanimation som ser ut som en krasch | **Klart** — `mobile/assets/splash-icon.png` |
| Butikstexter | Namn, kort beskrivning, lång beskrivning, nyckelord, support-URL, integritetspolicy-URL | **Saknas** — kräver domän |
| Skärmbilder | 4 färdiga i `design/png/butik-01…04`, Play vill ha 4–8 | **Delvis** |
| Integritetsdeklaration | Apples *App Privacy* och Googles *Data safety*: exakt vilka uppgifter som samlas in, om de delas med tredje part, om de är krypterade i transit | **Saknas** — underlaget finns i `docs/PRIVACY-RISK-ASSESSMENT.md` |
| Kontoradering i appen | Både Apple och Google kräver att ett konto kan raderas inifrån appen, inte bara via webbplats | **Klart** — `DELETE /api/me/data`, testat |
| Åldersgräns | Positionsdelning mellan vuxna i en familj: 17+ eller 4+ beroende på hur texten formuleras. Inget barnläge i V1 | **Delvis** — beslut behövs |
| Betalning | Prenumeration måste gå via Apples och Googles betalningssystem; 15–30 % avgift | **Saknas** — se avsnitt 5 |
| Granskning | 1–7 dagar första gången. Positionsappar granskas extra hårt på *varför* bakgrundsplats behövs | **Saknas** |

Två formuleringar som brukar fälla positionsappar i granskning, och som SafePath
därför inte får använda: *"för din säkerhet"* utan förklaring, och *"fungerar alltid"*.
Appen får inte heller antyda att den larmar någon vid fara — det gör den inte.

---

## 4. Första minuten: det som avgör om folk stannar

Ordningen är fast och får inte kastas om. Systemdialoger som dyker upp utan
förklaring avvisas; en avvisad behörighet går ofta inte att få tillbaka.

```
1. Startskärm (märke + namn)                      ~1 s
2. Välkomstskärm: vad appen gör, i tre rader      valfri tid
   "Dela din position med personerna du väljer.
    Inget händer förrän du själv slår på delning.
    Du kan pausa när som helst."
3. Logga in med e-post                            engångskod, ingen lösenordsregel
4. Gå med i grupp / skapa grupp                   inbjudan kräver uttryckligt ja
5. "Så funkar det" – tre skärmar, max en poäng var
6. Egna förklaringen, sedan systemdialogen        först här frågas om position
7. Första läget: knappen "Börja dela"              inte automatiskt
```

Punkterna 2, 5 och 7 finns som design men **inte som byggda skärmar** — det är den
största luckan mellan det som är ritat och det som är byggt.

| Skärm | Design | Byggd |
| --- | --- | --- |
| Välkommen | `design/png/skarm-01-valkommen.png` | **Saknas** |
| Så funkar det | del av `launch-ui.html` | **Saknas** |
| Inloggning med kod | `skarm-02` | **Klart** |
| Gå med i grupp | `skarm-03` | **Klart** |
| Karta med lägen | `skarm-04` | **Klart** |
| Pausskärm | `skarm-05` | **Klart** |
| Medlemmar & delning | `skarm-06` | **Klart** |
| Inbjudan | `skarm-07` | **Klart** |
| Checka in | `skarm-08` | **Klart** |
| Integritet & radering | `skarm-09` | **Klart** |
| Offline | `skarm-10` | **Saknas** |
| Betalvägg (ingen provperiod) | i `launch-ui.html` | **Saknas** |

---

## 5. Betalning utan provperiod

Kravet är uttalat: **ingen gratis provperiod**. Det påverkar hur skärmen måste se ut.

- Priset står **i knappen** och en gång under den. Ingen "från"-text.
- Period, automatisk förnyelse och uppsägning står på **samma skärm** som köpknappen.
- Meningen **"Ingen gratis provperiod"** står explicit. Den får inte gömmas i villkor.
- **"Återställ köp"** finns alltid med.
- Priset läses från butiken vid visning — aldrig hårdkodat, eftersom valuta och moms
  varierar per land.
- Inga nedräkningar, inga förvalda kryssrutor, ingen "första månaden gratis".

Prisnivåerna är **beslutade 29 oktober 2026: 4,98 €/vecka och 49,98 €/år**. Ett år av
veckoköp kostar 258,96 €, alltså 5,2 gånger årspriset, så veckopriset visas alltid
tillsammans med sitt årsbelopp och årsplanen är den som är förvald. Butiksavgiften
(15–30 %) tillkommer; butiken kan dessutom sätta närliggande prisnivåer, så appen läser
alltid det faktiska priset vid köptillfället.

> **Status: Saknas.** Skärmen är ritad, kopplingen mot App Store/Play fakturerings-API
> är inte byggd — den kräver ett utvecklarkonto.

---

## 6. Ikon och startskärm som filer

Allt genereras av ett skript, `design/make-assets.py`, så att tillgångarna går att
återskapa och granska. Inga externa filer, inga typsnitt över nätet.

```bash
python3 design/make-assets.py      # kräver Pillow + numpy
```

Skriptet **vägrar skriva** en App Store-ikon med alfa, en adaptiv förgrund utan alfa
eller en monokrom ikon med mer än en färg. Det kontrolleras efter varje körning.

### Filer som appbygget använder (`mobile/assets/`)

| Fil | Mått | Format | Används till |
| --- | --- | --- | --- |
| `icon.png` | 1024×1024 | RGB, **ingen alfa** | App Store-ikon, grund för Play 512 |
| `icon-dark.png` | 1024×1024 | RGB | iOS mörkt läge |
| `adaptive-icon.png` | 1024×1024 | RGBA | Android adaptiv förgrund, märket inom säker zon |
| `adaptive-icon-background.png` | 1024×1024 | RGB | Android adaptiv bakgrund (gradient) |
| `adaptive-icon-monochrome.png` | 1024×1024 | RGBA, **en färg** | Android 13+ temafärgad ikon |
| `splash-icon.png` | 1024×1024 | RGBA | Startskärm, tätt beskuren |
| `favicon.png` | 48×48 | RGB | Webbflik |

Android adaptive icon: bara de mittersta 66 % av rutan är garanterat synliga. Märket
mäter 33,0 % av rutan i full skala, så förgrunden skalas till 0,90 — då ligger största
avståndet från mitten på 29,7 %, innanför gränsen.

### Förhandsvisningar (`design/assets/`)

| Fil | Mått | Visar |
| --- | --- | --- |
| `splash-ios.png` | 1290×2796 | Startskärm på iPhone 6,7 tum |
| `splash-android.png` | 1080×2400 | Startskärm på Pixel-klass |
| `play-icon-512.png` | 512×512 | Play-butiksikon |
| `ikon-oversikt.png` | 1752×760 | Ikonen i iOS-, Android-, mono- och mörk form samt i 96/72/48/32 px |
| `verifiering-android-res.png` | 1560×470 | De filer Gradle faktiskt packar, lästa ur `android/app/src/main/res` |

Startskärmens komposition är densamma som i det godkända designpaketet: märket är
ca 13 % av skärmbredden och ordmärket ca 24 %, på en grön gradient från `#2a8870`
till `#135240`. Färgerna är hämtade ur `design/png/startskarm.png`, inte påhittade.

**En sak som måste sägas om Android 12 och senare:** systemet ritar bara ikonen på en
enfärgad botten. Det går inte att visa gradient eller ordmärke i den inbyggda
startskärmen. Filerna ovan är därför två saker på en gång — förhandsvisningen av hur det
ska se ut, och källan till den logotyp som systemet visar. Ordmärket kräver en extra
skärm som ritas av appen själv efter att systemets startskärm försvunnit; den är inte
byggd än.

**Känt avvikelse i bygget:** `expo-system-ui` är inte installerat, så inställningen
`userInterfaceStyle: "light"` har ingen verkan. Appen följer i praktiken systemets
tema i stället för att låsas till ljust. Att installera paketet ändrar
beroendelistan och kräver en ny APK — därför är det inte gjort efter att bygget
godkänts, utan står som nästa steg.

---

## 7. Vardagen: beteendet som avgör om appen går att lita på

Det här är den del som oftast saknas i prototyper och som SafePath redan har byggt.

| Situation | Vad appen gör | Vad appen **inte** gör |
| --- | --- | --- |
| Positionen är färsk | Visar den, med tidpunkt och noggrannhet | — |
| Positionen är gammal | Visar "Inte aktuell" med tid och noggrannhet, dämpad färg | Visar den som live |
| Delning pausad | Visar pausat läge **utan** någon position alls | Visar senaste kända punkt |
| Ingen position alls | "Ingen position tillgänglig" | Gissar eller animerar |
| Nätet försvinner | Köar ändringar, visar offline-läge | Låtsas att det gick igenom |
| Nätet kommer tillbaka | Skickar kön | Skickar gamla positioner som om de vore nya |
| Användaren pausar | Raderar positionen, stoppar både insamling och sändning, tömmer kön | Fortsätter i bakgrunden |
| Användaren lämnar gruppen | Stoppar allt, tar bort medlemskapet | Behåller data "för säkerhets skull" |
| Behörighet nekas | Förklarar vad som inte fungerar, erbjuder att öppna inställningar | Frågar igen i en loop |

Två regler som styr allt ovan: **en gammal position får aldrig se ut som en ny**, och
**en pausad användare får inte ha en position i gränssnittet**. Båda är testade i
`mobile/src/core/` och i avtalstesterna, inte bara i texten.

---

## 8. Tillgänglighet: det som avgör om appen fungerar för alla

Kraven är inte valfria om appen ska publiceras i EU och handhas av en offentlig
beställare, och de kostar nästan inget att göra rätt från början.

- **Textstorlek.** All text ska följa systemets inställning (Dynamic Type / `fontScale`)
  och layouten ska tåla 200 % utan att knappar klipps. `mobile/src/ui/theme.ts` har
  redan relativa storlekar; skärmarna måste provas vid 200 %.
- **Skärmläsare.** Varje karta och varje status måste ha en text som säger samma sak
  som det visuella: *"Anna, aktuell position, 40 meter, för 12 sekunder sedan"*.
  En karta utan textalternativ är oanvändbar med VoiceOver och TalkBack.
- **Kontrast.** Brödtext minst 4,5:1, stora rubriker 3:1. De gröna tonerna i
  `theme.ts` är kontrollerade mot `#f6f7f5`; den ljusa mintfärgen får bara användas
  som stor yta, aldrig som text.
- **Färg som enda signal.** Läget "inte aktuell" får inte bara vara en annan färg — det
  står också i klartext.
- **Rörelse.** Inga pulserande animationer på kartan i V1; en puls antyder live och
  därmed färskare data än vad som finns.

> **Status: Delvis.** Kontrast och textliga statusar är byggda. Skärmläsarlabels och
> 200 %-provning är inte gjorda.

---

## 9. Det som inte är verifierat

Det här avsnittet finns för att det ska vara omöjligt att läsa dokumentet som en
garanti.

- Appen har **aldrig installerats på en fysisk telefon**. Ingen mätning av GPS,
  batteri, bakgrundsläge eller låst skärm finns.
- Ingen butiksgranskning är gjord, och inga butikstexter är skrivna.
- Inga kostnader för drift, DPO eller försäkring är beslutade. Siffrorna i
  `docs/COST-MODEL.md` är uppskattningar.
- Betalflödet är ritat men inte kopplat till någon butik.
- Dokumentationen för behandling av personuppgifter (DPIA) är ett utkast, inte
  granskat av jurist eller tillsynsmyndighet.
- Ingen gratis provperiod finns, och ingen sådan text får förekomma i butik eller
  gränssnitt.

---

## 10. Nästa steg, i den ordning de måste göras

1. **Enhetsprovning** på en Android-telefon med den byggda APK:n. Mät batteri och
   noggrannhet i 30 minuter med skärmen låst. Först därefter får några siffror nämnas.
2. **De fyra saknade skärmarna**: välkommen, så funkar det, offline, betalvägg.
3. **Tillgänglighetsprovning** vid 200 % textstorlek och med skärmläsare.
4. **Kraschrapportering** med dataminimering, och ingen analys som standard.
5. **Keystore och utvecklarkonton** när du godkänt kostnaderna (Apple 99 USD/år,
   Play 25 USD engångsavgift).
6. **Butikstexter, deklarationer och skärmbilder** — därefter granskning.
