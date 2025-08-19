// GET /api/admin/products?approved=true|false|all&search=chia&limit=50&offset=0&order=created_at.desc

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const approved = url.searchParams.get("approved") ?? "all"; // "true"|"false"|"all"
    const search = (url.searchParams.get("search") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    const order = url.searchParams.get("order") || "created_at.desc";

    const qs = new URLSearchParams();
    qs.set("select", "*");
    qs.set("limit", String(Math.max(1, Math.min(limit, 200))));
    if (offset > 0) qs.set("offset", String(offset));

    // order
    if (order) {
      const [col, dir] = order.split(".");
      qs.set("order", `${col}.${dir === "asc" ? "asc" : "desc"}`);
    }

    // filter approved
    if (approved === "true") qs.set("approved", "eq.true");
    if (approved === "false") qs.set("approved", "eq.false");

    // simple OR search across title fields
    if (search) {
      const term = `*${search.replace(/\s+/g, "%")}*`;
      qs.set("or", `(my_title.ilike.${term},amazon_title.ilike.${term})`);
    }

    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${qs.toString()}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact"
      }
    });

    const data = await resp.json();
    const countHdr = resp.headers.get("content-range"); // e.g. "0-9/123"
    const total = countHdr ? Number(countHdr.split("/")[1]) : (Array.isArray(data) ? data.length : 0);

    if (!resp.ok) return json({ error: data?.message || "Fetch failed", details: data }, 400);
    return json({ ok: true, total, products: Array.isArray(data) ? data : [] });
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
