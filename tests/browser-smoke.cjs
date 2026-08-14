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
      body: JSON.stringify([4, 5, 6, 7, 8].map((id) => ({
        id,
        title: ({ 4: 'Pulse', 5: 'BlueSea', 6: 'BRAVO', 7: 'СтейкХаус', 8: 'PRECISION AUTO' })[id],
        category: 'Лендинг',
        live_url: 'https://example.com',
        image_url: `https://s6.iimage.su/s/11/legacy-project-${id}.jpg`,
        sort_order: id,
      }))),
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
    assert.equal(await page.locator('.project-card').count(), 5);
    assert.equal(await page.locator('.project-card__visual img').count(), 5);
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('.project-card__visual img'));
      return images.length === 5 && images.every((image) => image.naturalWidth === 1254);
    });
    assert.equal(await page.locator('.project-card__visual img').evaluateAll((images) => images.every((image) => (
      image.loading === 'eager'
      && image.decoding === 'async'
      && image.currentSrc.startsWith(`${location.origin}/assets/projects/`)
    ))), true);
    if (viewport.name !== 'mobile-landscape') {
      assert.equal(await page.locator('.project-card').first().evaluate((element) => element.classList.contains('is-shutter-active')), false);
      await page.locator('.radial-stage').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.project-card.is-shutter-active'));
      const galleryAccessibility = await page.locator('.radial-wheel__item').evaluateAll((items) => ({
        active: items.filter((item) => item.classList.contains('is-active') && !item.inert && !item.hasAttribute('aria-hidden')).length,
        inactive: items.filter((item) => !item.classList.contains('is-active') && item.inert && item.getAttribute('aria-hidden') === 'true').length,
      }));
      assert.deepEqual(galleryAccessibility, { active: 1, inactive: 4 });
    }
    assert.equal(await page.locator('.project-card h3 .project-card__glyph').count(), 0);
    assert.equal(await page.locator('.project-card h3').first().textContent(), 'Pulse');
    assert.equal(await page.locator('.project-card h3').first().evaluate((element) => getComputedStyle(element).textAlign), 'center');
    assert.equal(await page.locator('.project-card small').first().evaluate((element) => getComputedStyle(element).textAlign), 'center');
    assert.ok(await page.locator('.project-card h3').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return style.fontFamily.includes('Marck Script')
        && style.fontStyle === 'normal'
        && parseFloat(style.fontSize) >= 30;
    }));
    assert.equal(await page.evaluate(() => document.fonts.check('40px "Marck Script"', 'СтейкХаус')), true);
    const cardTextLayout = await page.locator('.project-card').first().evaluate((element) => {
      const card = element.getBoundingClientRect();
      const category = element.querySelector('small').getBoundingClientRect();
      const title = element.querySelector('h3').getBoundingClientRect();
      return {
        categoryBottom: category.bottom,
        categoryCenterOffset: Math.abs((category.left + category.width / 2) - (card.left + card.width / 2)),
        titleCenter: title.top + title.height / 2,
      };
    });
    assert.ok(cardTextLayout.categoryBottom < cardTextLayout.titleCenter);
    assert.ok(cardTextLayout.categoryCenterOffset < 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.locator('.extras-disclosure summary').click();
    await page.locator('.service-option', { hasText: 'Создание анимаций' }).click();
    assert.equal(await page.locator('#estimate-total').textContent(), 'от 4 000 ₽');
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
    if (viewport.name === 'desktop') {
      const titleAnimations = await page.locator('.project-card.is-shutter-active h3').evaluate((element) => (
        element.getAnimations().map((animation) => animation.animationName)
      ));
      assert.ok(titleAnimations.includes('project-title-write'));
      assert.equal(await page.locator('.project-card').first().evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(7, 17, 38)');
      const radialClearance = await page.locator('.radial-viewport').evaluate((element) => {
        const viewportBox = element.getBoundingClientRect();
        const cardBox = element.querySelector('.project-card').getBoundingClientRect();
        return cardBox.top - viewportBox.top;
      });
      assert.ok(radialClearance >= 20, `desktop radial card clearance was ${radialClearance}px`);
      const arcLayout = await page.locator('.radial-viewport').evaluate((element) => {
        const viewportBox = element.getBoundingClientRect();
        const wheelBox = element.querySelector('.radial-wheel').getBoundingClientRect();
        const fullyVisible = Array.from(element.querySelectorAll('.project-card')).filter((card) => {
          const box = card.getBoundingClientRect();
          return box.top >= viewportBox.top && box.bottom <= viewportBox.bottom
            && box.left >= viewportBox.left && box.right <= viewportBox.right;
        }).length;
        return { wheelBelow: wheelBox.top >= viewportBox.bottom, fullyVisible };
      });
      assert.equal(arcLayout.wheelBelow, true);
      assert.equal(arcLayout.fullyVisible, 1);
    }
    if (viewport.name !== 'mobile-landscape') {
      const galleryFocus = await page.locator('.radial-viewport').evaluate((element) => {
        const viewport = element.getBoundingClientRect();
        const wheel = element.querySelector('.radial-wheel').getBoundingClientRect();
        const active = element.querySelector('.radial-wheel__item.is-active .project-card').getBoundingClientRect();
        const visibleItems = Array.from(element.querySelectorAll('.radial-wheel__item')).filter((item) => (
          parseFloat(getComputedStyle(item).opacity) > .05
        )).length;
        const transitionDuration = getComputedStyle(element.querySelector('.radial-wheel__item')).transitionDuration;
        return { width: active.width, height: active.height, visibleItems, transitionDuration, wheelClearance: wheel.top - viewport.bottom };
      });
      assert.ok(galleryFocus.width <= 260, `${viewport.name}: card width was ${galleryFocus.width}px`);
      assert.ok(galleryFocus.height <= 342, `${viewport.name}: card height was ${galleryFocus.height}px`);
      assert.equal(galleryFocus.visibleItems, 1);
      assert.equal(galleryFocus.transitionDuration, '0s');
      assert.ok(galleryFocus.wheelClearance >= 15, `${viewport.name}: wheel clearance was ${galleryFocus.wheelClearance}px`);
      if (process.env.CAPTURE_DIR && ['desktop', 'mobile'].includes(viewport.name)) {
        await page.locator('.radial-stage').scrollIntoViewIfNeeded();
        await page.waitForTimeout(750);
        await page.locator('.radial-viewport').screenshot({
          path: path.join(process.env.CAPTURE_DIR, `gallery-${viewport.name}.png`),
        });
      }
    }
    if (['desktop', 'mobile'].includes(viewport.name)) {
      const projectSequence = await page.evaluate(async () => {
        const trigger = window.ScrollTrigger.getAll().find((item) => item.pin?.classList.contains('radial-stage'));
        const expected = ['Pulse', 'BlueSea', 'BRAVO', 'СтейкХаус', 'PRECISION AUTO'];
        const actual = [];
        const fullyVisible = [];
        const contentFits = [];
        for (let index = 0; index < expected.length; index += 1) {
          window.scrollTo({
            top: trigger.start + ((trigger.end - trigger.start) * index / expected.length),
            behavior: 'instant',
          });
          window.ScrollTrigger.update();
          await new Promise((resolve) => setTimeout(resolve, 750));
          const viewportBox = document.querySelector('.radial-viewport').getBoundingClientRect();
          const activeCard = document.querySelector('.radial-wheel__item.is-active .project-card');
          const cardBox = activeCard.getBoundingClientRect();
          actual.push(activeCard.querySelector('h3').textContent);
          fullyVisible.push(cardBox.top >= viewportBox.top && cardBox.bottom <= viewportBox.bottom
            && cardBox.left >= viewportBox.left && cardBox.right <= viewportBox.right);
          const title = activeCard.querySelector('h3');
          contentFits.push(title.getBoundingClientRect().bottom <= cardBox.bottom - 8);
        }
        return { actual, expected, fullyVisible, contentFits };
      });
      assert.deepEqual(projectSequence.actual, projectSequence.expected);
      assert.deepEqual(projectSequence.fullyVisible, [true, true, true, true, true]);
      assert.deepEqual(projectSequence.contentFits, [true, true, true, true, true]);
    }
    if (viewport.name === 'mobile') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => (
        !document.querySelector('.pin-spacer')
        && Array.from(document.querySelectorAll('.radial-wheel__item')).every((item) => (
          !item.inert && !item.hasAttribute('aria-hidden') && getComputedStyle(item).opacity === '1'
        ))
      ), null, { timeout: 3000 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => (
        document.querySelector('.pin-spacer')
        && document.querySelectorAll('.radial-wheel__item[aria-hidden="true"][inert]').length === 4
      ), null, { timeout: 3000 });
    }
    if (viewport.width <= 430) {
      const titleBox = await page.locator('.hero h1').boundingBox();
      const heroGridBox = await page.locator('.hero__grid').boundingBox();
      assert.ok(heroGridBox && portraitBox && portraitBox.width >= heroGridBox.width * .95);
      assert.ok(titleBox && portraitBox && portraitBox.y < titleBox.y + titleBox.height);
      assert.ok(await page.locator('.hero__details').evaluate((element) => {
        const fade = getComputedStyle(element, '::before');
        return fade.content !== 'none' && parseFloat(fade.height) >= 140;
      }));
      assert.ok(await page.locator('.portrait-frame img').evaluate((element) => (
        getComputedStyle(element).transform === 'none'
        && parseFloat(getComputedStyle(element).objectPosition) >= 60
        && parseFloat(getComputedStyle(element).objectPosition) <= 75
      )));
      assert.notEqual(await page.locator('.radial-wheel').evaluate((element) => getComputedStyle(element).position), 'static');
      assert.equal(await page.locator('.radial-wheel').evaluate((element) => getComputedStyle(element).display), 'block');
      assert.equal(await page.evaluate(() => (
        window.ScrollTrigger.getAll().some((trigger) => trigger.pin?.classList.contains('radial-stage'))
      )), viewport.name !== 'mobile-landscape');
      assert.equal(await page.locator('.final-cta .shiny-cta').textContent(), 'НАПИСАТЬ В ТЕЛЕГРАМ');
      assert.ok(await page.locator('.final-cta .shiny-cta').evaluate((element) => element.getBoundingClientRect().height >= 52));
      assert.equal(await page.locator('.final-cta .shiny-cta span').evaluate((element) => (
        getComputedStyle(element, '::before').content
      )), 'none');
      assert.ok(await page.locator('.final-cta > p:not(.section-kicker)').evaluate((element) => parseFloat(getComputedStyle(element).fontSize) >= 16));
      assert.ok(channelLinkBox.y > contactButtonBox.y + 40);
    }
    if (viewport.name === 'mobile-landscape') {
      assert.equal(await page.locator('.pin-spacer').count(), 0);
      assert.ok(await page.locator('.works-section').evaluate((element) => element.getBoundingClientRect().height < innerHeight * 3));
      const staticGallery = await page.locator('.radial-wheel').evaluate((wheel) => {
        const items = Array.from(wheel.querySelectorAll('.radial-wheel__item'));
        wheel.scrollLeft = wheel.scrollWidth;
        const last = items.at(-1);
        return {
          allAccessible: items.every((item) => !item.inert && !item.hasAttribute('aria-hidden') && getComputedStyle(item).opacity === '1'),
          noOverlap: items.slice(1).every((item, index) => items[index].offsetLeft + items[index].offsetWidth <= item.offsetLeft),
          lastReachable: last.offsetLeft + last.offsetWidth <= wheel.scrollLeft + wheel.clientWidth + 1,
        };
      });
      assert.deepEqual(staticGallery, { allAccessible: true, noOverlap: true, lastReachable: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => (
        document.querySelector('.pin-spacer')
        && document.querySelectorAll('.radial-wheel__item[aria-hidden="true"][inert]').length === 4
      ), null, { timeout: 3000 });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => (
        !document.querySelector('.pin-spacer')
        && Array.from(document.querySelectorAll('.radial-wheel__item')).every((item) => (
          !item.inert && !item.hasAttribute('aria-hidden') && getComputedStyle(item).opacity === '1'
        ))
      ), null, { timeout: 3000 });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.ScrollTrigger?.update());
    if (process.env.CAPTURE_DIR) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.project-card').first().waitFor();
    }
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
  assert.equal(await fallbackPage.locator('.project-card').count(), 5);
  assert.equal(await fallbackPage.locator('.radial-wheel__item').count(), 5);
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
