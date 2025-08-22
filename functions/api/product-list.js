/* ---- functions/api/products-list.js ---- */
// /functions/api/products-list.js
// GET /api/products-list
// Unified listing with optional ?approved=true|false and ?q=searchterm&limit=NN
// Always dedupes by product_num (case-insensitive), newest (created_at) wins.

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const approved = (url.searchParams.get("approved") || "").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 0);

    // Build Supabase REST query
    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set("select", "*");
    sb.searchParams.set("order", "created_at.desc");

    // Optional filters
    if (approved === "true") sb.searchParams.set("approved", "eq.true");
    else if (approved === "false") sb.searchParams.set("approved", "eq.false");

    if (q) {
      const term = `*${q}*`;
      sb.searchParams.set(
        "or",
        `my_title.ilike.${term},amazon_title.ilike.${term}`
      );
    }

    if (limit > 0) sb.searchParams.set("limit", String(limit));

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

    // ----- DEDUPE by product_num (case-insensitive) -----
    // We ordered newest first, so the first occurrence wins.
    const seen = new Set();
    const unique = [];
    for (const row of rows || []) {
      const key = (row.product_num || "").toLowerCase();
      if (!key) {
        // keep rows with no product_num (rare / transitional)
        unique.push(row);
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    // ----------------------------------------------------

    return json({ products: unique });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
