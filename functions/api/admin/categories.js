// /functions/api/admin/categories-list.js
// GET -> { items: [{id, name, slug}, ...] }

export const onRequestGet = async ({ env }) => {
  try {
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
    u.searchParams.set('select', 'id,name,slug');
    u.searchParams.set('order', 'name.asc');

    const r = await fetch(u.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return json({ error: 'Supabase error', details: text }, 500);
    }
    const rows = await r.json();
    return json({ items: rows || [] });
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
