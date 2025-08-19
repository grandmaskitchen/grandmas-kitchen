// POST /api/admin/product-delete  { id?:number, product_num?:string }
// Returns { ok:true, deleted:n }

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

export const onRequestPost = async ({ request, env }) => {
  try {
    const { id, product_num } = await request.json() || {};
    if (!id && !product_num) return json({ error: "id or product_num required" }, 400);

    const qs = new URLSearchParams();
    if (id) qs.set("id", `eq.${id}`);
    if (product_num) qs.set("product_num", `eq.${product_num}`);

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${qs.toString()}`, {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    if (!resp.ok) {
      const out = await resp.text();
      return json({ error: "Delete failed", details: out }, 400);
    }

    // Supabase REST doesn't return count here; we can assume 1 if filter was unique.
    return json({ ok: true, deleted: 1 });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
