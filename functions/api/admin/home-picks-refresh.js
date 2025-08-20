// /functions/api/admin/home-picks-refresh.js
// POST -> clears shop_products, inserts 6 random from approved products
export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export const onRequestPost = async ({ env }) => {
  try {
    // 1) Fetch up to 200 approved products
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=product_num,my_title,amazon_title,my_description_short,image_main,affiliate_link,approved&approved=eq.true&order=created_at.desc&limit=200`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) {
      const txt = await r.text();
      return json({ error: 'Fetch approved failed', details: txt }, 500);
    }
    const rows = await r.json();

    // 2) Shuffle & pick 6
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    const pick = shuffled.slice(0, 6).map(x => ({
      product_num: x.product_num,
      my_title: x.my_title,
      amazon_title: x.amazon_title,
      my_description_short: x.my_description_short,
      image_main: x.image_main,
      affiliate_link: x.affiliate_link,
    }));

    // 3) Clear shop_products
    await fetch(`${env.SUPABASE_URL}/rest/v1/shop_products?select=id`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=minimal',
      },
    });

    // 4) Insert picks
    const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/shop_products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(pick),
    });
    const out = await ins.json();
    if (!ins.ok) return json({ error: out?.message || 'Insert picks failed', details: out }, 500);

    return json({ ok: true, inserted: Array.isArray(out) ? out.length : 0 });
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
