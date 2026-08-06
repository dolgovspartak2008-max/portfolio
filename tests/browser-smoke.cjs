const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.route('**/api/projects', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 1,
        title: 'Тестовый проект',
        category: 'Лендинг',
        live_url: 'https://example.com',
        image_url: null,
        sort_order: 0,
      }]),
    }));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${viewport.name}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));

    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => Boolean(window.gsap && window.ScrollTrigger)), true);
    assert.equal(await page.evaluate(() => Boolean(window.__introTimeline)), true);
    assert.ok(await page.evaluate(() => window.__introTimeline.duration() >= 2.4));
    await page.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#intro').evaluate((element) => element.classList.contains('is-done')), true);

    await page.locator('#stack-list .stack-item').first().waitFor();
    assert.equal(await page.locator('#stack-list .stack-item').count(), 10);
    assert.equal(await page.locator('.project-card', { hasText: 'Тестовый проект' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.locator('.extras-disclosure summary').click();
    await page.locator('.service-option', { hasText: 'Создание анимаций' }).click();
    assert.equal(await page.locator('#estimate-total').textContent(), 'от 4 000 ₽');
    const orderUrl = await page.locator('#telegram-order').getAttribute('href');
    assert.match(orderUrl, /^https:\/\/t\.me\/spartlak\?text=/);

    const heroBox = await page.locator('.hero').boundingBox();
    const heroCardRadius = await page.locator('.hero__grid').evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    const portraitBox = await page.locator('.portrait-frame').boundingBox();
    assert.ok(heroBox && heroBox.width <= viewport.width);
    assert.notEqual(heroCardRadius, '0px');
    assert.ok(portraitBox && portraitBox.width <= viewport.width * 1.4);
    const screenshotOptions = process.env.CAPTURE_DIR
      ? { path: path.join(process.env.CAPTURE_DIR, `portfolio-${viewport.name}.png`), fullPage: true }
      : {};
    assert.ok((await page.screenshot(screenshotOptions)).length > 10000);
    await page.close();
  }

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('browser smoke: desktop + mobile passed, no console errors');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
