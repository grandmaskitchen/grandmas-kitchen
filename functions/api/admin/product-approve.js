// POST /api/admin/product-approve  { id?:number, product_num?:string, approved?:boolean }
// Defaults to approved=true. Returns updated row(s).

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
<td>
  <label>
    <input
      type="checkbox"
      class="appr"
      data-id="${p.id}"
      ${p.approved ? "checked" : ""}
      aria-label="Approve ${p.my_title || p.amazon_title || ''}">
  </label>
  <span class="muted status" data-id="${p.id}">
    ${p.approved ? "Approved" : "Pending"}
  </span>
</td>

export const onRequestPost = async ({ request, env }) => {
  try {
    const { id, product_num, approved = true } = await request.json() || {};
    if (!id && !product_num) return json({ error: "id or product_num required" }, 400);

    const qs = new URLSearchParams();
    if (id) qs.set("id", `eq.${id}`);
    if (product_num) qs.set("product_num", `eq.${product_num}`);

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${qs.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify({ approved: !!approved })
    });

    const out = await resp.json();
    if (!resp.ok) return json({ error: out?.message || "Approve failed", details: out }, 400);
    return json({ ok: true, updated: out });
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
