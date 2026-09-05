const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
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
  await interruptedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
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
  await reducedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
  await reducedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('#intro').evaluate((element) => element.classList.contains('is-done')), true);
  assert.equal(await reducedPage.locator('#name-decode').textContent(), 'СПАРТАК');
  await reducedPage.locator('.radial-wheel').waitFor();
  assert.deepEqual(await reducedPage.locator('.radial-wheel__item').evaluateAll((items) => ({
    accessible: items.every((item) => !item.inert && !item.hasAttribute('aria-hidden')),
    staticLayout: items.every((item) => getComputedStyle(item).position === 'static'),
  })), { accessible: true, staticLayout: true });
  assert.equal(await reducedPage.locator('.pin-spacer').count(), 0);

  const motionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await motionPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
  await motionPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await motionPage.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
  await motionPage.reload({ waitUntil: 'networkidle' });
  await motionPage.locator('.radial-stage').scrollIntoViewIfNeeded();
  await motionPage.waitForFunction(() => document.querySelector('.project-card.is-shutter-active'));
  assert.equal(await motionPage.locator('.pin-spacer').count(), 1);
  await motionPage.evaluate(() => {
    const trigger = window.ScrollTrigger.getAll().find((item) => item.pin?.classList.contains('radial-stage'));
    window.scrollTo({ top: trigger.start + 1, behavior: 'instant' });
    window.ScrollTrigger.update();
  });
  await motionPage.waitForFunction(() => document.querySelector('.radial-stage.is-animating'));
  assert.equal(await motionPage.locator('.radial-stage').evaluate((element) => element.classList.contains('is-animating')), true);
  const titleAnimationNames = await motionPage.locator('.project-card.is-shutter-active').evaluate((element) => (
    element.querySelector('.project-card__glyph').getAnimations({ subtree: true }).map((animation) => animation.animationName)
  ));
  assert.ok(titleAnimationNames.includes('project-shutter-right'));
  assert.ok(titleAnimationNames.includes('project-shutter-left'));

  await motionPage.evaluate(async () => {
    const trigger = window.ScrollTrigger.getAll().find((item) => item.pin?.classList.contains('radial-stage'));
    // Warm each angle before measuring recurring paint, not first-time rasterization.
    const projectCount = document.querySelectorAll('.radial-wheel__item').length;
    for (let frame = 2; frame <= 24; frame += 1) {
      trigger.animation.progress(frame / (60 * projectCount));
      await new Promise(requestAnimationFrame);
    }
    trigger.animation.progress(.01);
  });
  await motionPage.waitForTimeout(1300);
  const galleryClient = await motionPage.context().newCDPSession(motionPage);
  const galleryEvents = [];
  galleryClient.on('Tracing.dataCollected', ({ value }) => galleryEvents.push(...value));
  const galleryTraceDone = new Promise((resolve) => galleryClient.once('Tracing.tracingComplete', resolve));
  await galleryClient.send('Tracing.start', { categories: 'devtools.timeline', options: 'record-as-much-as-possible' });
  await motionPage.evaluate(async () => {
    const trigger = window.ScrollTrigger.getAll().find((item) => item.pin?.classList.contains('radial-stage'));
    const projectCount = document.querySelectorAll('.radial-wheel__item').length;
    for (let frame = 2; frame <= 24; frame += 1) {
      trigger.animation.progress(frame / (60 * projectCount));
      await new Promise(requestAnimationFrame);
    }
  });
  await galleryClient.send('Tracing.end');
  await galleryTraceDone;
  const galleryTraceStart = Math.min(...galleryEvents.map((event) => event.ts || Infinity));
  const galleryRenderEvents = galleryEvents.filter((event) => event.ts - galleryTraceStart > 100000);
  const galleryLayouts = galleryRenderEvents.filter((event) => event.name === 'Layout').length;
  const galleryPaints = galleryRenderEvents.filter((event) => event.name === 'Paint').length;
  assert.equal(galleryLayouts, 0, `radial gallery caused ${galleryLayouts} layout events`);
  assert.ok(galleryPaints <= 6, `radial gallery repainted on ${galleryPaints} frames`);

  if (process.env.CAPTURE_DIR) {
    await motionPage.locator('.radial-viewport').screenshot({ path: path.join(process.env.CAPTURE_DIR, 'gallery-mobile.png') });
    await reducedPage.screenshot({ path: path.join(process.env.CAPTURE_DIR, 'intro-reduced.png') });
  }

  const fallbackPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await fallbackPage.route('**/vendor/gsap.min.js', (route) => route.abort());
  await fallbackPage.route('**/vendor/ScrollTrigger.min.js', (route) => route.abort());
  await fallbackPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(require('../content/site.json').projects) }));
  await fallbackPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await fallbackPage.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
  await fallbackPage.reload({ waitUntil: 'networkidle' });
  await fallbackPage.locator('.radial-wheel').waitFor();
  assert.equal(await fallbackPage.locator('.pin-spacer').count(), 0);
  assert.deepEqual(await fallbackPage.locator('.radial-wheel__item').evaluateAll((items) => ({
    accessible: items.every((item) => !item.inert && !item.hasAttribute('aria-hidden')),
    visible: items.every((item) => getComputedStyle(item).opacity === '1'),
  })), { accessible: true, visible: true });

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
  await fallbackPage.close();
  await browser.close();
  assert.deepEqual(errors, []);
  console.log('animation smoke: intro + radial gallery + reduced motion passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
