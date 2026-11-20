#!/usr/bin/env node
/**
 * Exporterar designsidan till PNG-filer, en per skärm.
 *
 *   node design/export.mjs
 *
 * Läser design/launch-ui.html (där CSS är inlinad) och skriver:
 *   design/png/skarm-01-....png     390×844 @2x  -> 780×1688
 *   design/png/ikon-....png         1024×1024
 *   design/png/butik-....png        300×600-ish @2x
 *
 * Skriptet vägrar köra om en bild refererar till något externt: det är samma
 * regel som förhandsvisningen, och en tyst trasig export är värre än ingen.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = `file://${path.join(here, 'launch-ui.html')}`;
const out = path.join(here, 'png');
mkdirSync(out, { recursive: true });

const SCREENS = [
  ['s01', 'skarm-01-valkommen'],
  ['s02', 'skarm-02-sa-funkar-det'],
  ['s03', 'skarm-03-loggain'],
  ['s04', 'skarm-04-gruppen'],
  ['s05', 'skarm-05-din-delning'],
  ['s06', 'skarm-06-bakgrund'],
  ['s07', 'skarm-07-inbjudan'],
  ['s08', 'skarm-08-betalning-utan-provperiod'],
  ['s09', 'skarm-09-mer-integritet'],
  ['s10', 'skarm-10-offline'],
  ['splash', 'startskarm'],
  ['s11', 'avisering-last-skarm'],
  ['store1', 'butik-01-kontroll'],
  ['store2', 'butik-02-tid-och-traffsakerhet'],
  ['store3', 'butik-03-paus-stoppar'],
  ['store4', 'butik-04-ingen-historik'],
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(page_url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

const external = await page.evaluate(() =>
  [...document.querySelectorAll('[src],link[href],script[src]')]
    .map((el) => el.getAttribute('src') || el.getAttribute('href'))
    .filter(Boolean),
);
if (external.length) {
  console.error('Externa resurser hittades, exporten avbryts:', external);
  process.exit(1);
}

// Masterfiler i exakt 1024×1024: App Store avvisar en ikon med fel mått,
// och en skalad skärmbild duger inte som underlag för en ikon.
const masterPage = await browser.newPage({ deviceScaleFactor: 1 });
await masterPage.goto(page_url, { waitUntil: 'load' });
await masterPage.evaluate(() => document.fonts.ready);
for (const [id, name] of [
  ['master-primary', 'ikon-primar-1024'],
  ['master-dark', 'ikon-mork-1024'],
  ['master-mono', 'ikon-monokrom-1024'],
]) {
  // Isolera en masterfil per skärmbild: allt annat döljs och behållaren
  // flyttas till 0,0 så att skärmbilden blir elementet och inget annat.
  await masterPage.reload({ waitUntil: 'load' });
  await masterPage.evaluate((target) => {
    // Dölj bara sidans innehåll — symbolbiblioteket (<svg><symbol id="mark">)
    // måste finnas kvar, annars blir <use href="#mark"> tom och ikonen vit.
    for (const el of document.body.children) {
      if (el.tagName === 'svg') continue;
      el.style.display = 'none';
    }
    const grid = document.getElementById('master-grid');
    grid.style.display = 'block';
    grid.style.position = 'static';
    grid.style.left = '0';
    grid.style.width = '1024px';
    grid.style.height = '1024px';
    grid.style.top = '0';
    for (const child of grid.children) {
      const on = child.id === target;
      child.style.display = on ? 'block' : 'none';
      // .master ligger absolut positionerad långt utanför skärmen; den måste
      // flyttas tillbaka till 0,0 för att skärmbilden ska fånga något alls.
      if (on) {
        child.style.position = 'static';
        child.style.left = 'auto';
        child.style.top = 'auto';
      }
    }
    document.documentElement.style.background = '#ffffff';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.background = '#ffffff';
  }, id);
  await masterPage.locator(`#${id}`).screenshot({ path: path.join(out, `${name}.png`) });
}
await masterPage.close();

let count = 0;
for (const [id, name] of SCREENS) {
  const el = page.locator(`#${id}`);
  if ((await el.count()) === 0) {
    console.error(`Hittade inte #${id}`);
    continue;
  }
  // Ikonplattan ska bli 1024×1024; ramen runt ska inte med.
  const target = id.startsWith('icon-')
    ? el.locator('.tile')
    : el.locator('.phone, .canvas, .frame, .shot-canvas').first();
  await target.screenshot({ path: path.join(out, `${name}.png`) });
  count += 1;
}

await browser.close();
console.log(`Klar: ${count} PNG-filer i design/png/`);
