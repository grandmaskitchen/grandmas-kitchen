// GET /api/admin/categories -> [{ id, name, slug }]
export const onRequestGet = async ({ env }) => {
  const base = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return json({ error: 'Missing Supabase env' }, 500);

  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set('select', 'id,name,slug');
  url.searchParams.set('order', 'name.asc');

  const r = await fetch(url.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const out = await r.json();
  if (!r.ok) return json({ error: 'Fetch categories failed', details: out }, 500);
  return json(out);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
