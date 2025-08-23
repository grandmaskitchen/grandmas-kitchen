// /functions/api/admin/products/[product_num].js
// DELETE /api/admin/products/:product_num  -> { ok:true }

export const onRequestDelete = async ({ params, env, request }) => {
  try {
    const pn = (params?.product_num || "").trim().toLowerCase();
    if (!pn) return json({ error: "product_num required" }, 400, request);

    // Best-effort: remove from shop_products first
    try {
      const sp = new URL(`${env.SUPABASE_URL}/rest/v1/shop_products`);
      sp.searchParams.set("product_num", `eq.${pn}`);
      await fetch(sp.toString(), {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
      });
    } catch (_) {}

    // Then delete from products
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("product_num", `eq.${pn}`);

    const r = await fetch(u.toString(), {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });

    if (!r.ok) {
      const t = await r.text();
      return json({ error: "Delete failed", details: t }, 400, request);
    }

    return json({ ok: true, product_num: pn }, 200, request);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500, request);
  }
};

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "DELETE, OPTIONS",
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
