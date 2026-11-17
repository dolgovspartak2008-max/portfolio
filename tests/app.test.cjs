const assert = require('node:assert/strict');
const {
  buildProjectImageUrl,
  formatPrice,
  formatPriceLabel,
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

assert.equal(formatPrice(3000), '3 000 ₽');
assert.equal(formatPriceLabel({ price: 9000, isFrom: true }), 'от 9 000 ₽');
assert.equal(formatPriceLabel({ price: 500, isFrom: false }), '500 ₽');
assert.equal(formatPriceLabel({ price: null, isFrom: true }), 'по запросу');

assert.deepEqual(normalizeProjects([{
  id: 7, title: 'Мастерская', category: 'Лендинг', live_url: 'https://example.com',
  image_url: 'https://example.com/cover.jpg', sort_order: 10, published: false,
}]), [{
  id: 7, title: 'Мастерская', category: 'Лендинг', liveUrl: 'https://example.com',
  imageUrl: 'https://example.com/cover.jpg', sortOrder: 10, published: false,
}]);
assert.equal(normalizeProjects([{ id: 4, image_url: 'https://s6.iimage.su/s/11/legacy-pulse.jpg' }])[0].imageUrl, './assets/projects/pulse.jpg');
assert.equal(normalizeProjects([{ id: 5, image_url: '' }])[0].imageUrl, './assets/projects/blue-sea.jpg');

assert.equal(projectsWord(1), 'проект');
assert.equal(projectsWord(3), 'проекта');
assert.equal(projectsWord(12), 'проектов');
assert.equal(projectsWord(52), 'проекта');
assert.equal(projectsWord(55), 'проектов');

console.log('app tests passed');
