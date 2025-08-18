// GET /api/admin/products-list?q=&category=&approved=
// Returns a paged, filtered list for the admin table

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const category = url.searchParams.get('category') || '';
    const approved = url.searchParams.get('approved') || '';
    const limit = 200, offset = 0;

    const params = new URLSearchParams();
    params.set('select', [
      'product_num','my_title','my_subtitle','amazon_category',
      'image_main','approved'
    ].join(','));
    params.set('order', 'created_at.desc.nullslast');
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    // filters
    if (q) {
      params.set('or', `my_title.ilike.*${q}*,amazon_title.ilike.*${q}*`);
    }
    if (category) {
      params.set('amazon_category', `eq.${category}`);
    }
    if (approved === 'true' || approved === 'false') {
      params.set('approved', `eq.${approved}`);
    }

    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${params}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      }
    });

    const items = await r.json();
    if (!r.ok) return json({ error: items?.message || 'Query failed' }, 400);

    return json({ items });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
