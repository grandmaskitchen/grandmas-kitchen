// POST /api/admin/products/:product_num/archive   { restore?: 1, reason?: "…" }
export const onRequestPost = async ({ params, request, env }) => {
  try {
    const pn = String(params.product_num || '').trim().toLowerCase();
    if (!pn) return json({ error: 'Missing product_num' }, 400, request);

    const { restore, reason } = await safeJSON(request);
    const payload = restore ? { archived_at: null } : { archived_at: new Date().toISOString(), archive_reason: reason || null };

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set('product_num', `eq.${pn}`);
    const r = await fetch(u.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    const out = await r.json();
    if (!r.ok) return json({ error: out?.message || 'Archive failed', details: out }, 400, request);
    const row = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product: row }, 200, request);
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500, request);
  }
};

async function safeJSON(req){ try { return await req.json(); } catch { return {}; } }

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
