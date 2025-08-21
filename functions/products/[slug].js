// functions/products/[slug].js
// Dynamic product page: GET /products/:slug

export const onRequestGet = async ({ params, env }) => {
  const slug = (params?.slug || "").trim();
  if (!slug) return notFound("Missing product number");

  const base = env.SUPABASE_URL;
  const key  = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return text(500, "Server not configured");

  // Fetch 1 product by product_num (only approved ones)
  const u = new URL(`${base}/rest/v1/products`);
  u.searchParams.set(
    "select",
    [
      "product_num",
      "my_title",
      "amazon_title",
      "my_description_short",
      "my_description_long",
      "image_main",
      "affiliate_link",
      "amazon_category",
      "approved"
    ].join(","),
  );
  u.searchParams.set("product_num", `eq.${slug}`);
  u.searchParams.set("approved", "eq.true");
  u.searchParams.set("limit", "1");

  const r = await fetch(u.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!r.ok) {
    const err = await r.text();
    return text(500, `Supabase error: ${err}`);
  }

  const rows = await r.json();
  const p = Array.isArray(rows) ? rows[0] : null;
  if (!p) return notFound("Product not found or not approved");

  const title = p.my_title || p.amazon_title || "Product";
  const desc  = p.my_description_short || p.my_description_long || "";
  const img   = p.image_main || "";
  const cat   = p.amazon_category || "";
  const buy   = p.affiliate_link || "";

  // Basic HTML page (uses your site /style.css)
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)} • Grandma’s Kitchen</title>
  <link rel="stylesheet" href="/style.css">
  <meta name="description" content="${esc(desc).slice(0,160)}">
  ${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
</head>
<body>
  <header class="container center">
    <a href="/"><img src="/images/logo.jpg" alt="Grandma’s Kitchen" style="max-height:100px;margin-bottom:1rem;"></a>
    <nav aria-label="Primary">
      <a href="/">Home</a>
      <a href="/about.html">About</a>
      <a href="/recipes.html">Recipes</a>
      <a href="/shop.html">Shop</a>
    </nav>
  </header>

  <main class="container">
    <article class="card" style="max-width:920px;margin:0 auto;">
      ${img ? `<div class="product-image" style="text-align:center;margin-bottom:1rem;">
        <img src="${esc(img)}" alt="${esc(title)}" style="max-width:320px;border-radius:12px">
      </div>` : ""}
      <h1>${esc(title)}</h1>
      ${cat ? `<p class="muted" style="margin:.25rem 0 .75rem">${esc(cat)}</p>` : ""}
      ${desc ? `<p>${esc(desc)}</p>` : ""}

      <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <a class="btn" href="/shop.html">← Back to Pantry</a>
        ${buy ? `<a class="btn" href="${esc(buy)}" rel="nofollow sponsored noopener" target="_blank">Buy on Amazon</a>` : ""}
      </div>
    </article>
  </main>

  <footer class="container container--narrow">
    <p>© 2025 Grandma’s Kitchen • All rights reserved</p>
    <p class="affiliate-note">As an Amazon Associate, we earn from qualifying purchases.</p>
  </footer>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
};

function notFound(msg) {
  return new Response(`Not found: ${msg}`, { status: 404, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}
function text(status, body) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}
function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
