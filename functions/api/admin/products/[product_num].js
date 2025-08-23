// DELETE /api/admin/products/:product_num?hard=1
// hard=1 -> permanent delete; otherwise soft archive (same as /archive)
export const onRequestDelete = async ({ params, request, env }) => {
  try {
    const pn = String(params.product_num || '').trim().toLowerCase();
    if (!pn) return json({ error: 'Missing product_num' }, 400, request);

    const hard = new URL(request.url).searchParams.get('hard') === '1';

    if (!hard) {
      // soft archive
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
        body: JSON.stringify({ archived_at: new Date().toISOString(), archive_reason: 'workshop delete' }),
      });
      const out = await r.json();
      if (!r.ok) return json({ error: out?.message || 'Archive failed', details: out }, 400, request);
      return json({ ok: true, archived: true }, 200, request);
    }

    // hard delete
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set('product_num', `eq.${pn}`);
    const r = await fetch(u.toString(), {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
    });
    if (!r.ok) {
      const text = await r.text();
      return json({ error: 'Delete failed', details: text }, 400, request);
    }
    return json({ ok: true, deleted: true }, 200, request);
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
