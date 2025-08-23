// /functions/api/admin/products.js
// GET /api/admin/products?state=active|archived|all&q=teeth&limit=50
// Returns: { items: [...] }

export const onRequestGet = async ({ request, env }) => {
  try {
    const url   = new URL(request.url);
    const q     = (url.searchParams.get("q") || "").trim();
    const state = (url.searchParams.get("state") || "active").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "amazon_category",
        "image_main",
        "updated_at",
        "archived_at",
      ].join(",")
    );
    u.searchParams.set("order", "updated_at.desc,created_at.desc");
    u.searchParams.set("limit", String(limit));

    // Active/Archived/All
    if (state === "active") u.searchParams.set("archived_at", "is.null");
    else if (state === "archived") u.searchParams.set("archived_at", "not.is.null");

    if (q) {
      const term = `*${q}*`;
      u.searchParams.set(
        "or",
        [
          `my_title.ilike.${term}`,
          `amazon_title.ilike.${term}`,
          `product_num.ilike.${term}`,
          `amazon_category.ilike.${term}`,
        ].join(",")
      );
    }

    const r = await fetch(u.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });
    const rows = await r.json();
    if (!r.ok) return json({ error: rows?.message || "Supabase error", details: rows }, 500, request);

    return json({ items: Array.isArray(rows) ? rows : [] }, 200, request);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500, request);
  }
};

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

function json(obj, status = 200, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": request?.headers?.get?.("Origin") || "*",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
