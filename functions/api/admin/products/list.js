// /functions/api/admin/products/list.js
// GET /api/admin/products/list?archived=1&limit=100&q=chair
export const onRequestOptions = ({ request }) =>
  new Response(null, { status: 204, headers: allow(request, "GET, OPTIONS") });

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 500);
    const archived = url.searchParams.get("archived") === "1";
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("select",
      "product_num,my_title,image_main,amazon_title,amazon_category,shop_category_id,archived_at,created_at,updated_at"
    );
    if (archived) {
      u.searchParams.set("archived_at", "not.is.null");
    } else {
      u.searchParams.set("archived_at", "is.null");
    }
    u.searchParams.set("order", "updated_at.desc");
    u.searchParams.set("limit", String(limit));

    // server-side "search" when q present
    if (q) {
      // ilike on my_title OR amazon_title
      u.searchParams.set("or", `(my_title.ilike.*${q}*,amazon_title.ilike.*${q}*)`);
    }

    const r = await fetch(u.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    const rows = await r.json();
    if (!r.ok) return j(400, { error: rows?.message || "List failed", details: rows }, request);

    return j(200, { items: rows || [] }, request);
  } catch (e) {
    return j(500, { error: e?.message || "Server error" }, request);
  }
};

function allow(req, methods) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("Origin") || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    "Cache-Control": "no-store"
  };
}
function j(status, body, req) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...allow(req, "*"), "Content-Type": "application/json" }
  });
}
