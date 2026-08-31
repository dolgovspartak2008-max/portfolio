const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const projects = [4, 5, 6, 7, 8].map((id) => ({
    id,
    title: ({ 4: 'Pulse', 5: 'BlueSea', 6: 'BRAVO', 7: 'СтейкХаус', 8: 'PRECISION AUTO' })[id],
    category: 'Лендинг',
    live_url: 'https://example.com',
    image_url: '',
    sort_order: id,
  }));

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
      body: JSON.stringify(projects),
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

    const mobileMenu = viewport.width <= 760;
    assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), mobileMenu);
    if (mobileMenu) {
      await page.locator('.menu-button').click();
      assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), true);
      assert.equal(await page.locator('.menu-button').evaluate((element) => document.activeElement === element), true);
    }

    await page.locator('#stack-list .outcome-item').first().waitFor();
    assert.equal(await page.locator('#stack-list .outcome-item').count(), 5);
    assert.equal(await page.locator('.project-tab').count(), 5);
    assert.equal(await page.locator('.case-detail dt').count(), 3);
    const preview = page.locator('.project-preview img');
    await preview.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.project-preview img')?.naturalWidth > 0);
    assert.match(await preview.evaluate((image) => image.currentSrc), /assets\/projects\/previews\/pulse-desktop\.(?:avif|webp)$/);
    assert.equal(await preview.getAttribute('loading'), 'lazy');

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('.extras-disclosure summary').click();
    assert.equal(await page.locator('#base-price').textContent(), '5 000 ₽');
    assert.equal(await page.locator('.calculator__base b').textContent(), '5 000 ₽');
    await page.locator('.service-option', { hasText: 'Создание анимаций' }).click();
    assert.equal(await page.locator('#estimate-total').textContent(), 'от 6 000 ₽');
    const orderUrl = await page.locator('#telegram-order').getAttribute('href');
    assert.match(orderUrl, /^https:\/\/t\.me\/spartlak\?text=/);

    const { contactButtonBox, channelLinkBox } = await page.locator('.final-cta__actions').evaluate((element) => ({
      contactButtonBox: element.querySelector('.shiny-cta').getBoundingClientRect().toJSON(),
      channelLinkBox: element.querySelector('.text-link').getBoundingClientRect().toJSON(),
    }));
    assert.ok(channelLinkBox.y >= contactButtonBox.y + contactButtonBox.height);
    assert.ok(channelLinkBox.width < contactButtonBox.width);
    assert.ok(Math.abs(
      (channelLinkBox.x + channelLinkBox.width / 2) - (contactButtonBox.x + contactButtonBox.width / 2),
    ) < 2, `${viewport.name}: channel link must be centered below Telegram button`);

    const heroBox = await page.locator('.hero').boundingBox();
    const heroCardRadius = await page.locator('.hero__grid').evaluate((element) => getComputedStyle(element).borderTopLeftRadius);
    const portraitBox = await page.locator('.portrait-frame').boundingBox();
    assert.ok(heroBox && heroBox.width <= viewport.width);
    assert.notEqual(heroCardRadius, '0px');
    assert.ok(portraitBox && portraitBox.width <= viewport.width * 1.4);
    assert.equal(await page.locator('.mobile-order-bar').isVisible(), viewport.width <= 760);

    if (viewport.width <= 430) {
      const titleBox = await page.locator('.hero h1').boundingBox();
      const heroGridBox = await page.locator('.hero__grid').boundingBox();
      assert.ok(heroGridBox && portraitBox && portraitBox.width >= heroGridBox.width * .95);
      assert.ok(titleBox && portraitBox && portraitBox.y < titleBox.y + titleBox.height);
      assert.ok(await page.locator('.hero__details').evaluate((element) => {
        const fade = getComputedStyle(element, '::before');
        return fade.content !== 'none' && parseFloat(fade.height) >= 140;
      }));
      assert.equal(await page.locator('.final-cta .shiny-cta').textContent(), 'НАПИСАТЬ В ТЕЛЕГРАМ');
      assert.ok(await page.locator('.final-cta .shiny-cta').evaluate((element) => element.getBoundingClientRect().height >= 52));
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
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
  await fallbackPage.locator('.project-showcase').waitFor();
  assert.equal(await fallbackPage.locator('.project-tab').count(), 5);
  await fallbackPage.close();

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('browser smoke: desktop + mobile passed, no console errors');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
