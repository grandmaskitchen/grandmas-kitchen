/* ---- functions/api/shop-list.js ---- */
export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const cat = (url.searchParams.get('cat') || '').trim();  // category slug
    const limit = Number(url.searchParams.get('limit') || 100);

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set(
      'select',
      [
        'product_num','my_title','amazon_title','my_description_short',
        'image_main','affiliate_link','approved','created_at',
        'shop_categories:shop_category_id(id,name,slug)' // <-- include category
      ].join(',')
    );
    sb.searchParams.set('approved', 'eq.true');
    sb.searchParams.set('order', 'created_at.desc');
    if (limit > 0) sb.searchParams.set('limit', String(limit));

    // If a category slug is provided, filter by it
    if (cat) sb.searchParams.set('shop_categories.slug', `eq.${cat}`);

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    const rows = await r.json();
    if (!r.ok) return json({ error: `Supabase error ${r.status}`, details: rows }, 500);

    // Dedupe by product_num (newest wins)
    const seen = new Set();
    const unique = [];
    for (const row of rows || []) {
      const key = (row.product_num || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    return json({ items: unique, products: unique, count: unique.length }, 200, {
      'Cache-Control': 'public, max-age=60'
    });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500);
  }
};
// /functions/api/shop-list.js
// GET /api/shop-list?limit=100&cat=Films
export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 200);
    const cat = (url.searchParams.get("cat") || "").trim();

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("select",
      "product_num,my_title,image_main,amazon_title,amazon_category,shop_category_id"
    );
    u.searchParams.set("approved", "eq.true");
    u.searchParams.set("archived_at", "is.null");            // hide archived
    if (cat) u.searchParams.set("amazon_category", `eq.${cat}`);
    u.searchParams.set("order", "updated_at.desc");
    u.searchParams.set("limit", String(limit));

    const r = await fetch(u.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || "List failed" }, 400);
    return json({ items: rows || [] });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

