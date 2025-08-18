// POST /api/admin/product-upsert
// Body: at least { product_num }, any other columns to update

export const onRequestPost = async ({ request, env }) => {
  try {
    const row = await request.json();
    if (!row || !row.product_num) {
      return json({ error: 'product_num is required' }, 400);
    }
    // Upsert by product_num (merge fields)
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?on_conflict=product_num`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify([row])
    });
    const out = await r.json();
    if (!r.ok) return json({ error: out?.message || 'Upsert failed' }, 400);
    return json({ ok: true, product: out?.[0] || null }, 200);
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};

function json(obj, status=200){ return new Response(JSON.stringify(obj), {status, headers:{'Content-Type':'application/json'}}); }
