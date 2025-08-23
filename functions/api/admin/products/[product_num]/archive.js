// /functions/api/admin/products/[product_num]/archive.js
// POST /api/admin/products/:product_num/archive   { restore: 1? }
// -> { ok:true, product: {...} }

export const onRequestPost = async ({ params, request, env }) => {
  try {
    const pn = (params?.product_num || "").trim().toLowerCase();
    if (!pn) return json({ error: "product_num required" }, 400, request);

    let body = {};
    try { body = await request.json(); } catch {}
    const restore = !!body?.restore;

    const patch = { archived_at: restore ? null : new Date().toISOString() };

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
      body: JSON.stringify(patch),
    });

    const out = await r.json();
    if (!r.ok) return json({ error: out?.message || "Archive failed", details: out }, 400, request);

    const row = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product: row }, 200, request);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500, request);
  }
};

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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
