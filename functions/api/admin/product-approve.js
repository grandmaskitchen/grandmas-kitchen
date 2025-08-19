// functions/api/admin/product-approve.js
// POST /api/admin/product-approve  { id, approved }  -> toggles approved flag

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const id = Number(body?.id);
  const approved =
    body?.approved === true ||
    body?.approved === "true" ||
    body?.approved === 1;

  if (!Number.isFinite(id)) return json({ error: "id (number) is required" }, 400);

  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ approved }),
    });

    const text = await resp.text();
    let out = null;
    try { out = text ? JSON.parse(text) : null; } catch { out = { raw: text }; }

    if (!resp.ok) {
      return json({ error: out?.message || "Update failed", details: out }, 400);
    }

    const row = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product: row }, 200);
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
