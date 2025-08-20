// POST /api/admin/picks-refresh
// Picks 6 random APPROVED products from public.products and writes
// their product_num into public.shop_products (clears table first).

export const onRequestPost = async ({ env }) => {
  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  // 1) Load a pool of approved products (grab up to 200, newest first)
  const poolUrl = new URL(`${base}/rest/v1/products`);
  poolUrl.searchParams.set(
    "select",
    "product_num,my_title,amazon_title,my_description_short,image_main,affiliate_link,created_at"
  );
  poolUrl.searchParams.set("approved", "eq.true");
  poolUrl.searchParams.set("product_num", "not.is.null");
  poolUrl.searchParams.set("image_main", "not.is.null");
  poolUrl.searchParams.set("order", "created_at.desc");
  poolUrl.searchParams.set("limit", "200");

  const poolRes = await fetch(poolUrl.toString(), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });

  if (!poolRes.ok) {
    const text = await poolRes.text();
    return json({ error: "Failed to load products", details: text }, 500);
  }
  const pool = await poolRes.json();

  if (!pool?.length) {
    // Nothing to pick
    await clearShopProducts(base, key); // still clear stale picks
    return json({ ok: true, inserted: 0, reason: "no approved products" });
  }

  // 2) Sample 6 unique product_num at random
  const seen = new Set();
  const picks = [];
  const N = Math.min(6, pool.length);

  while (picks.length < N) {
    const row = pool[Math.floor(Math.random() * pool.length)];
    const k = (row.product_num || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);

    // We store just the product_num and a timestamp.
    // (We’ll read full details from products when rendering.)
    picks.push({
      product_num: row.product_num,
      created_at: new Date().toISOString(),
    });
  }

  // 3) Clear current picks
  const delOk = await clearShopProducts(base, key);
  if (!delOk.ok) return json(delOk, 500);

  // 4) Insert new picks
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
    return json({ error: "Failed to insert picks", details: out }, 500);
  }

  return json({ ok: true, inserted: out?.length ?? 0 });
};

async function clearShopProducts(base, key) {
  const delRes = await fetch(`${base}/rest/v1/shop_products?id=gt.0`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });
  if (!delRes.ok) {
    const text = await delRes.text();
    return { ok: false, error: "Failed to clear shop_products", details: text };
  }
  return { ok: true };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
