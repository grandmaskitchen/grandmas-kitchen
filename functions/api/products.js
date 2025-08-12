// Cloudflare Pages Function: POST /api/products
// Inserts a product row into Supabase (service role key required)

export const onRequestOptions = async ({ request }) => {
  // Minimal CORS preflight support (harmless even if same-origin)
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email',
    },
  });
};

export const onRequestPost = async ({ request, env }) => {
  // 1) Parse JSON safely
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  // 2) Access email (if this route is protected by Cloudflare Access)
  const accessEmail =
    request.headers.get('cf-access-authenticated-user-email') ||
    request.headers.get('Cf-Access-Authenticated-User-Email') ||
    null;

  // 3) Whitelist + trim fields that match your Supabase columns
  const pick = (k) => (body[k] ?? '').toString().trim();

  const row = {
    manufacturer:        pick('manufacturer'),
    product_num:         pick('product_num'),
    affiliate_link:      pick('affiliate_link'),
    amazon_title:        pick('amazon_title'),
    amazon_desc:         pick('amazon_desc'),
    my_title:            pick('my_title'),
    my_subtitle:         pick('my_subtitle'),
    my_description_short:pick('my_description_short'),
    my_description_long: pick('my_description_long'),
    image_main:          pick('image_main'),
    image_small:         pick('image_small'),
    image_extra_1:       pick('image_extra_1'),
    image_extra_2:       pick('image_extra_2'),
    where_advertised:    pick('where_advertised'),
    ad_type:             pick('ad_type'),
    amazon_category:     pick('amazon_category'),
    product_type:        pick('product_type'),

    // types
    commission_l:
      body.commission_l === '' || body.commission_l == null
        ? null
        : Number(body.commission_l),

    approved: !!body.approved,

    // prefer Access email; fall back to manual field if you ever expose it
    added_by: (pick('added_by') || accessEmail || null) || null,
  };

  // 4) Basic validation
  if (!row.my_title)                return json({ error: 'my_title is required' }, 400);
  try { new URL(row.image_main); }  catch { return json({ error: 'image_main must be a valid URL' }, 400); }
  if (row.affiliate_link) {
    const ok = /^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link);
    if (!ok) return json({ error: 'affiliate_link must be an Amazon URL' }, 400);
  }

  // 5) Insert via Supabase REST (service role)
  const url = `${env.SUPABASE_URL}/rest/v1/products`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const details = await res.text();
    return json({ error: 'Insert failed', details }, 500);
  }

  const data = await res.json(); // array when Prefer:return=representation
  return json({ ok: true, product: data?.[0] ?? row }, 201);
};

// small helper
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
