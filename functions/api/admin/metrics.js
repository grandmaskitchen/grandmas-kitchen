export const onRequestGet = async ({ env }) => {
  try {
    const total = await countRows(env, '');
    const approved = await countRows(env, 'approved=eq.true');
    const pending = total - approved;

    // Last 7 / 30 days by created_at
    const now = new Date();
    const d7  = new Date(now.getTime() - 7 * 864e5).toISOString();
    const d30 = new Date(now.getTime() - 30 * 864e5).toISOString();

    const last7  = await countRows(env, `created_at=gte.${d7}`);
    const last30 = await countRows(env, `created_at=gte.${d30}`);

    // Category breakdown
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=amazon_category&limit=10000`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      }
    });
    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || 'Failed metrics' }, 400);

    const map = new Map();
    rows.forEach(x => {
      const k = (x.amazon_category || 'Uncategorised');
      map.set(k, (map.get(k) || 0) + 1);
    });
    const byCategory = [...map.entries()].map(([amazon_category, count]) => ({ amazon_category, count }));

    return json({ totals: { total, approved, pending }, added: { last7, last30 }, byCategory });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};

async function countRows(env, filterQuery) {
  const qs = filterQuery ? `?select=id&${filterQuery}` : '?select=id';
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products${qs}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact'
    }
  });
  const cr = r.headers.get('Content-Range') || '';
  const m = cr.match(/\/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

function json(obj, status=200){ return new Response(JSON.stringify(obj), {status, headers:{'Content-Type':'application/json'}}); }
