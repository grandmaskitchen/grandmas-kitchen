// POST /api/admin/home-picks-refresh
// Clears shop_products, inserts 6 random approved products that HAVE product_num.
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

    // 1) get up to 200 approved products (only fields we need)
    const url = new URL(`${base}/rest/v1/products`);
    url.searchParams.set("select", "product_num,approved,created_at");
    url.searchParams.set("approved", "eq.true");
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "200");

    const listRes = await fetch(url.toString(), {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!listRes.ok) {
      const txt = await listRes.text();
      return json({ error: "Fetch approved failed", details: txt }, 500);
    }

    // 2) keep only rows with a non-empty product_num
    const all = await listRes.json();
    const eligible = (all || []).filter(
      r => r?.product_num && String(r.product_num).trim() !== ""
    );
    if (!eligible.length) {
      return json({ ok: false, inserted: 0, note: "No eligible products (missing product_num)" });
    }

    // 3) shuffle & pick 6 -> we only insert { product_num }
    const picks = [...eligible]
      .sort(() => Math.random() - 0.5)
      .slice(0, 6)
      .map(r => ({ product_num: r.product_num }));

    // 4) wipe shop_products
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

    // 5) insert only the guaranteed column
    const insRes = await fetch(`${base}/rest/v1/shop_products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(picks),
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
