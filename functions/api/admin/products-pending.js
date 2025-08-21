// GET /api/admin/products-pending
// Supports: q, approved(pending|approved|all), category (id),
// addedBy (substring), dateFrom (YYYY-MM-DD), dateTo (YYYY-MM-DD), limit
export const onRequestGet = async ({ request, env }) => {
  try {
    const auth = requireAdmin(request, env);
    if (auth instanceof Response) return auth;

    const url = new URL(request.url);
    const q         = (url.searchParams.get('q') || '').trim();
    const category  = (url.searchParams.get('category') || '').trim();
    const approvedQ = (url.searchParams.get('approved') || 'pending').toLowerCase();
    const addedBy   = (url.searchParams.get('addedBy') || '').trim();
    const dateFrom  = (url.searchParams.get('dateFrom') || '').trim(); // YYYY-MM-DD
    const dateTo    = (url.searchParams.get('dateTo') || '').trim();   // YYYY-MM-DD
    const limit     = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '96', 10)));

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set('select','product_num,my_title,amazon_title,image_main,added_by,approved,created_at,shop_category_id');

    if (approvedQ === 'pending') sb.searchParams.set('approved','eq.false');
    else if (approvedQ === 'approved') sb.searchParams.set('approved','eq.true');

    if (category) sb.searchParams.set('shop_category_id', `eq.${category}`);
    if (addedBy)  sb.searchParams.set('added_by', `ilike.*${addedBy.replace(/\s+/g,'%')}*`);

    if (q) {
      const term = `*${q.replace(/\s+/g,'%')}*`;
      sb.searchParams.set('or', `(my_title.ilike.${term},amazon_title.ilike.${term},product_num.ilike.${term})`);
    }

    // date range via AND
    const andParts = [];
    if (dateFrom) andParts.push(`created_at.gte.${toISOStart(dateFrom)}`);
    if (dateTo)   andParts.push(`created_at.lt.${toISONextDate(dateTo)}`);
    if (andParts.length) sb.searchParams.set('and', `(${andParts.join(',')})`);

    sb.searchParams.set('order','created_at.desc');
    sb.searchParams.set('limit', String(limit));

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    if (!r.ok) {
      const txt = await r.text();
      return json({ error:`Supabase error ${r.status}`, details:txt }, 500);
    }
    const items = await r.json();

    // join category names (optional, for badges)
    let catMap = null;
    try {
      const cr = await fetch(`${env.SUPABASE_URL}/rest/v1/categories?select=id,name`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
      });
      if (cr.ok) {
        const cats = await cr.json();
        catMap = new Map(cats.map(c => [String(c.id), c.name]));
      }
    } catch {}

    const enriched = Array.isArray(items) ? items.map(p => ({
      ...p, category_name: p?.shop_category_id ? (catMap?.get(String(p.shop_category_id)) || null) : null
    })) : [];

    return json({ items: enriched }, 200, { 'Cache-Control':'no-store' });
  } catch (e) {
    return json({ error: e?.message || 'Server error' }, 500);
  }
};

// helpers
function toISOStart(yyyy_mm_dd) {
  // treat as UTC midnight
  return `${yyyy_mm_dd}T00:00:00Z`;
}
function toISONextDate(yyyy_mm_dd) {
  const d = new Date(`${yyyy_mm_dd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,19)+'Z';
}
function json(obj, status=200, extra={}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type':'application/json', ...extra }
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
