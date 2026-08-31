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

  const interruptedPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await interruptedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await interruptedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await interruptedPage.waitForFunction(() => window.__ready === true);
  await interruptedPage.evaluate(() => { window.__introTimeline.pause(1.48); });
  await interruptedPage.waitForTimeout(3400);
  assert.deepEqual(await interruptedPage.evaluate(() => ({
    done: document.getElementById('intro').classList.contains('is-done'),
    bodyLocked: document.body.classList.contains('intro-active'),
    htmlPending: document.documentElement.classList.contains('intro-pending'),
  })), { done: true, bodyLocked: false, htmlPending: false });

  const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reducedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await reducedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('#intro').evaluate((element) => element.classList.contains('is-done')), true);
  assert.equal(await reducedPage.locator('#name-decode').textContent(), 'СПАРТАК');
  await reducedPage.locator('.project-showcase').scrollIntoViewIfNeeded();
  await reducedPage.getByRole('button', { name: 'Мобильная версия' }).click();
  assert.equal(await reducedPage.locator('.project-preview').getAttribute('data-device'), 'mobile');
  assert.ok(await reducedPage.locator('.project-preview').evaluate((element) => (
    parseFloat(getComputedStyle(element).transitionDuration) <= .001
  )));

  const motionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await motionPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await motionPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await motionPage.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
  await motionPage.reload({ waitUntil: 'networkidle' });
  await motionPage.locator('.project-showcase').scrollIntoViewIfNeeded();
  await motionPage.getByRole('button', { name: 'Мобильная версия' }).click();
  assert.equal(await motionPage.locator('.project-preview').getAttribute('data-device'), 'mobile');

  if (process.env.CAPTURE_DIR) {
    await motionPage.locator('.project-showcase').screenshot({ path: path.join(process.env.CAPTURE_DIR, 'project-showcase-mobile.png') });
    await reducedPage.screenshot({ path: path.join(process.env.CAPTURE_DIR, 'intro-reduced.png') });
  }

  await motionPage.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.ScrollTrigger?.getAll().forEach((trigger) => trigger.kill());
    window.gsap?.globalTimeline.clear();
    document.getElementById('intro')?.remove();
    document.getElementById('flow-canvas')?.remove();
    document.getElementById('contacts').scrollIntoView();
  });
  await motionPage.waitForTimeout(500);
  const client = await motionPage.context().newCDPSession(motionPage);
  const events = [];
  client.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  const traceDone = new Promise((resolve) => client.once('Tracing.tracingComplete', resolve));
  await client.send('Tracing.start', { categories: 'devtools.timeline', options: 'record-as-much-as-possible' });
  await motionPage.waitForTimeout(700);
  await client.send('Tracing.end');
  await traceDone;
  const traceStart = Math.min(...events.map((event) => event.ts || Infinity));
  const renderEvents = events.filter((event) => (
    (event.name === 'Layout' || event.name === 'Paint') && event.ts - traceStart > 100000
  ));
  assert.equal(renderEvents.length, 0, `shiny button caused ${renderEvents.length} layout/paint events`);

  await page.close();
  await interruptedPage.close();
  await reducedPage.close();
  await motionPage.close();
  await browser.close();
  assert.deepEqual(errors, []);
  console.log('animation smoke: intro + showcase + reduced motion passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
