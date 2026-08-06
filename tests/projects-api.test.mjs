import assert from 'node:assert/strict';
import test from 'node:test';
import projectsApi from '../api/projects.mjs';

test('returns published projects from Supabase', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  process.env.SUPABASE_URL = 'https://demo.supabase.co/';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  globalThis.fetch = async (url, options) => {
    assert.equal(
      url,
      'https://demo.supabase.co/rest/v1/projects?select=id%2Ctitle%2Ccategory%2Clive_url%2Cimage_url%2Csort_order&published=eq.true&order=sort_order.asc%2Ccreated_at.desc',
    );
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    return Response.json([{ id: 1, title: 'Project', category: 'Landing' }]);
  };

  try {
    const response = await projectsApi.fetch(new Request('https://site.test/api/projects'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: 1, title: 'Project', category: 'Landing' }]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test('rejects methods other than GET', async () => {
  const response = await projectsApi.fetch(new Request('https://site.test/api/projects', { method: 'POST' }));
  assert.equal(response.status, 405);
});

test('reports missing Supabase environment variables', async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;

  try {
    const response = await projectsApi.fetch(new Request('https://site.test/api/projects'));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Supabase is not configured' });
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    if (originalKey !== undefined) process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
