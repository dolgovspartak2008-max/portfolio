// Запуск: python -m http.server 4173 в папке проекта, затем node tests/browser-smoke.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const niches = ['Ресторан', 'Фитнес-клуб', 'Автосервис', 'Telegram-бот', 'CRM для салона'];
  const projects = Array.from({ length: 55 }, (_, index) => ({
    id: 100 + index,
    title: `Проект ${index + 1}`,
    category: niches[index % niches.length],
    live_url: 'https://example.com',
    image_url: '',
    sort_order: index,
  }));

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'small-mobile', width: 320, height: 568 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'mobile-landscape', width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projects) }));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${viewport.name}: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`${viewport.name}: ${error.message}`));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });

    const mobileMenu = viewport.width <= 760;
    assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), mobileMenu);
    if (mobileMenu) {
      await page.locator('.menu-button').click();
      assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#site-nav').evaluate((element) => element.inert), true);
    }

    assert.equal(await page.locator('.service-card').count(), 3);
    assert.equal(await page.locator('.project-card').count(), 12);
    assert.match(await page.locator('#works-count').textContent(), /55 проектов/);
    assert.match(await page.locator('#proof-text').textContent(), /55 проектов/);
    await page.locator('#works-more').click();
    assert.equal(await page.locator('.project-card').count(), 24);
    await page.locator('#works-search').fill('бот');
    await page.waitForFunction(() => /Найдено: 11 из 55/.test(document.getElementById('works-count').textContent));
    assert.equal(await page.locator('.project-card').count(), 11);
    assert.equal(await page.locator('#works-more').isHidden(), true);
    await page.locator('#works-search').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 12);

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: horizontal scroll`);
    await page.locator('.extras-disclosure summary').click();
    await page.locator('.service-option', { hasText: 'Создание анимаций' }).click();
    assert.equal(await page.locator('#estimate-total').textContent(), 'от 6 000 ₽');
    assert.match(await page.locator('#telegram-order').getAttribute('href'), /^https:\/\/t\.me\/spartlak\?text=/);
    assert.equal(await page.locator('.mobile-order-bar').isVisible(), viewport.width <= 760);

    if (process.env.CAPTURE_DIR) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(process.env.CAPTURE_DIR, `portfolio-${viewport.name}.png`), fullPage: true });
    }
    await page.close();
  }

  const fallbackPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fallbackPage.route('**/api/projects', (route) => route.fulfill({ status: 500, body: '{}' }));
  await fallbackPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  assert.equal(await fallbackPage.locator('.project-card').count(), 7);
  await fallbackPage.waitForFunction(() => Array.from(document.querySelectorAll('.project-card img')).every((image) => image.complete && image.naturalWidth > 0));
  if (process.env.CAPTURE_DIR) await fallbackPage.screenshot({ path: path.join(process.env.CAPTURE_DIR, 'portfolio-real.png'), fullPage: true });
  await fallbackPage.close();

  await browser.close();
  const unexpected = errors.filter((error) => !/status of 500/.test(error));
  assert.deepEqual(unexpected, []);
  console.log('browser smoke passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
