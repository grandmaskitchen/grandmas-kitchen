// GET /api/shop-list
// Public Pantry list: approved products only, newest first.
// Supports search (?q=) and category filter (?cat=).
// Dedupe by product_num (case-insensitive), newest wins.

export const onRequestGet = async ({ request, env }) => {
  try {
    const url   = new URL(request.url);
    const q     = (url.searchParams.get("q")   || "").trim();
    const cat   = (url.searchParams.get("cat") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 100);

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "my_description_short",
        "image_main",
        "affiliate_link",
        "amazon_category",
        "approved",
        "created_at",
      ].join(",")
    );
    sb.searchParams.set("approved", "eq.true");
    sb.searchParams.set("order", "created_at.desc");
    if (limit > 0) sb.searchParams.set("limit", String(limit));

    // Text search across title + category
    if (q) {
      const term = `*${q}*`;
      sb.searchParams.set("or", `(my_title.ilike.${term},amazon_title.ilike.${term},amazon_category.ilike.${term})`);
    }

    // Category filter (case-insensitive contains)
    if (cat) {
      sb.searchParams.set("amazon_category", `ilike.*${cat}*`);
    }

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });

    if (!r.ok) {
      const text = await r.text();
      return json({ error: `Supabase error ${r.status}`, details: text }, 500);
    }

    const rows = await r.json();

    // DEDUPE by product_num (case-insensitive), newest wins
    const seen = new Set();
    const unique = [];
    for (const row of rows || []) {
      const key = (row.product_num || "").toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    return json(
      { items: unique, products: unique, count: unique.length },
      200,
      { "Cache-Control": "public, max-age=60" }
    );
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
