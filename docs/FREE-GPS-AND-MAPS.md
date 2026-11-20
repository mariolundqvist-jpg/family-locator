# Gratis GPS och Kartor utan API-kostnader för SafePath

Den här guiden förklarar hur SafePath kan köras med **0,00 kr i externa GPS- och kartavgifter**, utan beroenden av dyra tjänster som Google Maps Platform eller Mapbox.

---

## 1. GPS vs. Kartor — Två helt skilda saker

Det är vanligt att blanda ihop GPS (positionering) med Kartor (visuell karta).

| Komponent | Vad det är | Kostnad | Hur det fungerar |
|---|---|---|---|
| **GPS (Positionering)** | Att veta *var* enheten är (lat, lon, noggrannhet) | **0 kr (alltid gratis)** | Satelliter (GNSS) och telefonens inbyggda hårdvara |
| **Kartor (Visning)** | Att rita upp gator, vägar och städer på skärmen | **0 kr om man väljer rätt** | Open-source tiles eller systemets inbyggda kartmotor |

---

## 2. GPS: Varför positioneringen alltid är 100% gratis

När din telefon tar emot en GPS-signal:
- Telefonens hårdvarumottagare lyssnar passivt på radiosignaler från satellitsystemen:
  - **GPS** (USA)
  - **GLONASS** (Ryssland)
  - **Galileo** (EU)
  - **BeiDou** (Kina)
- Operativsystemen (**iOS CoreLocation** och **Android LocationManager**) beräknar koordinaterna lokalt i telefonens chip.
- **Varken Apple, Google eller satellitoperatörerna tar betalt för detta.**
- SafePaths befintliga kod (`expo-location` i `mobile/src/location/`) anropar detta direkt. Du betalar alltså **0 kr per månad, oavsett hur många miljoner användare du har**.

---

## 3. Kartor: Hur vi visar kartan helt gratis (3 metoder)

Om du inte vill betala Google Maps (som kan kosta tusentals dollar i månaden vid hög volym):

### Alternativ A: SafePaths befintliga "Minimalistiska Radar" (Förvalt i prototypen)
- **Teknik:** Vektornät i SVG med skalstock och exakt noggrannhetscirkel.
- **Kostnad:** **0,00 kr**.
- **Fördelar:**
  - Ingen tredjepartsleverantör kan spåra användarna.
  - Fungerar offline eller vid dålig uppkoppling.
  - Laddas på 0 millisekunder, drar minimalt med batteri.
  - Extremt stilrent och distraktionsfritt.

### Alternativ B: OpenStreetMap (OSM) via öppna tiles (Rekommenderat för full gatukarta)
- **Teknik:** OpenStreetMap är kartvärldens Wikipedia – gratis, öppet och skapat av miljontals bidragsgivare.
- **Gratis källor för kartrutor (tiles):**
  1. **CartoDB Positron / Voyager:** Extremt snygga, minimalistiska kartor som passar SafePaths design. Gratis nivåer och öppna servrar finns.
  2. **OpenStreetMap Standard Tile Server:** Helt gratis för rimlig volym under Open Data Commons Open Database License (ODbL).
  3. **Egen Tile Server (Self-hosted):** Om appen växer till hundratusentals användare kan du hosta en egen OSM-tileserver på en VPS för ca 10–20 €/månad med obegränsad trafik.
- **Klientbibliotek:** `react-native-maps` eller `MapLibre GL` (open-source fork av Mapbox utan licensavgifter).

### Alternativ C: Plattformarnas inbyggda gratis kartor (Native MapKit / Google Lite)
- **iOS:** **Apple MapKit** ingår gratis i alla iOS-appar via Apple Developer-kontot. Ingen transaktionskostnad för standardvisning på iPhone!
- **Android:** OpenStreetMap via `osmdroid` eller MapLibre.

---

## 4. Sammanfattning: Din månadskostnad för kartor & GPS

| Tjänst | Kostnad vid 1 000 användare | Kostnad vid 50 000 användare |
|---|---|---|
| Satellit-GPS (telefonens hårdvara) | **0 kr** | **0 kr** |
| Native Apple MapKit (iOS) | **0 kr** | **0 kr** |
| OpenStreetMap / CartoDB / SafePath Grid | **0 kr** | **0 kr** |
| Serverdrift för koordinatsynk (Node.js) | ~5 € / månad | ~25 € / månad |

**Slutsats:** Du kan driva SafePath helt utan externa API-fakturor!
