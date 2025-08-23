/* ---- functions/api/shop-list.js ---- */
// Public list used by /shop.html
// GET /api/shop-list?limit=100&cat=<amazon_category>&q=<search>

export const onRequestGet = async ({ request, env }) => {
  try {
    const url   = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
    const cat   = (url.searchParams.get('cat') || '').trim();   // matches amazon_category
    const q     = (url.searchParams.get('q')   || '').trim();   // optional search

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set('select', [
      'product_num',
      'my_title',
      'amazon_title',
      'my_description_short',
      'image_main',
      'affiliate_link',
      'amazon_category',
      'approved',
      'created_at',
      'updated_at'
    ].join(','));

    // only approved products
    sb.searchParams.set('approved', 'eq.true');

    // optional filters
    if (cat) sb.searchParams.set('amazon_category', `eq.${cat}`);
    if (q)   sb.searchParams.set('or', `(my_title.ilike.*${q}*,amazon_title.ilike.*${q}*)`);

    // ordering + limit
    sb.searchParams.set('order', 'updated_at.desc,created_at.desc');
    sb.searchParams.set('limit', String(limit));

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const rows = await r.json();
    if (!r.ok) {
      return json({ error: rows?.message || `Supabase error ${r.status}`, details: rows }, 500);
    }

    // List as-is (no dedupe needed since we select newest first)
    const items = Array.isArray(rows) ? rows : [];
    return json({ items, count: items.length }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
