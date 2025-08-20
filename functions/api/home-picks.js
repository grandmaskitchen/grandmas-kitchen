// GET /api/home-picks
// Returns up to 6 most recent picks from shop_products,
// joined with full product details from products.

export const onRequestGet = async ({ env }) => {
  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  // 1) Read up to 6 product_num from picks (newest first)
  const pickUrl = new URL(`${base}/rest/v1/shop_products`);
  pickUrl.searchParams.set("select", "product_num,created_at");
  pickUrl.searchParams.set("order", "created_at.desc");
  pickUrl.searchParams.set("limit", "6");

  const pickRes = await fetch(pickUrl.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!pickRes.ok) {
    const text = await pickRes.text();
    return json({ error: "Failed to read shop_products", details: text }, 500);
  }
  const picks = await pickRes.json();
  if (!picks?.length) return json({ items: [] }); // nothing picked yet

  const nums = [...new Set(picks.map(p => p.product_num).filter(Boolean))];
  if (!nums.length) return json({ items: [] });

  // 2) Fetch full details from products for those product_num
  const list = nums.map(n => `"${String(n).replace(/"/g, '""')}"`).join(",");
  const prodUrl = new URL(`${base}/rest/v1/products`);
  prodUrl.searchParams.set(
    "select",
    "product_num,my_title,amazon_title,my_description_short,image_main,affiliate_link,amazon_category"
  );
  prodUrl.searchParams.set("product_num", `in.(${list})`);

  const prodRes = await fetch(prodUrl.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!prodRes.ok) {
    const text = await prodRes.text();
    return json({ error: "Failed to read products", details: text }, 500);
  }
  const rows = await prodRes.json();

  // Preserve pick order
  const byNum = new Map(rows.map(r => [String(r.product_num).toLowerCase(), r]));
  const ordered = picks
    .map(p => byNum.get(String(p.product_num).toLowerCase()))
    .filter(Boolean);

  // Return both "items" and "products" for compatibility
  return json({ items: ordered, products: ordered });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
