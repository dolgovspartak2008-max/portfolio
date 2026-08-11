const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'small-mobile', width: 320, height: 568 },
    { name: 'iphone', width: 375, height: 812 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'large-mobile', width: 430, height: 932 },
    { name: 'mobile-landscape', width: 844, height: 390 },
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
    if (viewport.width <= 430) {
      const titleBox = await page.locator('.hero h1').boundingBox();
      assert.ok(titleBox && portraitBox && portraitBox.x > titleBox.x);
      assert.ok(titleBox && portraitBox && portraitBox.y < titleBox.y + titleBox.height);
      assert.ok(await page.locator('.hero__details').evaluate((element) => {
        const fade = getComputedStyle(element, '::before');
        return fade.content !== 'none' && parseFloat(fade.height) >= 48;
      }));
      assert.ok(await page.locator('.portrait-frame img').evaluate((element) => (
        parseFloat(getComputedStyle(element).objectPosition) >= 78
      )));
      assert.equal(await page.locator('.final-cta .shiny-cta').textContent(), 'НАПИСАТЬ В ТЕЛЕГРАМ');
      assert.ok(await page.locator('.final-cta .shiny-cta').evaluate((element) => element.getBoundingClientRect().height >= 52));
      assert.equal(await page.locator('.final-cta .shiny-cta span').evaluate((element) => (
        getComputedStyle(element, '::before').content
      )), 'none');
      assert.ok(await page.locator('.final-cta > p:not(.section-kicker)').evaluate((element) => parseFloat(getComputedStyle(element).fontSize) >= 16));
    }
    if (viewport.name === 'mobile-landscape') {
      assert.equal(await page.locator('.pin-spacer').count(), 0);
      assert.ok(await page.locator('.works-section').evaluate((element) => element.getBoundingClientRect().height < innerHeight * 3));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const screenshotOptions = process.env.CAPTURE_DIR
      ? { path: path.join(process.env.CAPTURE_DIR, `portfolio-${viewport.name}.png`), fullPage: true }
      : {};
    assert.ok((await page.screenshot(screenshotOptions)).length > 10000);
    await page.close();
  }

  const fallbackPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fallbackPage.route('**/api/projects', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  await fallbackPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await fallbackPage.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
  await fallbackPage.reload({ waitUntil: 'networkidle' });
  await fallbackPage.locator('.project-card').first().waitFor();
  assert.equal(await fallbackPage.locator('.project-card').count(), 3);
  assert.equal(await fallbackPage.locator('.radial-wheel__item').count(), 3);
  assert.equal(await fallbackPage.evaluate(() => (
    window.ScrollTrigger.getAll().some((trigger) => trigger.pin?.classList.contains('radial-stage'))
  )), true);
  await fallbackPage.close();

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('browser smoke: desktop + mobile passed, no console errors');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
