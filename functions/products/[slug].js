// /functions/products/[slug].js
// Dynamic product page (HTML). Route: /products/:slug

export const onRequestGet = async ({ params, env }) => {
  const slug = String(params?.slug || "").toLowerCase().trim();
  if (!slug) return html(404, "<p>Missing product number.</p>");

  // Fetch the matching product by product_num
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
  url.searchParams.set("select",
    [
      "product_num",
      "my_title",
      "amazon_title",
      "my_description_short",
      "my_description_long",
      "image_main",
      "affiliate_link",
      "approved",
      "amazon_category",
      "created_at"
    ].join(",")
  );
  url.searchParams.set("product_num", `eq.${slug}`);
  url.searchParams.set("limit", "1");

  const r = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!r.ok) {
    const text = await r.text();
    return html(500, `<p>Supabase error ${r.status}</p><pre>${esc(text)}</pre>`);
  }

  const rows = await r.json();
  const p = rows?.[0];
  if (!p) return html(404, `<p>Product not found: <code>${esc(slug)}</code></p>`);

  const title = p.my_title || p.amazon_title || "Product";
  const img   = p.image_main || "";
  const blurb = p.my_description_short || "";
  const long  = p.my_description_long || "";
  const buy   = p.affiliate_link || "";

  // Render page
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)} • Grandma’s Kitchen</title>
  <link rel="stylesheet" href="/style.css"/>
  <style>
    /* Product-page-only softening */
    body.page-product h1 {
      font-size: clamp(28px, 4.4vw, 44px);
      font-weight: 700;        /* a bit lighter than ultra-bold */
      line-height: 1.2;
      letter-spacing: -0.01em;
      max-width: 22ch;
      margin-inline: auto;
      text-align: center;
    }
    body.page-product .lead { font-size: 1rem; color:#444; }
    body.page-product .hero { text-align:center; margin-bottom:1rem; }
    body.page-product .hero img{ max-width:280px; height:auto; border-radius:12px; }
    body.page-product .actions { display:flex; gap:.5rem; justify-content:center; margin:1rem 0;}
    /* Slightly bigger logo & nav for the whole site feel */
    header .brand img{ max-height:110px; }
    header nav a{ font-size:1.05rem; }
    /* Content card look */
    .card{ background:#fff; padding:18px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.06); }
    .container-narrow{ max-width:860px; margin:0 auto; padding:0 16px; }
  </style>
</head>
<body class="page-product">
  <header class="container center">
    <a class="brand" href="/index.html">
      <img src="/images/logo.jpg" alt="Grandma’s Kitchen Logo">
    </a>
    <nav aria-label="Primary">
      <a href="/index.html">Home</a>
      <a href="/about.html">About</a>
      <a href="/recipes.html">Recipes</a>
      <a href="/shop.html">Shop</a>
    </nav>
    <p class="lead">Staples we actually use at home—simple, honest ingredients.</p>
  </header>

  <main class="container-narrow">
    <section class="card">
      <div class="hero">
        ${img ? `<img src="${esc(img)}" alt="${esc(title)}">` : ""}
      </div>
      <h1>${esc(title)}</h1>
      ${blurb ? `<p class="lead" style="text-align:center;max-width:60ch;margin:0 auto;">${esc(blurb)}</p>` : ""}

      <div class="actions">
        <a class="btn secondary" href="/shop.html">← Back to Pantry</a>
        ${buy ? `<a class="btn" href="${esc(buy)}" rel="nofollow noopener sponsored" target="_blank">Buy on Amazon</a>` : ""}
      </div>

      ${long ? `<hr><p>${esc(long)}</p>` : ""}
    </section>
  </main>

  <footer class="container container--narrow">
    <p>© 2025 Grandma’s Kitchen • All rights reserved</p>
    <p class="affiliate-note">As an Amazon Associate, we (Grandma's Kitchen) earn from qualifying purchases.</p>
  </footer>
</body>
</html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

// helpers
function html(status, body) {
  return new Response(`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><main class="container container--narrow"><div class="card"><h1>Status ${status}</h1>${body}</div></main>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
