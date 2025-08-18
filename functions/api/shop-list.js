// GET /api/shop-list  -> { items: [{slug,title,blurb,image,href}] }

export const onRequestGet = async ({ env }) => {
  const url =
    `${env.SUPABASE_URL}/rest/v1/products` +
    `?approved=eq.true` +
    `&select=product_num,affiliate_link,created_at,product_content(my_title,my_description_short,image_small,image_main)` +
    `&order=created_at.desc`;

  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const rows = await r.json();
  if (!r.ok) {
    return json({ error: rows?.message || 'Failed to fetch list', details: rows }, 400);
  }

  // shape for cards
  const items = (rows || [])
    .map(row => {
      const c = row.product_content || {};
      const title = c.my_title || '';
      const image = c.image_small || c.image_main || '';
      const blurb = c.my_description_short || '';
      const slug  = row.product_num;
      return (title && image && slug)
        ? { slug, title, blurb, image, href: `/products/${slug}` }
        : null;
    })
    .filter(Boolean);

  // small cache for CDN
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=120' // 2 minutes at edge
    }
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}
