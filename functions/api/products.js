// /functions/api/products.js
// Handles POST /api/products from the admin form

export const onRequestPost = async ({ request, env }) => {
  try {
    const input = await request.json();

    // Email from Cloudflare Access (only present if /admin/* is protected)
    const email =
      request.headers.get('Cf-Access-Authenticated-User-Email') ||
      request.headers.get('cf-access-authenticated-user-email') ||
      null;

    // Basic server-side guardrails
    if (!input.my_title || !String(input.my_title).trim()) {
      return json({ error: 'Title is required' }, 400);
    }
    try {
      new URL(input.image_main);
    } catch {
      return json({ error: 'Main Image URL is invalid' }, 400);
    }
    if (
      input.affiliate_link &&
      !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(input.affiliate_link)
    ) {
      return json({ error: 'Affiliate link must be an Amazon URL' }, 400);
    }

    // Build a row matching your Supabase columns exactly
    const row = {
      manufacturer:        input.manufacturer || null,
      product_num:         input.product_num || null,
      affiliate_link:      input.affiliate_link || null,
      amazon_title:        input.amazon_title || null,
      amazon_desc:         input.amazon_desc || null,
      my_title:            input.my_title,
      my_subtitle:         input.my_subtitle || null,
      my_description_short:input.my_description_short || null,
      my_description_long: input.my_description_long || null,
      image_main:          input.image_main,
      image_small:         input.image_small || null,
      image_extra_1:       input.image_extra_1 || null,
      image_extra_2:       input.image_extra_2 || null,
      where_advertised:    input.where_advertised || null,
      ad_type:             input.ad_type || null,
      added_by:            email, // recorded automatically from Access
      amazon_category:     input.amazon_category || null,
      product_type:        input.product_type || null,
      commission_l:        input.commission_l !== '' && input.commission_l != null
                             ? Number(input.commission_l)
                             : null,
      approved:            input.approved === 'on' || input.approved === true
      // created_at is omitted; Supabase default now() will populate it
    };

    // Insert into Supabase (service role key required)
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(row)
    });

    const out = await resp.json();

    if (!resp.ok) {
      // Forward helpful message if PostgREST returns one
      return json({ error: out?.message || 'Supabase error' }, 500);
    }

    // out is an array when Prefer:return=representation
    return json({ ok: true, product: out?.[0] ?? null, added_by: email }, 201);
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
