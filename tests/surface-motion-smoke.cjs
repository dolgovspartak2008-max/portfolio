const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('**/api/projects', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
      await page.addInitScript(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
      await page.locator('.hero__grid.is-motion-active').waitFor();
      assert.equal(await page.locator('.hero-atmosphere__paths').evaluate((element) => getComputedStyle(element).animationPlayState), 'running');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.CAPTURE_DIR && (width === 390 || width === 1440)) {
        await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, `21st-after-${width}.png`) });
      }
      await page.locator('#process').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelectorAll('.process-list li.is-revealed').length === 4);
      assert.equal(await page.locator('.hero-atmosphere__paths').evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
      await page.locator('.base-package').scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await page.locator('.base-package').hover({ position: { x: 100, y: 100 } });
      await page.locator('.base-package.is-lit').waitFor();
      if (process.env.CAPTURE_DIR && width === 1440) {
        await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, '21st-pricing-desktop.png') });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !document.querySelector('.base-package.is-lit, .process-list.has-motion'));
      assert.equal(await page.locator('.hero-atmosphere__paths').evaluate((element) => getComputedStyle(element).animationName), 'none');
      await page.locator('#contacts').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.final-cta__glow').evaluate((element) => getComputedStyle(element).animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.pin-spacer').waitFor();
      await page.locator('#contacts').scrollIntoViewIfNeeded();
      await page.locator('.final-cta.is-motion-active').waitFor();
      assert.equal(await page.locator('.final-cta__glow').evaluate((element) => getComputedStyle(element).animationPlayState), 'running');
      if (process.env.CAPTURE_DIR && width === 1440) {
        await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, '21st-contacts-desktop.png') });
      }
      await page.close();
      console.log(`${width}px: layout, process, spotlight, offscreen pause and reduced motion passed`);
    }
    const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await touch.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await touch.locator('.base-package').tap();
    assert.equal(await touch.locator('.base-package.is-lit').count(), 0);
    await touch.emulateMedia({ reducedMotion: 'no-preference' });
    await touch.locator('.base-package').tap();
    assert.equal(await touch.locator('.base-package.is-lit').count(), 0);
    assert.deepEqual(errors, []);
    console.log('surface motion smoke: touch passed, no console errors');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
