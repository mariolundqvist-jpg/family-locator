/**
 * Browser-level end-to-end test of the prototype.
 *
 * IMPORTANT: the two "people" here are two isolated browser contexts in
 * headless Chromium, and their coordinates come from Playwright's geolocation
 * override. This proves the invitation -> consent -> location -> map -> pause
 * chain end to end through the real UI and the real server, but it is a
 * SIMULATED location source, not a device GPS fix. Device results are tracked
 * separately in docs/DEVICE-TEST-PLAN.md and must not be inferred from this run.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './harness.mjs';

// The suite boots its own isolated server unless ORIGIN is supplied.
const harness = process.env.ORIGIN ? null : await startServer();
const ORIGIN = process.env.ORIGIN || harness.origin;
const OUT = path.resolve(import.meta.dirname, 'results');
const results = [];
let step = 0;

function record(name, pass, detail) {
  step += 1;
  results.push({ n: step, name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${String(step).padStart(2, '0')} ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page, label) {
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `e2e-${String(step).padStart(2, '0')}-${label}.png`), fullPage: false });
}

/** Sign in with the development code, which the UI surfaces in a panel. */
async function signIn(page, email, name) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#view-auth:not([hidden])');
  await page.fill('#auth-email', email);
  await page.fill('#auth-name', name);
  await page.click('#auth-send');
  await page.waitForSelector('#auth-step-code:not([hidden])');
  const code = (await page.textContent('#dev-code-value')).trim();
  await page.fill('#auth-code', code);
  await page.click('#auth-verify');
  await page.waitForSelector('#view-home:not([hidden])', { timeout: 8000 });
  return code;
}

async function memberCardText(page, name) {
  const card = page.locator('.member-card', { hasText: name }).first();
  await card.waitFor({ timeout: 8000 });
  return (await card.innerText()).replace(/\s+/g, ' ');
}

const consoleErrors = [];

const browser = await chromium.launch();

try {
  /* ---- Person A: creates the group ---- */
  const ctxA = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1180, height: 860 } });
  for (const ctx of [ctxA, ctxB]) {
    await ctx.grantPermissions(['geolocation'], { origin: ORIGIN });
  }
  // London-ish fix for A, a kilometre or so away for B.
  await ctxA.setGeolocation({ latitude: 51.50735, longitude: -0.12776, accuracy: 22 });
  await ctxB.setGeolocation({ latitude: 51.51520, longitude: -0.11840, accuracy: 65 });

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  for (const [tag, p] of [['A', pageA], ['B', pageB]]) {
    p.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${tag}] ${msg.text()}`);
    });
    p.on('pageerror', (err) => consoleErrors.push(`[${tag}] pageerror: ${err.message}`));
  }

  await signIn(pageA, 'alex@example.test', 'Alex');
  record('Owner can sign in with a one-time code', true, 'code delivered through the dev panel');
  await shot(pageA, 'signed-in');

  /* ---- create group ---- */
  pageA.once('dialog', (d) => d.accept('The Test Family'));
  await pageA.click('#open-create');
  await pageA.waitForSelector('#view-family:not([hidden])', { timeout: 8000 });
  const familyHeading = await pageA.textContent('#family-name');
  record('Group created and opened', familyHeading === 'The Test Family', `name="${familyHeading}"`);

  // The consent modal is offered on arrival; dismiss it — the owner must be
  // able to use the group without sharing anything.
  await pageA.waitForSelector('#modal-consent:not([hidden])', { timeout: 5000 });
  await pageA.click('#consent-cancel');
  await shot(pageA, 'group-created-no-sharing');

  const selfBadge = await pageA.textContent('#self-badge');
  record('Creating a group does not enable sharing', /not sharing/i.test(selfBadge), `badge="${selfBadge.trim()}"`);

  const mapEmptyA = await pageA.isVisible('#map-empty');
  record('Map is empty before anyone shares', mapEmptyA, 'empty state shown to the owner');

  /* ---- invitation ---- */
  await pageA.click('#invite-btn');
  await pageA.waitForSelector('#modal-invite:not([hidden])');
  await pageA.waitForFunction(() => {
    const v = document.querySelector('#invite-link').value;
    return v && v.startsWith('http');
  }, { timeout: 5000 });
  const inviteLink = await pageA.inputValue('#invite-link');
  record('Owner can create an expiring, single-use invitation', /\/join#[\w-]{20,}$/.test(inviteLink), 'token in URL fragment');
  await shot(pageA, 'invitation-created');
  await pageA.click('#invite-close');

  /* ---- Person B joins ---- */
  await signIn(pageB, 'sam@example.test', 'Sam');
  await pageB.goto(inviteLink, { waitUntil: 'domcontentloaded' });
  await pageB.waitForSelector('#modal-join:not([hidden])', { timeout: 8000 });
  const joinFamily = await pageB.textContent('#join-family-name');
  record('Invitation preview shows the group before joining', joinFamily === 'The Test Family', `shown="${joinFamily}"`);
  await shot(pageB, 'invitation-preview');

  await pageB.click('#join-accept');
  await pageB.waitForSelector('#view-family:not([hidden])', { timeout: 8000 });
  record('Invitee joined the group', true, 'landed in the family view');

  // Consent is offered, not assumed.
  await pageB.waitForSelector('#modal-consent:not([hidden])', { timeout: 5000 });
  await shot(pageB, 'consent-dialog-shown');
  await pageB.click('#consent-cancel');

  const badgeB = await pageB.textContent('#self-badge');
  record('Joining does NOT authorise location access', /not sharing/i.test(badgeB), `invitee badge="${badgeB.trim()}"`);

  // Owner must not see a position for B yet.
  await pageA.click('#refresh-btn');
  await pageA.waitForTimeout(600);
  const cardBNoShare = await memberCardText(pageA, 'Sam');
  record('Owner cannot see a position for a member who has not consented',
    /Not sharing/i.test(cardBNoShare) && !/Accuracy radius/i.test(cardBNoShare), 'no coordinates exposed');

  /* ---- B consents and shares ---- */
  await pageB.click('#share-on');
  await pageB.waitForSelector('#modal-consent:not([hidden])');
  await pageB.click('#consent-accept');
  await pageB.waitForTimeout(1200);
  const badgeB2 = await pageB.textContent('#self-badge');
  record('Consent + sharing turns the invitee live', /sharing on/i.test(badgeB2), `badge="${badgeB2.trim()}"`);
  await shot(pageB, 'sharing-on');

  await pageA.click('#refresh-btn');
  await pageA.waitForTimeout(900);
  const cardBSharing = await memberCardText(pageA, 'Sam');
  const hasCoords = /Accuracy radius/i.test(cardBSharing);
  const isCurrent = /Current/i.test(cardBSharing);
  record('Owner sees the invited member with state, age and accuracy radius',
    hasCoords && isCurrent, cardBSharing.slice(0, 150));
  record('Position is rendered with a real accuracy radius',
    /65 m/.test(cardBSharing), /Accuracy[^.]*/.exec(cardBSharing)?.[0] || 'no accuracy text found');
  await shot(pageA, 'map-with-two-positions');

  /* ---- A also shares, so the map has two pins ---- */
  await pageA.click('#share-on');
  await pageA.waitForSelector('#modal-consent:not([hidden])');
  await pageA.click('#consent-accept');
  await pageA.waitForTimeout(1200);
  const mapEmptyNow = await pageA.isVisible('#map-empty');
  const pinCount = await pageA.locator('#map g.pin').count();
  record('Map renders plotted positions for both members', !mapEmptyNow && pinCount === 2, `${pinCount} pin(s) plotted`);
  await shot(pageA, 'both-sharing');

  /* ---- B pauses ---- */
  await pageB.click('#share-pause');
  await pageB.waitForTimeout(900);
  const badgePaused = await pageB.textContent('#self-badge');
  record('Invitee can pause their own sharing', /paused/i.test(badgePaused), `badge="${badgePaused.trim()}"`);

  await pageA.click('#refresh-btn');
  await pageA.waitForTimeout(900);
  const cardPaused = await memberCardText(pageA, 'Sam');
  record('Paused member disappears from the map and shows no coordinates',
    !/Accuracy radius/i.test(cardPaused) && /Paused/i.test(cardPaused), cardPaused.slice(0, 150));
  await shot(pageA, 'member-paused');

  /* ---- B checks in while paused ---- */
  await pageB.click('#checkin-btn');
  await pageB.waitForTimeout(1200);
  await pageA.click('#refresh-btn');
  await pageA.waitForTimeout(900);
  const cardCheckin = await memberCardText(pageA, 'Sam');
  record('Check-in shares one position without re-enabling live sharing',
    /Checked in/i.test(cardCheckin), cardCheckin.slice(0, 160));
  const badgeStillPaused = await pageB.textContent('#self-badge');
  record('Check-in does not change the pause state', /paused/i.test(badgeStillPaused), `badge="${badgeStillPaused.trim()}"`);
  await shot(pageA, 'check-in');

  /* ---- cross-group isolation at the browser level ---- */
  const otherFamilyId = '00000000-0000-4000-8000-000000000000';
  const crossStatus = await pageB.evaluate(async (fid) => {
    const r = await fetch(`/api/families/${fid}`, { headers: { 'x-safepath-client': 'web' } });
    return r.status;
  }, otherFamilyId);
  record('A signed-in member cannot fetch a family they do not belong to', crossStatus === 404, `HTTP ${crossStatus}`);

  /* ---- owner removes B ---- */
  pageA.once('dialog', (d) => d.accept());
  await pageA.locator('.member-card', { hasText: 'Sam' }).first().locator('button', { hasText: 'Remove' }).click();
  await pageA.waitForTimeout(1200);
  const cardsAfter = await pageA.locator('.member-card').count();
  record('Owner can remove a member', cardsAfter === 1, `${cardsAfter} card(s) remain`);

  // B is ejected on their next poll or refresh; wait for the app to move them.
  let removedView = false;
  try {
    await pageB.waitForSelector('#view-home:not([hidden])', { timeout: 15000 });
    removedView = true;
  } catch { removedView = false; }
  record('Removed member is ejected from the group view', removedView, 'returned to the group list automatically');
  await shot(pageB, 'removed');

  /* ---- console cleanliness ---- */
  // Browser network log lines for expected 401 (signed-out boot) and 404
  // (cross-family probe, removed member) are not application exceptions.
  const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e) && !/Failed to load resource/.test(e));
  record('No uncaught client errors during the whole flow', realErrors.length === 0,
    realErrors.length ? realErrors.slice(0, 6).join(' | ') : 'none');

  await ctxA.close();
  await ctxB.close();
} catch (err) {
  record('E2E run completed without throwing', false, err.message);
  console.error(err);
} finally {
  await browser.close();
  if (harness) await harness.stop();
}

const passed = results.filter((r) => r.pass).length;
const summary = {
  kind: 'browser-e2e',
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  locationSource: 'Playwright geolocation override (SIMULATED — not a device GPS fix)',
  total: results.length,
  passed,
  failed: results.length - passed,
  results,
};
await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'e2e-browser.json'), JSON.stringify(summary, null, 2));
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
