// /functions/api/admin/products/[product_num].js
// DELETE /api/admin/products/:product_num?hard=1   -> permanent delete
// (Tip: use /api/admin/products/:product_num/archive for soft archive/restore)

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestDelete = async ({ params, request, env }) => {
  try {
    const pn = String(params?.product_num || "").trim().toLowerCase();
    if (!pn) return json({ error: "product_num required" }, 400);

    const hard = (new URL(request.url).searchParams.get("hard") || "0") === "1";

    if (!hard) {
      // default to soft archive if hard not requested
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
        body: JSON.stringify({ archived_at: new Date().toISOString() }),
      });
      const out = await r.json();
      if (!r.ok) return json({ error: out?.message || "Archive failed", details: out }, 400);
      return json({ ok: true, product: Array.isArray(out) ? out[0] : out });
    }

    // hard delete
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("product_num", `eq.${pn}`);
    const r = await fetch(u.toString(), {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: "Delete failed", details: t }, 400);
    }
    return json({ ok: true, deleted: pn });
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
