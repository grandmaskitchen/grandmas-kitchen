/* ---- functions/api/home-picks.js ---- */
// GET /api/home-picks
// Returns today's picks from shop_products for the home page.

export const onRequestGet = async ({ env }) => {
  try {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/shop_products`);
    url.searchParams.set(
      "select",
      ["product_num", "my_title", "amazon_title", "my_description_short", "image_main", "created_at"].join(",")
    );
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", "12");

    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!r.ok) {
      const t = await r.text();
      return json({ error: "Supabase error", details: t }, 500);
    }

    const rows = await r.json();
    return json({ items: rows || [] });
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
