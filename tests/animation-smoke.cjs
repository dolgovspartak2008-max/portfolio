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

  await page.goto('http://127.0.0.1:4173/?t=2.1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true);
  assert.equal(await page.locator('#intro').evaluate((element) => {
    const color = getComputedStyle(element).backgroundColor;
    const box = element.getBoundingClientRect();
    return color === 'rgb(1, 4, 12)' && box.width >= innerWidth && box.height >= innerHeight;
  }), true);

  const mobileIntroPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobileIntroPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await mobileIntroPage.goto('http://127.0.0.1:4173/?t=.55', { waitUntil: 'networkidle' });
  assert.equal(await mobileIntroPage.evaluate(() => {
    const intro = document.getElementById('intro').getBoundingClientRect();
    const headerVisibility = getComputedStyle(document.getElementById('site-header')).visibility;
    return intro.top <= -1 && intro.bottom >= innerHeight + 1 && headerVisibility === 'hidden';
  }), true);

  const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reducedPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await reducedPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('#intro').evaluate((element) => element.classList.contains('is-done')), true);
  assert.equal(await reducedPage.locator('#name-decode').textContent(), 'СПАРТАК');
  const reducedOptions = process.env.CAPTURE_DIR
    ? { path: path.join(process.env.CAPTURE_DIR, 'intro-reduced.png') }
    : {};
  assert.ok((await reducedPage.screenshot(reducedOptions)).length > 10000);

  const motionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await motionPage.route('**/api/projects', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await motionPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await motionPage.evaluate(() => sessionStorage.setItem('spartak-intro-v2-seen', '1'));
  await motionPage.reload({ waitUntil: 'networkidle' });
  await motionPage.locator('.project-card').first().scrollIntoViewIfNeeded();
  await motionPage.waitForFunction(() => document.querySelector('.project-card.is-shutter-active'));
  const titleAnimationNames = await motionPage.locator('.project-card.is-shutter-active').evaluate((element) => {
    element.classList.remove('is-shutter-active');
    void element.offsetWidth;
    element.classList.add('is-shutter-active');
    const animations = element.querySelector('.project-card__glyph').getAnimations({ subtree: true });
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = 260;
    });
    return animations.map((animation) => animation.animationName);
  });
  assert.ok(titleAnimationNames.includes('project-shutter-right'));
  assert.ok(titleAnimationNames.includes('project-shutter-left'));

  await reducedPage.locator('.project-card').first().waitFor();
  const reducedGallery = await reducedPage.locator('.radial-wheel').evaluate((wheel) => {
    const items = Array.from(wheel.querySelectorAll('.radial-wheel__item'));
    const boxes = items.map((item) => item.getBoundingClientRect());
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      allAccessible: items.every((item) => !item.inert && !item.hasAttribute('aria-hidden') && getComputedStyle(item).opacity === '1'),
      noOverlap: boxes.every((box, index) => boxes.slice(index + 1).every((other) => !intersects(box, other))),
    };
  });
  assert.deepEqual(reducedGallery, { allAccessible: true, noOverlap: true });
  assert.ok(await reducedPage.locator('.project-card__glyph-top').first().evaluate((element) => (
    parseFloat(getComputedStyle(element).animationDuration) <= .001
  )));
  if (process.env.CAPTURE_DIR) {
    await motionPage.locator('.project-card.is-shutter-active').evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.classList.add('project-card--verification');
      Object.assign(clone.style, {
        position: 'fixed',
        zIndex: '2147483647',
        top: '50%',
        left: '50%',
        width: '300px',
        height: '390px',
        transform: 'translate(-50%, -50%)',
      });
      document.body.append(clone);
    });
    await motionPage.locator('.project-card--verification').evaluate((element) => {
      element.getAnimations({ subtree: true }).forEach((animation) => {
        animation.pause();
        animation.currentTime = 330;
      });
    });
    await motionPage.locator('.project-card--verification').screenshot({ path: path.join(process.env.CAPTURE_DIR, 'project-title-normal.png') });
    await motionPage.locator('.project-card--verification').evaluate((element) => element.remove());
    await reducedPage.locator('.project-card').first().scrollIntoViewIfNeeded();
    await reducedPage.locator('.project-card').first().screenshot({ path: path.join(process.env.CAPTURE_DIR, 'project-title-reduced.png') });
  }
  await motionPage.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.ScrollTrigger?.getAll().forEach((trigger) => trigger.kill());
    window.gsap?.globalTimeline.clear();
    document.querySelectorAll('.project-card').forEach((card) => card.classList.remove('is-shutter-active'));
    document.getElementById('intro')?.remove();
    document.getElementById('flow-canvas')?.remove();
    document.getElementById('contacts').scrollIntoView();
  });
  await motionPage.waitForTimeout(500);
  if (process.env.CAPTURE_DIR) {
    await motionPage.locator('.final-cta').screenshot({ path: path.join(process.env.CAPTURE_DIR, 'shiny-normal.png') });
    await reducedPage.locator('.shiny-cta').scrollIntoViewIfNeeded();
    await reducedPage.locator('.final-cta').screenshot({ path: path.join(process.env.CAPTURE_DIR, 'shiny-reduced.png') });
  }
  await page.close();
  await interruptedPage.close();
  await mobileIntroPage.close();
  await reducedPage.close();
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

  await browser.close();
  assert.deepEqual(errors, []);
  console.log('animation smoke: GSAP timeline + reduced motion passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
