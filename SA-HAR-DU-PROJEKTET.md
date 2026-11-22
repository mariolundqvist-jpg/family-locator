# Så öppnar du projektet

Kort karta till mappen. Den tekniska dokumentationen ligger i `README.md`,
`docs/DELIVERY.md` och `docs/LAUNCH-READY.md`.

> **Lägg upp på GitHub?** Läs avsnittet *Innan du pushar* längst ner först. Två filer
> måste bort innan första `git push` — signeringsnyckeln och dess lösenord.

## Vad som finns i paketet

| Mapp | Innehåll |
| --- | --- |
| `server/` | API:t (Node 20, ett beroende: `pg`), databaslager för PostgreSQL och JSON |
| `tests/` | Säkerhetstester och webbläsartester (Playwright) |
| `mobile/` | React Native-appen (Expo SDK 58, RN 0.88), **122 enhetstester**, 9 Maestro-flöden, avtalstester |
| `mobile/assets/` | Appikon, adaptiv ikon och startskärm — filerna bygget använder |
| `mobile/artifacts/` | Signerad Android-APK för AppGallery (`safepath-release.apk`) |
| `mobile/scripts/` | `configure-android.mjs` (körs efter varje prebuild), `make-keystore.sh`, byggskript |
| `design/` | Designunderlaget i HTML, 19 PNG-exporter, ikongeneratorn |
| `docs/` | Arkitektur, integritetsbedömning, testresultat, lanseringskrav, **`legal/`** |
| `docs/legal/` | `terms-sv.md` (användarvillkor) och `integritetspolicy-sv.md` (integritetspolicy) |
| `tools/` | Kostnadsmodellen |

## Vad som **inte** finns i paketet

| Saknas | Varför | Så återställs det |
| --- | --- | --- |
| `node_modules/` | Går att installera om | `npm install` i rotkatalogen och i `mobile/` |
| Byggfiler (`.gradle`, `build/`, `.expo`) | Skapas vid bygge, blir hundratals MB | Skapas automatiskt |
| Android SDK / JDK | Miljöspecifikt | Se `mobile/BUILD.md` |

`mobile/android/` **finns med** — det är den konfiguration som faktiskt bygger en
AppGallery-färdig APK (compileSdk 37, signerad release, Huawei-queries, `allowBackup=false`).

## Kom igång på en minut

```bash
npm install
npm start                      # http://localhost:8787 — demo med JSON-lagring
```

Appen:

```bash
cd mobile
npm install
npm test                       # 122 enhetstester
node e2e/contract.mjs          # 21 avtalstester mot API:t (server måste köra)
bash scripts/build-android.sh  # bygger signerad APK, kräver JDK 21 + Android SDK
```

Om du kör `expo prebuild` igen: **kör alltid om konfigurationen efteråt**, annars
försvinner signering, Huawei-queries och minnesinställningarna:

```bash
npx expo prebuild --platform android --no-install
node scripts/configure-android.mjs
```

## Vad som är klart och vad som återstår

**Klart**

- Hela appen på svenska, med designens färger och komponenter.
- Positionsdelning per person, pausa, lämna grupp, radera konto, incheckning.
- GPS-kvalitetskontroll: mätningar sämre än 200 m, 0,0-koordinater, framtida
  tidsstämplar och mätningar utan noggrannhet kastas i stället för att visas.
- Användarvillkor och integritetspolicy på svenska (`docs/legal/`).
- Signerad release-APK med egen nyckel, verifierad med `apksigner`.

**Återstår innan publicering**

1. **Kör appen på en riktig telefon.** Ingen har gjort det än. Positionsnoggrannhet,
   batteritid och bakgrundsläge är oprövade — inga sådana siffror får nämnas förrän
   de är uppmätta.
2. Fyll i organisationsnummer och adress i `docs/legal/` (checklistorna längst ner).
3. Publicera villkor och policy på en öppen URL och länka från butikens listning.
4. Koppla en riktig betalningsväg för prenumerationen (i dag finns priser och
   betalningsskärm, ingen butiksintegration).
5. Följ `docs/HUAWEI-APPGALLERY.md`.

## Tre saker att känna till

1. **APK:n är signerad med en egen nyckel** som ligger i `mobile/android/`. Den nyckeln
   är allt: tappar du den kan appen aldrig uppdateras på AppGallery. Ta en säkerhetskopia
   och lägg den **utanför** git.
2. **Appen är aldrig körd på en fysisk telefon.** Det gäller fortfarande.
3. **Ingen gratis provperiod.** Ordet får inte förekomma någonstans i text eller
   gränssnitt. Priserna är 2,99 USD/månad (eller 19 USD/år för 4 pers), 3,99 USD/månad (eller 24 USD/år för 6 pers) och 4,99 USD/månad (eller 29 USD/år för 8 pers), utan provperiod.

## Bygg om ikonerna

```bash
python3 design/make-assets.py    # kräver Pillow + numpy
```

Skriptet skriver till `mobile/assets/` och `design/assets/` och avbryter om en ikon får
fel format.

---

## Innan du pushar till GitHub

Kör det här i projektmappen och kontrollera att det inte står något kvar:

```bash
git status --porcelain | grep -E "keystore|\.env"
```

Följande får **aldrig** hamna i ett repo (publikt eller privat):

| Fil | Varför |
| --- | --- |
| `mobile/android/safepath-release.keystore` | Signeringsnyckeln. Läcker den kan vem som helst signera en falsk uppdatering av appen. |
| `mobile/android/keystore.properties` | Lösenordet till samma nyckel i klartext. |
| `mobile/android/app/debug.keystore` | Onödig, men hör inte i repot. |
| `mobile/android/local.properties` | Innehåller din lokala sökväg till Android SDK. |

`.gitignore` i rotkatalogen täcker redan `node_modules`, `.env`, `server/data` och
`*.p8`. Kontrollera att den också täcker nycklarna innan du committar — och lägg en
kopia av nyckeln i ett lösenordshanterat valv, inte i molnet.

```bash
printf '\n# Signeringsnyckel — får aldrig checkas in\nmobile/android/*.keystore\nmobile/android/keystore.properties\nmobile/android/local.properties\n' >> .gitignore
```
