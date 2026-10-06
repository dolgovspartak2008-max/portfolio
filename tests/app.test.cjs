const assert = require('node:assert/strict');
const {
  buildProjectImageUrl,
  buildTelegramUrl,
  calculateEstimate,
  filterProjects,
  formatPrice,
  normalizeProjects,
  projectsWord,
} = require('../app.js');

assert.equal(buildProjectImageUrl('', 'https://portfolio.test'), '');
assert.equal(buildProjectImageUrl(null, 'https://portfolio.test'), '');
assert.equal(
  buildProjectImageUrl('https://s6.iimage.su/s/11/cover.jpg', 'https://portfolio.test'),
  '/api/project-image?url=https%3A%2F%2Fs6.iimage.su%2Fs%2F11%2Fcover.jpg',
);
assert.equal(
  buildProjectImageUrl('https://cdn.example.com/cover.jpg', 'https://portfolio.test'),
  'https://cdn.example.com/cover.jpg',
);

const pricing = {
  base: { title: 'Базовая разработка лендинга', price: 5000 },
  extras: [
    { key: 'domain', title: 'Подключение домена', price: 500, isFrom: false },
    { key: 'hosting', title: 'Подключение хостинга', price: 500, isFrom: false },
    { key: 'animations', title: 'Создание анимаций', price: 1000, isFrom: true },
    { key: 'seo', title: 'Базовая SEO-проработка', price: 1000, isFrom: false },
  ],
};

assert.equal(formatPrice(3000), '3 000 ₽');
assert.deepEqual(calculateEstimate(pricing, []), { total: 5000, isFrom: false, selected: [] });
assert.deepEqual(calculateEstimate(pricing, ['domain', 'animations']), {
  total: 6500,
  isFrom: true,
  selected: [pricing.extras[0], pricing.extras[2]],
});

const url = buildTelegramUrl('spartlak', pricing, ['animations'], {
  businessType: 'Заведение',
  contentStatus: 'Частично готов',
  timeline: '2–4 недели',
});
assert.ok(url.startsWith('https://t.me/spartlak?text='));
const message = decodeURIComponent(url.split('?text=')[1]);
assert.match(message, /Базовая разработка лендинга — 5 000 ₽/);
assert.match(message, /Создание анимаций — от 1 000 ₽/);
assert.match(message, /Предварительная стоимость: от 6 000 ₽/);
assert.match(message, /Тип бизнеса: Заведение/);

assert.deepEqual(normalizeProjects([{
  id: 7, title: 'Мастерская', category: 'Лендинг', live_url: 'https://example.com',
  image_url: 'https://example.com/cover.jpg', sort_order: 10, published: false,
}]), [{
  id: 7, title: 'Мастерская', category: 'Лендинг', liveUrl: 'https://example.com',
  imageUrl: 'https://example.com/cover.jpg', sortOrder: 10, published: false,
}]);
assert.equal(normalizeProjects([{ id: 4, image_url: 'https://s6.iimage.su/s/11/legacy-pulse.jpg' }])[0].imageUrl, './assets/projects/pulse.jpg');
assert.equal(normalizeProjects([{ id: 5, image_url: '' }])[0].imageUrl, './assets/projects/blue-sea.jpg');

const items = [{ title: 'Pulse', category: 'Фитнес-клуб' }, { title: 'СтейкХаус', category: 'Ресторан' }];
assert.equal(filterProjects(items, '').length, 2);
assert.deepEqual(filterProjects(items, 'ФИТНЕС'), [items[0]]);
assert.deepEqual(filterProjects(items, 'стейк'), [items[1]]);

assert.equal(projectsWord(1), 'проект');
assert.equal(projectsWord(3), 'проекта');
assert.equal(projectsWord(12), 'проектов');
assert.equal(projectsWord(52), 'проекта');
assert.equal(projectsWord(55), 'проектов');

console.log('app tests passed');
