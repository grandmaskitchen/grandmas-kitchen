// POST /api/admin/home-picks-refresh
// Clears shop_products, inserts 6 random from approved products.
export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

export const onRequestPost = async ({ env }) => {
  try {
    const base = env.SUPABASE_URL;
    const key  = env.SUPABASE_SERVICE_ROLE_KEY;

    // 1) Fetch up to 200 approved products that HAVE a product_num
    const url = new URL(`${base}/rest/v1/products`);
    url.searchParams.set(
      "select",
      "product_num,approved,created_at"
    );
    url.searchParams.set("approved", "eq.true");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "200");
    // keep only rows with a non-null/non-empty product_num after fetch
    const listRes = await fetch(url.toString(), {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!listRes.ok) {
      const txt = await listRes.text();
      return json({ error: "Fetch approved failed", details: txt }, 500);
    }
    const rows = (await listRes.json()).filter(
      r => r.product_num && String(r.product_num).trim() !== ""
    );
    if (!rows.length) return json({ ok: false, inserted: 0, note: "No eligible products" });

    // 2) Shuffle & take 6
    const pickNums = [...rows]
      .sort(() => Math.random() - 0.5)
      .slice(0, 6)
      .map(r => ({ product_num: r.product_num }));

    // 3) Clear shop_products
    const delRes = await fetch(`${base}/rest/v1/shop_products`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
    });
    if (!delRes.ok) {
      const txt = await delRes.text();
      return json({ error: "Failed to clear shop_products", details: txt }, 500);
    }

    // 4) Insert only { product_num }
    const insRes = await fetch(`${base}/rest/v1/shop_products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(pickNums),
    });
    const out = await insRes.json();
    if (!insRes.ok) {
      return json({ error: out?.message || "Failed to insert picks", details: out }, 500);
    }

    return json({ ok: true, inserted: Array.isArray(out) ? out.length : 0 });
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
