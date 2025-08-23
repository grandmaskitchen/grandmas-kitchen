// /functions/api/admin/products.js
// GET /api/admin/products?state=active|archived|all&q=<term>&limit=100
export const onRequestGet = async ({ request, env }) => {
  const reqUrl = new URL(request.url);

  // --- quick probe so you can confirm which file is live ---
  if (reqUrl.searchParams.has('__ping')) {
    return json({
      ok: true,
      route: '/api/admin/products',
      using_order: 'created_at.desc.nullslast',
      ts: new Date().toISOString()
    });
  }

  try {
    const state = (reqUrl.searchParams.get('state') || 'all').toLowerCase();
    const q     = (reqUrl.searchParams.get('q') || '').trim();
    const limit = Math.min(parseInt(reqUrl.searchParams.get('limit') || '100', 10), 200);

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set('select', [
      'product_num',
      'my_title',
      'amazon_title',
      'image_main',
      'amazon_category',
      'archived_at',
      'created_at'
    ].join(','));

    if (state === 'active')   sb.searchParams.set('archived_at', 'is.null');
    if (state === 'archived') sb.searchParams.set('archived_at', 'not.is.null');

    if (q) {
      const term = `*${q}*`;
      sb.searchParams.set(
        'or',
        `(my_title.ilike.${term},amazon_title.ilike.${term},amazon_category.ilike.${term},product_num.ilike.${term})`
      );
    }

    // IMPORTANT: only order by created_at (your table has this column)
    sb.searchParams.set('order', 'created_at.desc.nullslast');
    sb.searchParams.set('limit', String(limit));

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact'
      },
    });

    const rows = await r.json();
    if (!r.ok) {
      // include the URL to prove which query hit Supabase
      return json({
        error: rows?.message || `Supabase error ${r.status}`,
        details: rows,
        supabase_url: sb.toString()
      }, 500, request);
    }

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
