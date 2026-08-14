const json = (body, status, headers = {}) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store', ...headers },
});

export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' });

    let upstreamUrl;
    try {
      upstreamUrl = new URL(new URL(request.url).searchParams.get('url'));
    } catch (_) {
      return json({ error: 'Invalid image URL' }, 400);
    }

    const allowedHost = upstreamUrl.hostname === 'iimage.su' || upstreamUrl.hostname.endsWith('.iimage.su');
    if (upstreamUrl.protocol !== 'https:' || !allowedHost) {
      return json({ error: 'Image host is not allowed' }, 403);
    }

    try {
      const response = await fetch(upstreamUrl, {
        headers: { Accept: 'image/avif,image/webp,image/*,*/*;q=.8' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.startsWith('image/')) {
        return json({ error: 'Failed to load image' }, 502);
      }

      return new Response(response.body, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400',
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (_) {
      return json({ error: 'Failed to load image' }, 502);
    }
  },
};
