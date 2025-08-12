// POST /api/products  (Cloudflare Pages Function)
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    // Who is submitting (from Cloudflare Access)
    const submitter =
      request.headers.get('Cf-Access-Authenticated-User-Email') ||
      request.headers.get('cf-access-authenticated-user-email') || null;

    // Build a row matching YOUR columns
    const row = {
      manufacturer:          (body.manufacturer || '').toString(),
      product_num:           (body.product_num || '').toString(),
      affiliate_link:        (body.affiliate_link || '').toString(),
      amazon_title:          (body.amazon_title || '').toString(),
      amazon_desc:           (body.amazon_desc || '').toString(),
      my_title:              (body.my_title || '').toString().slice(0, 120),
      my_subtitle:           (body.my_subtitle || '').toString().slice(0, 160),
      my_description_short:  (body.my_description_short || '').toString().slice(0, 300),
      my_description_long:   (body.my_description_long || '').toString(),
      image_main:            (body.image_main || '').toString(),
      image_small:           (body.image_small || '').toString(),
      image_extra_1:         (body.image_extra_1 || '').toString(),
      image_extra_2:         (body.image_extra_2 || '').toString(),
      where_advertised:      (body.where_advertised || '').toString(),
      ad_type:               (body.ad_type || '').toString(),
      added_by:              submitter || (body.added_by || '').toString(), // prefer email from Access
      amazon_category:       (body.amazon_category || '').toString(),
      product_type:          (body.product_type || '').toString(),
      commission_l:          toNumberOrNull(body.commission_l),
      approved:              false,  // new rows start unapproved
      created_at:            new Date().toISOString()
    };

    // Light validation
    if (!row.my_title.trim()) return json({error:'Title required'}, 400);
    try { new URL(row.image_main); } catch { return json({error:'Bad image URL'}, 400); }
    if (row.affiliate_link && !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link))
      return json({error:'Affiliate link must be Amazon'}, 400);

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorisation': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(row)
    });

    if (!resp.ok) return json({error: await resp.text()}, resp.status);
    const data = await resp.json();
    return json({ok:true, product:data?.[0] || null}, 201);

  } catch (e) {
    return json({error:'Server error'}, 500);
  }
}

function toNumberOrNull(v){
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function json(obj, status=200){
  return new Response(JSON.stringify(obj), { status, headers:{ 'Content-Type':'application/json' }});
}
