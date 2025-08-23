// GET /api/admin/products?q=...&archived=0|1|all&limit=200
export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const archived = (url.searchParams.get('archived') || '0').trim(); // 0,1,all
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set(
      'select',
      [
        'product_num',
        'my_title',
        'amazon_title',
        'amazon_category',
        'image_main',
        'approved',
        'updated_at',
        'archived_at'
      ].join(',')
    );
    sb.searchParams.set('order', 'updated_at.desc,created_at.desc');
    sb.searchParams.set('limit', String(limit));

    if (archived === '0') sb.searchParams.set('archived_at', 'is.null');
    else if (archived === '1') sb.searchParams.set('archived_at', 'not.is.null');

    if (q) {
      // match in titles/category and also partial product_num/ASIN
      sb.searchParams.set(
        'or',
        `(my_title.ilike.*${q}*,amazon_title.ilike.*${q}*,amazon_category.ilike.*${q}*,product_num.ilike.*${q}*)`
      );
    }

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    });

    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || 'List failed', details: rows }, 400, request);

    return json({ items: Array.isArray(rows) ? rows : [] }, 200, request);
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500, request);
  }
};

function json(obj, status = 200, request) {
  const origin = request?.headers?.get?.('Origin') || '*';
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'no-store',
    },
  });
}
