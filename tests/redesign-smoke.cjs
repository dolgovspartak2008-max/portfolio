const assert = require('node:assert/strict');
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
      body: JSON.stringify([4, 5, 6, 7, 8].map((id) => ({
        id,
        title: ({ 4: 'Pulse', 5: 'BlueSea', 6: 'BRAVO', 7: 'СтейкХаус', 8: 'PRECISION AUTO' })[id],
        category: 'Лендинг',
        live_url: 'https://example.com',
        image_url: '',
        sort_order: id,
      }))),
    }));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${viewport.name}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));

    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
    await page.reload({ waitUntil: 'networkidle' });

    assert.equal(await page.locator('#proof-strip').count(), 1);
    assert.match(await page.locator('#proof-strip').textContent(), /5 живых лендингов/);
    assert.equal(await page.locator('#stack-list .outcome-item').count(), 5);
    assert.equal(await page.locator('.project-showcase').count(), 1);
    assert.equal(await page.locator('.project-tab').count(), 5);
    assert.equal(await page.locator('.case-detail dt').count(), 3);
    assert.doesNotMatch(await page.locator('#portfolio-copy').textContent(), /будут опубликованы/i);

    const preview = page.locator('.project-preview img');
    await preview.waitFor();
    assert.equal(await preview.getAttribute('loading'), 'lazy');
    assert.match(await preview.evaluate((image) => image.currentSrc), /pulse-desktop\.(?:avif|webp)$/);
    await page.locator('.project-tab', { hasText: 'BlueSea' }).click();
    assert.equal(await page.locator('.case-detail h3').textContent(), 'BlueSea');
    await page.getByRole('button', { name: 'Мобильная версия' }).click();
    assert.equal(await page.locator('.project-preview').getAttribute('data-device'), 'mobile');
    await page.waitForFunction(() => document.querySelector('.project-preview img')?.currentSrc.includes('blue-sea-mobile'));
    assert.match(await preview.evaluate((image) => image.currentSrc), /blue-sea-mobile\.(?:avif|webp)$/);

    assert.equal(await page.locator('.process-list li').count(), 4);
    await page.locator('.brief-disclosure summary').click();
    await page.selectOption('#business-type', { label: 'Заведение' });
    await page.selectOption('#content-status', { label: 'Частично готов' });
    await page.selectOption('#project-timeline', { label: '2–4 недели' });
    const orderUrl = await page.locator('#telegram-order').getAttribute('href');
    const orderMessage = decodeURIComponent(new URL(orderUrl).searchParams.get('text'));
    assert.match(orderMessage, /Тип бизнеса: Заведение/);
    assert.match(orderMessage, /Контент: Частично готов/);
    assert.match(orderMessage, /Срок: 2–4 недели/);

    const sticky = page.locator('.mobile-order-bar');
    assert.equal(await sticky.isVisible(), viewport.name === 'mobile');
    if (viewport.name === 'mobile') {
      assert.match(await sticky.textContent(), /5 000 ₽/);
      assert.equal(await page.locator('#mobile-telegram-order').getAttribute('href'), orderUrl);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();
  }

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('redesign smoke: cases + proof + brief + mobile CTA passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
