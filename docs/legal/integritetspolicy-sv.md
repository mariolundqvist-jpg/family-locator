# Integritetspolicy – SafePath

**Version:** 1.0 · **Gäller från:** 2026-11-19
**Personuppgiftsansvarig:** Mario Lundqvist OÜ, Estland
**Kontakt i integritetsfrågor:** privacy@safepath.app

> Utkast som följer besluten i `open-decisions.md` och den genomförda
> konsekvensbedömningen (`PRIVACY-RISK-ASSESSMENT.md`). Se checklistan i avsnitt 12.

---

## 1. Kortversion

SafePath visar din senaste kända position för en liten grupp människor som **du själv
bjudit in och som själva godkänt**. Vi sparar **ingen positionshistorik**. Du kan när som
helst pausa delningen, lämna gruppen eller radera kontot i appen – och då slutar vi samla
in och skicka positioner.

**Vi säljer aldrig dina uppgifter. Vi använder inte positionsdata för reklam. Det finns
ingen tredjepartsannonsering eller spårning i appen.**

## 2. Vilka uppgifter vi behandlar

### 2.1 Konto
- **E-postadress** – för inloggning och viktig kontoinformation.
- **Lösenord** – lagras aldrig i klartext, endast som ett långsamt hash (Argon2id) med salt.
- **Visningsnamn** – det namn gruppen ser.
- **Tidpunkt** för skapande, senaste inloggning, samtycken och version av villkor.

**Rättslig grund:** fullgörande av avtalet (GDPR art. 6.1 b).

### 2.2 Position – bara när du delar
- **Latitud, longitud** för din senaste kända position.
- **Noggrannhet i meter** och **tidpunkt** för mätningen.
- **Status** (aktuell / inaktuell) som beräknas utifrån tidpunkten.

Vi tar **inte** emot position när du har pausat, lämnat gruppen eller dragit tillbaka ditt
samtycke. Positionsuppgifter som redan ligger i kön på enheten kastas i så fall.

**Rättslig grund:** ditt **uttryckliga samtycke** (GDPR art. 6.1 a och art. 9 om något
skulle röja hälsa). Samtycket ges i appen per grupp, kan dras tillbaka när som helst och
är lika enkelt att ta tillbaka som att ge.

**Vi sparar ingen historik.** Senaste kända position ersätts vid varje ny mätning och tas
bort **automatiskt efter 15 minuter** utan ny mätning. Den visas aldrig som aktuell efter
det: appen visar då "inaktuell" och därefter "otillgänglig".

### 2.3 Medlemskap och inbjudningar
- Vilka grupper du tillhör, när du gick med och när du lämnade.
- Inbjudningskoder – endast som **hash**, giltiga i **30 minuter**, engångsbruk.

**Rättslig grund:** avtal (art. 6.1 b) och berättigat intresse att skydda gruppens
integritet (art. 6.1 f).

### 2.4 Incheckningar
- En enkel "jag är framme"-signal med tidpunkt. Ingen text, inga koordinater utöver den
  position du redan delar.

**Rättslig grund:** avtal (art. 6.1 b).

### 2.5 Betalning
Vi tar **inte emot eller lagrar kortuppgifter**. Köp hanteras av den butik du installerade
appen från (Apple App Store, Google Play eller Huawei AppGallery). Vi får från butiken endast ett **kvitto/transaktions-id**
och uppgift om vald familjeplan (upp till 4, 6 eller 8 medlemmar) och prenumerationsstatus.

**Rättslig grund:** avtal (art. 6.1 b) samt rättslig förpliktelse att föra bokföring
(art. 6.1 c).

### 2.6 Säkerhet och drift
- **IP-adress** och tekniska loggar (tid, metod, statuskod) för att skydda tjänsten mot
  missbruk och felsöka.
- **Vi loggar aldrig koordinater, lösenord, tokens eller inbjudningskoder i klartext.**

**Rättslig grund:** berättigat intresse (art. 6.1 f) – tjänstens säkerhet.

## 3. Vem som kan se din position

Endast **medlemmar i samma grupp** som du själv har gått med i. Servern kontrollerar
medlemskap vid **varje** förfrågan; det går inte att läsa en grupp man inte tillhör.
Ingen utomstående, ingen annonsör och ingen tredje part får åtkomst.

Du ser alltid vilka som är med i gruppen. Att bjuda in någon ger **inte** den personen rätt
att se din position förrän du själv delar.

## 4. Hur länge vi sparar uppgifter

| Uppgift | Lagringstid |
|---|---|
| Senaste kända position | ersätts vid ny mätning, annars **högst 15 minuter** |
| Inbjudningskod | **30 minuter** (endast hash) |
| Inloggningskod via e-post | **10 minuter** |
| Session/token | **12 timmar**, därefter ny inloggning |
| Positionshistorik | **sparas inte** |
| Mätning i kö på enheten (utan anslutning) | **högst 10 minuter**, kastas sedan |
| Driftloggar (utan koordinater) | **30 dagar** |
| Säkerhetshändelser | **90 dagar** |
| Backup | **14 dagar** rullande |
| Bokföringsunderlag för köp | **7 år** (bokföringslag) |
| Konto, e-post, medlemskap | till dess att du raderar kontot |

När du raderar kontot tas positioner, medlemskap och inbjudningar bort direkt; det som
återstår är bokföringsunderlag och säkerhetsloggar enligt tabellen ovan.

## 5. Var uppgifterna behandlas

Uppgifterna lagras på servrar inom **EU/EES**. E-postutskick sker via en leverantör inom
**EU/EES**. Sker överföring till tredjeland i framtiden används EU-kommissionens
standardavtalsklausuler och du informeras här.

Vi använder inga annonsnätverk, inga analys-SDK:er och inga tredjepartsmätverktyg.
Kartvisning sker i appen utan att din position skickas till tredje part i onödan.

## 6. Dina rättigheter

Du har rätt att:
- **få tillgång** till dina uppgifter och en kopia (art. 15),
- **rätta** felaktiga uppgifter (art. 16),
- **radera** dina uppgifter (art. 17) – direkt i appen under Mer → Radera konto,
- **begränsa** behandlingen (art. 18),
- **invända** mot behandling som bygger på berättigat intresse (art. 21),
- **dataportabilitet** (art. 20),
- **dra tillbaka samtycke** när som helst (art. 7.3) – pausa eller lämna gruppen i appen.

Kontakta **privacy@safepath.app**. Vi svarar inom **30 dagar**. Du kan också klaga hos
tillsynsmyndigheten: **Estonian Data Protection Inspectorate (AKI)**, Tatari 39,
10134 Tallinn, Estland · info@aki.ee. Du har rätt att klaga i det land där du bor.

## 7. Säkerhet

- All trafik krypteras med **HTTPS/TLS**.
- Positioner lagras krypterat i vila och knyts till gruppmedlemskap, inte till publika ID.
- Lösenord hashas med **Argon2id**; sessioner kan återkallas.
- Åtkomst till produktion är begränsad och loggas.
- Vi testar behörighetskontroller automatiskt (bl.a. att en medlem i grupp A inte kan läsa
  grupp B och att en inbjudan inte kan återanvändas).

Inget system är helt säkert. Vid personuppgiftsincident meddelar vi berörda och
tillsynsmyndigheten inom **72 timmar** när incidenten sannolikt medför risk.

## 8. Barn

Tjänsten är **endast för personer från 18 år**. Vi samlar inte medvetet in uppgifter om
barn och SafePath ska inte användas för att följa barn. Om ett barnkonto upptäcks raderas
det.

## 9. Automatiserade beslut

Vi fattar **inga automatiserade beslut** med rättslig eller liknande verkan om dig.
Noggrannhetsbedömningen som avgör om en mätning får användas är en teknisk kvalitetskontroll,
inte en profilering av dig.

## 10. Kakor och spårning

Appen sätter inga reklamkakor. Webbplatsen använder endast tekniskt nödvändiga kakor för
inloggning och säkerhet.

## 11. Ändringar

Väsentliga ändringar meddelas i appen eller per e-post **minst 30 dagar i förväg**. Den
version som gällde när du godkände finns kvar för din räkning.

## 12. Innan detta publiceras

- [ ] Fyll i organisationsnummer och fullständig postadress för Mario Lundqvist OÜ.
- [ ] Verifiera namnen på e-postleverantören och att datalagringsplats är inom EU/EES.
- [ ] Bekräfta att 15-minutersgallringen (`LOCATION_RETENTION_MS`) är schemalagd och övervakad i produktion.
- [ ] Genomför DPIA och spara den tillsammans med denna policy (`PRIVACY-RISK-ASSESSMENT.md`).
- [ ] Publicera på öppen URL och länka från appens Mer-sida samt butikens listning.
- [ ] Kontrollera att privacy@safepath.app är aktiv och att 30-dagarsrutinen finns.
