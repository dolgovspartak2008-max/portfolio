const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    ...headers,
  },
});

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    }

    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return json({ error: 'Supabase is not configured' }, 500);

    const query = new URLSearchParams({
      select: 'id,title,category,live_url,image_url,sort_order',
      published: 'eq.true',
      order: 'sort_order.asc,created_at.desc',
    });

    try {
      const response = await fetch(`${url}/rest/v1/projects?${query}`, {
        headers: { apikey: key },
      });
      if (!response.ok) return json({ error: 'Failed to load projects' }, 502);
      const projects = await response.json();
      return json(Array.isArray(projects) ? projects : []);
    } catch (_) {
      return json({ error: 'Failed to load projects' }, 502);
    }
  },
};
