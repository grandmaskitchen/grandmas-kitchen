// /functions/app/home-picks.json.js
// GET /app/home-picks.json
// Returns 6 daily picks straight from approved products (no shop_products needed)

export const onRequestGet = async ({ request, env }) => {
  try {
    const base = env.SUPABASE_URL;
    const key  = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    // Public site URL for links
    const reqUrl = new URL(request.url);
    const site = env.SITE_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    // 1) Pull a pool of approved products
    const sb = new URL(`${base}/rest/v1/products`);
    sb.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "my_description_short",
        "image_main",
        "amazon_category",
        "approved",
        "created_at"
      ].join(",")
    );
    sb.searchParams.set("approved", "eq.true");
    sb.searchParams.set("order", "created_at.desc");
    sb.searchParams.set("limit", "200");

    const r = await fetch(sb.toString(), {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });

    if (!r.ok) {
      const text = await r.text();
      return json({ error: "Supabase fetch failed", details: text }, 500);
    }

    const rows = await r.json();

    // 2) Must have a code + image for the home gallery
    const pool = (rows || []).filter(p => p && p.product_num && p.image_main);

    // 3) Deterministic “shuffle” by day so today is stable
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    pool.sort((a,b) => hash(a.product_num + day) - hash(b.product_num + day));

    // 4) Take 6 and map to homepage shape
    const items = pool.slice(0, 6).map(p => ({
      product_num: p.product_num,
      title: p.my_title || p.amazon_title || "Product",
      blurb: p.my_description_short || "",
      image: p.image_main || "",
      category: p.amazon_category || "",
      url: `${site}/products/${encodeURIComponent(p.product_num)}`
    }));

    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60, s-maxage=60"
      }
    });
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

// small deterministic hash (fast & good enough for shuffling)
function hash(str) {
  let h = 2166136261;               // FNV-1a seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}
