const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store',
    ...headers,
  },
});

const resolveImageUrl = async (imageUrl) => {
  if (!/^https:\/\/(?:www\.)?iimg\.su\/i\/[a-zA-Z0-9_-]+\/?$/.test(imageUrl || '')) return imageUrl;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(2500) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return imageUrl;
    const html = await response.text();
    const directUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    return directUrl?.startsWith('https://') ? directUrl : imageUrl;
  } catch (_) {
    return imageUrl;
  }
};

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
      if (!Array.isArray(projects)) return json([]);
      return json(await Promise.all(projects.map(async (project) => ({
        ...project,
        image_url: await resolveImageUrl(project.image_url),
      }))));
    } catch (_) {
      return json({ error: 'Failed to load projects' }, 502);
    }
  },
};
