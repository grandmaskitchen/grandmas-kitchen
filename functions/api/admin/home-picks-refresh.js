// POST /api/admin/home-picks-refresh
// Clears shop_products and inserts 6 random *approved* products (by product_num).

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
    if (!base || !key) return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);

    // 1) Fetch up to 200 approved products that HAVE a product_num
    const approvedUrl =
      `${base}/rest/v1/products?` +
      [
        "select=product_num",
        "approved=eq.true",
        "product_num=not.is.null",
        "order=created_at.desc",
        "limit=200",
      ].join("&");

    const r = await fetch(approvedUrl, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return json({ error: "Fetch approved failed", details: await r.text() }, 500);

    const rows = (await r.json()) || [];
    const pool = [...new Set(rows.map(x => String(x.product_num || "").trim()).filter(Boolean))];
    if (!pool.length) {
      // nothing to pick from
      await clearShop(base, key);
      return json({ ok: true, inserted: 0 });
    }

    // 2) sample 6 unique product_num
    const chosen = sample(pool, 6).map(num => ({
      product_num: num,
      // include created_at to avoid NOT NULL issues on some schemas
      created_at: new Date().toISOString(),
    }));

    // 3) wipe table and insert picks
    await clearShop(base, key);

    if (!chosen.length) return json({ ok: true, inserted: 0 });

    const ins = await fetch(`${base}/rest/v1/shop_products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(chosen),
    });

    let out = null;
    try { out = await ins.json(); } catch { /* ignore non-JSON */ }

    if (!ins.ok) return json({ error: "Failed to insert picks", details: out }, 500);

    return json({ ok: true, inserted: Array.isArray(out) ? out.length : 0 });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

async function clearShop(base, key) {
  await fetch(`${base}/rest/v1/shop_products`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=minimal",
    },
  });
}

// Fisher–Yates unique sample
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}
