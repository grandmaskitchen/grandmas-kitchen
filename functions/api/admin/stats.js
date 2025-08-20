// /functions/api/admin/stats.js
export const onRequestGet = async ({ env }) => {
  const envOk = Boolean(env.SUPABASE_URL) && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

  async function count(table) {
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=id`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
      });
      const cr = r.headers.get('content-range') || '0/0';
      const total = parseInt(cr.split('/')[1] || '0', 10);
      return { ok: r.ok, count: total, status: r.status };
    } catch (e) {
      return { ok: false, count: 0, status: 0, error: e?.message };
    }
  }

  const [p, s] = await Promise.all([count('products'), count('shop_products')]);
  return json({ envOk, products: p, shop_products: s });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
