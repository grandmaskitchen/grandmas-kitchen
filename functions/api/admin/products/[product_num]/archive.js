/* ---- functions/api/admin/products/[product_num]/archive.js ---- */
// POST /api/admin/products/:product_num/archive
// Body: { restore: 1 } to un-archive, otherwise archives now.

export const onRequestPost = async ({ params, request, env }) => {
  try {
    const pn = (params?.product_num || '').trim();
    if (!pn) return json({ error: 'product_num required' }, 400, request);

    let body = {};
    try { body = await request.json(); } catch {}

    const restoring = !!body?.restore;

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set('product_num', `eq.${pn}`);

    const patch = {
      archived_at: restoring ? null : new Date().toISOString(),
    };

    const r = await fetch(u.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    });

    const rows = await r.json();
    if (!r.ok) {
      return json({ error: rows?.message || `Archive failed (${r.status})`, details: rows }, 400, request);
    }

    const item = Array.isArray(rows) ? rows[0] : rows;
    return json({ ok: true, product: item, action: restoring ? 'restored' : 'archived' }, 200, request);
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
