// /functions/api/admin/products/[product_num]/archive.js
// POST -> { restore:1 } to clear archived_at (restore)
// POST -> (no restore) to set archived_at = now (archive)

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestPost = async ({ params, request, env }) => {
  try {
    const pn = String(params?.product_num || "").trim().toLowerCase();
    if (!pn) return json({ error: "product_num required" }, 400);

    let restore = false;
    try {
      const body = await request.json();
      restore = !!(body && (body.restore || body.unarchive));
    } catch { /* no body */ }

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("product_num", `eq.${pn}`);

    const r = await fetch(u.toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ archived_at: restore ? null : new Date().toISOString() }),
    });

    const out = await r.json();
    if (!r.ok) return json({ error: out?.message || "Update failed", details: out }, 400);

    const product = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
