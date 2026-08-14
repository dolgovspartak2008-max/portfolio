import assert from 'node:assert/strict';
import test from 'node:test';

let imageApi;
try {
  ({ default: imageApi } = await import('../api/project-image.mjs'));
} catch (_) {
  imageApi = null;
}

test('streams an iimage asset unchanged with edge caching', async () => {
  assert.equal(typeof imageApi?.fetch, 'function', 'project image API must exist');
  const originalFetch = global.fetch;
  const bytes = new Uint8Array([255, 216, 255, 217]);
  let fetchOptions;
  global.fetch = async (_url, options) => {
    fetchOptions = options;
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } });
  };

  try {
    const response = await imageApi.fetch(new Request(
      'https://portfolio.test/api/project-image?url=https%3A%2F%2Fs6.iimage.su%2Fs%2F11%2Fcover.jpg',
    ));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.match(response.headers.get('cache-control'), /s-maxage=31536000/);
    assert.equal(fetchOptions.redirect, 'error');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rejects non-iimage upstream hosts', async () => {
  assert.equal(typeof imageApi?.fetch, 'function', 'project image API must exist');
  const response = await imageApi.fetch(new Request(
    'https://portfolio.test/api/project-image?url=https%3A%2F%2Fexample.com%2Fcover.jpg',
  ));
  assert.equal(response.status, 403);
});

test('advertises GET for unsupported methods', async () => {
  const response = await imageApi.fetch(new Request('https://portfolio.test/api/project-image', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
