const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    let projects = [{ id: 4, title: 'Pulse', category: 'Фитнес-клуб', image_url: 'https://photos.test/new-cover.jpg', live_url: 'https://updated-project.test', sort_order: 1 }];
    await page.route('**/api/projects', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(projects) }));
    await page.route('https://photos.test/**', (route) => route.request().url().endsWith('/missing.jpg')
      ? route.fulfill({ status: 404, body: 'Not found' })
      : route.fulfill({ path: path.join(__dirname, '../assets/projects/pulse.jpg'), contentType: 'image/jpeg' }));
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    const cover = page.locator('.project-card__visual img').first();
    assert.equal(await cover.getAttribute('src'), projects[0].image_url, 'Telegram image must override the local cover');
    assert.equal(await page.locator('.project-card').first().getAttribute('href'), 'https://updated-project.test/');
    assert.ok(await cover.evaluate((image) => image.naturalWidth > 0));
    projects[0].image_url = 'https://photos.test/replaced-cover.jpg';
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await cover.getAttribute('src'), projects[0].image_url, 'Replacing a cover must load the new URL');
    projects[0].image_url = 'https://photos.test/missing.jpg';
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await cover.getAttribute('src'), /assets\/projects\/pulse\.jpg$/);
    assert.ok(await cover.evaluate((image) => image.naturalWidth > 0), 'An unavailable remote cover must use the local fallback');
    projects = [{ id: 99, title: 'Новый проект', category: 'Лендинг', image_url: null, live_url: null }];
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.project-card__visual img').count(), 0);
    assert.equal(await page.locator('.project-card__placeholder').isVisible(), true);
    projects = [];
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.project-card').count(), 0, 'Hiding all projects must not resurrect local projects');
    assert.equal(await page.locator('.empty-state').count(), 1);
    console.log('project images: API precedence, replacement, missing cover and empty portfolio passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });
