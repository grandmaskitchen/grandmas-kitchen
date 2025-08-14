// /functions/api/product.js
// GET /api/product?slug=acv001  -> { product: { my_title, image_main, features, advantages, benefits, ... } }

export const onRequestGet = async ({ request, env }) => {
  try {
    const { searchParams } = new URL(request.url);
    const slug = (searchParams.get("slug") || "").trim();
    if (!slug) return json({ error: "Missing slug" }, 400);

    // Only expose approved rows
    const url =
      `${env.SUPABASE_URL}/rest/v1/products` +
      `?product_num=eq.${encodeURIComponent(slug)}` +
      `&approved=is.true` +
      `&select=my_title,image_main,features,advantages,benefits,product_num`;

    const resp = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json"
      }
    });

    const rows = await resp.json();
    if (!resp.ok) {
      return json(
        { error: rows?.message || "Fetch error", details: rows },
        400
      );
    }

    const row = rows?.[0] || null;
    if (!row) return json({ error: "Not found" }, 404);

    return json({ product: row });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });
}
