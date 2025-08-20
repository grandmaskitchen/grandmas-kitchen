// POST /api/admin/home-picks-refresh
// Replace today's picks in shop_products with 6 random approved products.
// Safe against NULLs and sparse datasets.

export const onRequestPost = async ({ env }) => {
  try {
    // 1) fetch a pool of approved products (filter out rows that would violate NOT NULLs)
    const poolUrl = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    poolUrl.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "my_description_short",
        "image_main",
        "approved",
        "created_at",
      ].join(",")
    );
    poolUrl.searchParams.set("approved", "eq.true");
    // require product_num and image_main (avoid 23502: null value)
    poolUrl.searchParams.set("product_num", "not.is.null");
    poolUrl.searchParams.set("image_main", "not.is.null");
    // pull a decent pool, we’ll randomize in JS
    poolUrl.searchParams.set("limit", "100");

    const poolRes = await fetch(poolUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });

    if (!poolRes.ok) {
      const t = await poolRes.text();
      return json({ error: "Failed to fetch products", details: t }, 500);
    }

    const pool = await poolRes.json();

    if (!Array.isArray(pool) || pool.length === 0) {
      return json({ error: "No eligible products found" }, 400);
    }

    // 2) randomize and take 6
    shuffle(pool);
    const picks = pool.slice(0, Math.min(6, pool.length));

    // 3) wipe current shop_products (delete all rows)
    const delUrl = new URL(`${env.SUPABASE_URL}/rest/v1/shop_products`);
    // PostgREST requires a filter for DELETE; this matches all rows
    delUrl.searchParams.set("product_num", "not.is.null");

    const delRes = await fetch(delUrl, {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    });
    if (!delRes.ok) {
      const t = await delRes.text();
      return json({ error: "Failed to clear old picks", details: t }, 500);
    }

    // 4) insert new picks (only columns the table has)
    const rows = picks.map(p => ({
      product_num: p.product_num,
      my_title: p.my_title ?? null,
      amazon_title: p.amazon_title ?? null,
      my_description_short: p.my_description_short ?? null,
      image_main: p.image_main ?? null,
      // created_at will default to now() if you set a default in schema
    }));

    const insUrl = new URL(`${env.SUPABASE_URL}/rest/v1/shop_products`);
    const insRes = await fetch(insUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(rows),
    });

    const out = await insRes.json().catch(() => null);
    if (!insRes.ok) {
      return json({ error: "Failed to insert picks", details: out }, 500);
    }

    return json({ ok: true, inserted: Array.isArray(out) ? out.length : picks.length });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
