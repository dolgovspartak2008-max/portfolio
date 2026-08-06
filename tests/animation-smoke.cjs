const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('http://127.0.0.1:4173/?t=.55', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true);
  assert.ok(await page.evaluate(() => window.__introTimeline.duration() >= 2.4));
  assert.ok(await page.locator('.intro__word').evaluate((element) => Number(getComputedStyle(element).opacity) > 0));
  if (process.env.CAPTURE_DIR) {
    await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, 'intro-word.png') });
  }
  await page.goto('http://127.0.0.1:4173/?t=1.48', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true);
  assert.ok(await page.locator('.intro__line').evaluate((element) => Number(getComputedStyle(element).opacity) > 0));
  const normalOptions = process.env.CAPTURE_DIR
    ? { path: path.join(process.env.CAPTURE_DIR, 'intro-mid.png') }
    : {};
  assert.ok((await page.screenshot(normalOptions)).length > 3000);

  const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reducedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await reducedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('#intro').evaluate((element) => element.classList.contains('is-done')), true);
  assert.equal(await reducedPage.locator('#name-decode').textContent(), 'СПАРТАК');
  const reducedOptions = process.env.CAPTURE_DIR
    ? { path: path.join(process.env.CAPTURE_DIR, 'intro-reduced.png') }
    : {};
  assert.ok((await reducedPage.screenshot(reducedOptions)).length > 10000);

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('animation smoke: GSAP timeline + reduced motion passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
