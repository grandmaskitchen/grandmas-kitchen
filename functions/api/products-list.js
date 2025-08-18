// /functions/api/products-list.js
// GET /api/products-list  → approved products for the Shop grid

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10), 200);

    const q = `${env.SUPABASE_URL}/rest/v1/products`
      + `?select=product_num,my_title,my_subtitle,my_description_short,image_main,affiliate_link`
      + `&approved=eq.true`
      + `&order=created_at.desc.nullslast`
      + `&limit=${limit}`;

    const r = await fetch(q, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const rows = await r.json();
    if (!r.ok) {
      return json({ error: rows?.message || "Query failed" }, 400, 0);
    }

    return json({ products: rows || [] }, 200, 60); // cache for 60s
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500, 0);
  }
};

function json(obj, status = 200, sMaxAge = 0) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(sMaxAge ? { "Cache-Control": `public, s-maxage=${sMaxAge}` } : {}),
    },
  });
}
