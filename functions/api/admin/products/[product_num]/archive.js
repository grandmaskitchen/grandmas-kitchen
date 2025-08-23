// /functions/api/admin/products/[product_num]/archive.js
// POST body {}          -> archive now
// POST body {restore:1} -> restore
// Optional body {reason:"..."} stored in archived_reason

export const onRequestOptions = ({ request }) =>
  new Response(null, { status: 204, headers: allow(request, "POST, OPTIONS") });

export const onRequestPost = async ({ params, request, env }) => {
  try {
    const product_num = String(params.product_num || "").trim().toLowerCase();
    if (!product_num) return j(400, { error: "product_num required" }, request);

    let body = {};
    try { body = await request.json(); } catch {}
    const restore = body?.restore ? true : false;
    const reason  = typeof body?.reason === "string" ? body.reason.trim() : null;

    // Patch product: archive or restore
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("product_num", `eq.${product_num}`);

    const patch = restore
      ? { archived_at: null, archived_reason: null }
      : { archived_at: new Date().toISOString(), archived_reason: reason };

    const r = await fetch(u.toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });

    const out = await r.json().catch(() => null);
    if (!r.ok) return j(400, { error: out?.message || "Update failed", details: out }, request);
    const product = Array.isArray(out) ? out[0] : out;

    // Also remove from home_picks (ignore if table missing)
    try {
      const hp = new URL(`${env.SUPABASE_URL}/rest/v1/home_picks`);
      hp.searchParams.set("product_num", `eq.${product_num}`);
      await fetch(hp.toString(), {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
    } catch {}

    return j(200, { ok: true, product, archived: !restore }, request);
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
