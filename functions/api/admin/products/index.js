// /functions/api/admin/products/index.js
// GET /api/admin/products?q=term&archived=0|1|all&limit=NN
// Returns { items:[...] } for workshop search.

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const archived = (url.searchParams.get("archived") || "0").trim(); // 0,1,all
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "amazon_category",
        "image_main",
        "approved",
        "created_at",
        "updated_at",
        "archived_at",
      ].join(",")
    );
    sb.searchParams.set("order", "updated_at.desc,created_at.desc");
    sb.searchParams.set("limit", String(limit));

    if (q) {
      // support direct ASIN/product_num search too
      const token = q.match(/[A-Za-z0-9]{10}/)?.[0] || "";
      if (token) sb.searchParams.set("product_num", `ilike.*${token.toLowerCase()}*`);
      // wide text search
      sb.searchParams.set("or", `my_title.ilike.*${q}*,amazon_title.ilike.*${q}*,amazon_category.ilike.*${q}*`);
    }

    if (archived === "0") sb.searchParams.set("archived_at", "is.null");
    else if (archived === "1") sb.searchParams.set("archived_at", "not.is.null");

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });

    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || "List failed", details: rows }, 400);

    return json({ items: rows || [] });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
