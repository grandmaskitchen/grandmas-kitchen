// POST /api/admin/product-update-category
// body: { product_num: string, shop_category_id: number }

export const onRequestPost = async ({ request, env }) => {
  try {
    const auth = requireAdmin(request, env);
    if (auth instanceof Response) return auth;

    const body = await request.json();
    const product_num = String(body?.product_num || '').trim();
    const shop_category_id = Number(body?.shop_category_id);

    if (!product_num) return json({ error: 'product_num is required' }, 400);
    if (!Number.isFinite(shop_category_id)) {
      return json({ error: 'shop_category_id must be a number' }, 400);
    }

    // PATCH the single row by product_num
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    url.searchParams.set('product_num', `eq.${product_num}`);

    const resp = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ shop_category_id }),
    });

    const out = await resp.json().catch(()=> ({}));
    if (!resp.ok) {
      return json({ error: out?.message || 'Update failed', details: out }, 400);
    }

    const row = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product: row });
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
};

// --- helpers shared with other admin routes ---
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}
function requireAdmin(request, env) {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') ||
                request.headers.get('cf-access-authenticated-user-email');
  if (email) return email;
  const realm = env.WORKSHOP_REALM || 'Workshop Admin';
  const challenge = () => new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }});
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return challenge();
  let d=''; try { d = atob(h.slice(6)); } catch { return challenge(); }
  const [u,p=''] = d.split(':');
  if (u !== env.WORKSHOP_USER || p !== env.WORKSHOP_PASS) return challenge();
  return u;
}
