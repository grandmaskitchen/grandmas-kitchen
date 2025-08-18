// GET /api/shop-list?limit=50&offset=0
// Returns approved products for the public Shop page.

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    // Only fields the shop needs
    const params = new URLSearchParams();
    params.set('select', [
      'product_num',
      'my_title',
      'my_subtitle',
      'amazon_title',
      'image_main',
      'amazon_category',
      'approved',
      'created_at'
    ].join(','));
    params.set('approved', 'eq.true');
    params.set('order', 'created_at.desc.nullslast');
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${params}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact'
      }
    });

    const items = await r.json();
    if (!r.ok) return json({ error: items?.message || 'Query failed' }, 400);
    return json({ items });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
