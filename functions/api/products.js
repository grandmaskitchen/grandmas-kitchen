// GET /api/product?slug=acv001  -> { product: {...} }  (404 if not approved)

export const onRequestGet = async ({ request, env }) => {
  const u = new URL(request.url);
  const slug = (u.searchParams.get('slug') || '').trim();
  if (!slug) return json({ error: 'slug required' }, 400);

  const sel = [
    'id','product_num','affiliate_link','approved','added_by','created_at',
    'product_content(*)'
  ].join(',');

  const url =
    `${env.SUPABASE_URL}/rest/v1/products` +
    `?product_num=eq.${encodeURIComponent(slug)}` +
    `&select=${encodeURIComponent(sel)}` +
    `&limit=1`;

  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const rows = await r.json();
  if (!r.ok) return json({ error: rows?.message || 'Fetch failed' }, 400);

  const row = rows?.[0];
  if (!row || !row.approved) return json({ error: 'Not found' }, 404);

  // flatten content
  const c = row.product_content || {};
  const product = {
    id: row.id,
    slug: row.product_num,
    affiliate_link: row.affiliate_link || null,
    my_title: c.my_title || null,
    my_subtitle: c.my_subtitle || null,
    my_description_short: c.my_description_short || null,
    my_description_long: c.my_description_long || null,
    image_main: c.image_main || null,
    image_small: c.image_small || null,
    image_extra_1: c.image_extra_1 || null,
    image_extra_2: c.image_extra_2 || null,
    features: c.features || null,
    advantages: c.advantages || null,
    benefits: c.benefits || null,
  };

  return new Response(JSON.stringify({ product }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=120'
    }
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
