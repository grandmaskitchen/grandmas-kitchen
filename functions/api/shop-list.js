// GET /api/shop-list
// Public Pantry list: approved products only, newest first.
// Optional filter: ?category=<slug>
// Dedupe by product_num (case-insensitive), newest wins.

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 100);
    const catSlug = (url.searchParams.get("category") || "").trim();

    const base = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) return json({ error: "Missing Supabase env" }, 500);

    const sb = new URL(`${base}/rest/v1/products`);
    // When filtering by category slug, use INNER join so only matching rows return
    const catSelect = catSlug ? "category:categories!inner(name,slug)" : "category:categories(name,slug)";

    sb.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "my_description_short",
        "image_main",
        "affiliate_link",
        "approved",
        "created_at",
        catSelect
      ].join(",")
    );

    sb.searchParams.set("approved", "eq.true");
    sb.searchParams.set("order", "created_at.desc");
    if (limit > 0) sb.searchParams.set("limit", String(limit));

    if (catSlug) {
      // filter through the embedded relation
      sb.searchParams.set("categories.slug", `eq.${catSlug}`);
    }

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
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
      const keyNum = (row.product_num || "").toLowerCase();
      if (!keyNum) continue;
      if (seen.has(keyNum)) continue;
      seen.add(keyNum);
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
