// GET /api/admin/categories -> { items:[{id,name,slug}] }
export const onRequestGet = async ({ env }) => {
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/shop_categories`);
    url.searchParams.set('select', 'id,name,slug');
    url.searchParams.set('order', 'name.asc');

    const r = await fetch(url.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json();
    if (!r.ok) return json({ error: 'Failed to list categories', details: rows }, 500);
    return json({ items: rows });
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
