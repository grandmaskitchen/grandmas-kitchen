/* ---- functions/api/shop-list.js ---- */
// Public list used by /shop.html
// GET /api/shop-list?limit=100&cat=<category-slug>&q=<search>

export const onRequestGet = async ({ request, env }) => {
  try {
    const url   = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
    const cat   = (url.searchParams.get('cat') || '').trim();   // category slug
    const q     = (url.searchParams.get('q')   || '').trim();   // optional search

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set('select', [
      'product_num',
      'my_title',
      'amazon_title',
      'my_description_short',
      'image_main',
      'affiliate_link',
      'approved',
      'amazon_category',
      'shop_category_id',
      'created_at',
      'updated_at',
      // join categories via FK products.shop_category_id -> categories.id
      'categories:shop_category_id(id,name,slug)'
    ].join(','));

    sb.searchParams.set('approved', 'eq.true');
    sb.searchParams.set('archived_at', 'is.null');          // hide archived
    sb.searchParams.set('order', 'updated_at.desc');
    sb.searchParams.set('limit', String(limit));

    if (cat) sb.searchParams.set('categories.slug', `eq.${cat}`);
    if (q)   sb.searchParams.set('or', `(my_title.ilike.*${q}*,amazon_title.ilike.*${q}*)`);

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    });

    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || `Supabase error ${r.status}`, details: rows }, 500);

    // Dedupe by product_num (newest wins)
    const seen = new Set();
    const items = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = (row.product_num || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push(row);
    }

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
