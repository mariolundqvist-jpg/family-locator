# Designunderlag — lanseringsklart gränssnitt

**Filen du öppnar:** `launch-ui.html` — en enda självständig HTML-fil med all CSS och
alla ikoner inlinade. Den renderas identiskt i förhandsvisning, i webbläsare och i
PNG-exporten, utan nätverk.

**PNG-filer:** `png/` — 19 filer, exporterade från samma källa.

**Apptillgångar:** `../mobile/assets/` — ikon och startskärm som appbygget använder,
genererade av `make-assets.py`. Förhandsvisningar i `assets/`.

| Fil | Mått | Används till |
| --- | --- | --- |
| `skarm-01` … `skarm-10` | 780×1690 (390×844 @2x) | Skärmbilder, granskning, butik (Play kräver min 1080×1920 för vissa layouter) |
| `startskarm.png` | 780×1282 | Startskärm / splash |
| `avisering-last-skarm.png` | 840×484 | Aviseringsdesign för bakgrundsläge |
| `ikon-primar-1024.png` | **1024×1024, RGB utan alfa** | App Store-ikon, Play Store 512-källa |
| `ikon-mork-1024.png` | 1024×1024 | iOS mörkt läge / tinted |
| `ikon-monokrom-1024.png` | 1024×1024 | Android themed icon (en färg, genomskinlig botten i appbygget) |
| `butik-01` … `butik-04` | 600×1202 @2x | Butiksskärmar, 4 av 6–8 platser |

## Ikon och startskärm (apptillgångar)

De filer appen faktiskt startar med genereras av ett skript, inte av webbläsaren:

```bash
python3 design/make-assets.py       # kräver Pillow + numpy
```

| Utdata | Mått | Används till |
| --- | --- | --- |
| `../mobile/assets/icon.png` | 1024×1024 RGB | App Store-ikon (får inte ha alfa) |
| `../mobile/assets/icon-dark.png` | 1024×1024 RGB | iOS mörkt läge |
| `../mobile/assets/adaptive-icon.png` | 1024×1024 RGBA | Android förgrund, inom säker zon |
| `../mobile/assets/adaptive-icon-background.png` | 1024×1024 RGB | Android bakgrund |
| `../mobile/assets/adaptive-icon-monochrome.png` | 1024×1024 RGBA | Android temafärgad ikon |
| `../mobile/assets/splash-icon.png` | 1024×1024 RGBA | Startskärm, tätt beskuren |
| `assets/play-icon-512.png` | 512×512 | Play-butiksikon |
| `assets/splash-ios.png` | 1290×2796 | Startskärm, iPhone 6,7 tum |
| `assets/splash-android.png` | 1080×2400 | Startskärm, Pixel-klass |
| `assets/ikon-oversikt.png` | 1752×760 | Ikonen i alla former + små storlekar |
| `assets/verifiering-android-res.png` | 1560×470 | Filerna Gradle packar, lästa ur `res/` |

Skriptet kontrollerar efter varje körning att App Store-ikonen saknar alfa, att den
adaptiva förgrunden har alfa och att den monokroma ikonen bara innehåller en färg.
Misslyckas kontrollen avbryts körningen.

Märket är en linje mellan två punkter — en plats som delas mellan två personer.
Det ritas som ett avståndsfält (varje pixel får ett exakt avstånd till formen) i
stället för med pensel, vilket ger jämna kanter i alla storlekar utan kantutjämning
i efterhand.

## Så återskapas bilderna

```bash
cd safepath
npm install                      # playwright
npx playwright install chromium
node design/export.mjs           # -> design/png/*.png
```

Källan ligger i `src/launch-ui.html` + `src/launch-ui.css`. `launch-ui.html` i
rotkatalogen genereras genom att CSS:en inlinas — redigera alltid `src/`, kör sedan
inliningen och exporten.

Exportskriptet **vägrar köra** om sidan refererar till något externt (typsnitt, bild,
skript). Det är samma regel som förhandsvisningen har, och en tyst trasig export är
värre än ingen.

## Färger och typografi

Samma tokens som appkoden redan använder i `mobile/src/ui/theme.ts`:

| Token | Värde | Roll |
| --- | --- | --- |
| `--primary` | `#1b6e5a` | Delning på, primär knapp |
| `--primary-soft` | `#e6f2ee` | Aktuell-position, bekräftelser |
| `--caution` | `#9a5b00` | Inte aktuell, bakgrundskostnad |
| `--danger` | `#a4262c` | Sluta dela, radera, logga ut |
| `--ink` / `--ink-soft` / `--ink-faint` | `#16211f` / `#4d5c58` / `#74827e` | Text i tre nivåer |
| `--bg` / `--surface` | `#f6f7f5` / `#ffffff` | Bakgrund och kort |

Ingen extern typsnittsfamilj. Systemtypsnittet används med flit: på iOS San Francisco,
på Android Roboto — det ser inhemskt ut och kostar inget i laddningstid eller integritet.

## Regler som bilderna följer

1. **Tid och träffsäkerhet syns alltid** tillsammans med en position. Ingen skärm visar
   en position utan båda.
2. **Tre tillstånd, aldrig ett fjärde:** aktuell, inte aktuell, pausad. Den som pausat
   visas utan position — inte som gråad karta och inte som "senast sedd".
3. **Pausad betyder pausad:** skärm 10 och butiksbild 03 säger uttryckligen att köade
   positioner raderas i stället för att skickas senare.
4. **Förklaring före systemdialog:** skärm 06 skriver batterikostnad och begränsningar
   innan operativsystemet frågar.
5. **Ingen rå koordinat i gränssnittet.** Skärm 05 säger vem positionen delas med, inte
   `59,3295 / 18,0658`.
6. **Inga kartnålar, pulser eller stockfoton** i marknadsmaterial. Märket är två punkter
   förbundna med en linje — en plats som delas mellan två personer, inget mer.

## Prenumeration utan provperiod

Skärm 08 är byggd för att klara både App Store-granskning och Google Plays regler utan
en gratis provperiod:

- priset står i knappen och i texten under, inte bara i butikens dialog,
- period (år/månad), automatisk förnyelse och uppsägning står på samma skärm,
- **"Ingen gratis provperiod" står uttryckligen** — det förebygger missförstånd och
  är den formulering granskare letar efter när en app inte erbjuder provperiod,
- "Återställ köp" finns, vilket båda butikerna kräver för förnybara prenumerationer,
- priset ska läsas från butiken vid körtid (StoreKit / Play Billing), aldrig hårdkodas
  i appen — då stämmer det alltid med land och valuta,
- **Priserna är beslutade 29 oktober 2026: 4,98 €/vecka och 49,98 €/år, ingen provperiod.**
  Veckopriset visas alltid med sitt årsbelopp (258,96 €/år) — ett år av veckoköp kostar
  5,2 gånger årspriset. Butiken kan sätta närliggande prisnivåer; appen läser det faktiska
  priset vid köptillfället och hårdkodar det aldrig.

Ordet "gratis" får bara beskriva sådant som verkligen är gratis. Ingen "prova gratis",
ingen "7 dagar gratis", ingen "free trial" — inte heller i butikstexten.

## Vad som återstår innan de här bilderna är sanna

Bilderna är design, inte bevis. Innan de kan användas i en butik måste:

- [ ] skärmarna byggas i appen (vissa finns redan i `mobile/src/screens/`, andra inte:
      välkomst, "så funkar det", köpskärm, offline)
- [ ] dataexporten byggas — skärm 09 lovar "Ladda ner dina uppgifter"
- [ ] köpflödet kopplas till StoreKit/Play Billing och priset läsas därifrån
- [ ] `icons` bytas in i `mobile/app.json` (nu ligger platshållarikoner från mallen där)
- [ ] prisnivå beslutas, och moms/valuta verifieras per marknad
- [ ] skärmbilderna tas om från den riktiga appen på en riktig telefon — butikerna
      accepterar inte renderingar, och vi har aldrig kört appen på en enhet
