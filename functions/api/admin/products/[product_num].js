/* ---- functions/api/admin/products/[product_num].js ---- */
// DELETE /api/admin/products/:product_num
// Permanently removes a product.

export const onRequestDelete = async ({ params, env, request }) => {
  try {
    const pn = (params?.product_num || '').trim();
    if (!pn) return json({ error: 'product_num required' }, 400, request);

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set('product_num', `eq.${pn}`);

    const r = await fetch(u.toString(), {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation,count=exact',
      },
    });

    let payload = null;
    try { payload = await r.json(); } catch { /* may be empty */ }

    if (!r.ok) {
      return json({ error: payload?.message || `Delete failed (${r.status})`, details: payload }, 400, request);
    }

    const deleted = Array.isArray(payload) ? payload.length : (payload ? 1 : 0);
    return json({ ok: true, deleted, product_num: pn }, 200, request);
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
