// /functions/products/[slug].js
// Product detail page: /products/:slug
// No npm deps. Cloudflare Pages Functions.

export const onRequestGet = async ({ params, request, env }) => {
  const slug = (params?.slug || "").trim();

  // Basic guards
  if (!slug) return html(404, pageShell("Not found", "<p>Missing product code.</p>"));
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return html(500, pageShell("Server error", "<p>Supabase env vars are missing.</p>"));
  }

  // Fetch the product by product_num
  const api = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
  api.searchParams.set(
    "select",
    [
      "product_num",
      "my_title",
      "amazon_title",
      "my_description_short",
      "my_description_long",
      "image_main",
      "affiliate_link",
      "approved",
      "created_at"
    ].join(",")
  );
  // We store product_num lowercase; use exact match first
  api.searchParams.set("product_num", `eq.${slug}`);

  const r = await fetch(api.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!r.ok) {
    const text = await r.text();
    return html(500, pageShell("Server error", `<pre>${escapeHtml(text)}</pre>`));
  }

  let rows = await r.json();
  // If not found and slug looks mixed-case, try lowercase
  if ((!rows || !rows.length) && slug !== slug.toLowerCase()) {
    api.searchParams.set("product_num", `eq.${slug.toLowerCase()}`);
    const r2 = await fetch(api.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    rows = r2.ok ? await r2.json() : [];
  }

  const p = Array.isArray(rows) ? rows[0] : null;
  if (!p) {
    return html(404, pageShell("Not found", "<p>Sorry, we couldn't find that product.</p>"));
  }

  // Build page pieces
  const title = escapeHtml(p.my_title || p.amazon_title || "Product");
  const img = p.image_main ? `<img src="${escapeHtml(p.image_main)}" alt="${title}">` : "";
  const blurb = escapeHtml(p.my_description_short || "");
  const longDesc = escapeHtml(p.my_description_long || "");

  // Primary buttons
  const backBtn = `<a class="btn btn-block" href="/shop.html">⟵ Back to Pantry</a>`;
  const buyBtn = p.affiliate_link
    ? `<a class="btn btn-accent btn-block" href="${escapeHtml(
        p.affiliate_link
      )}" target="_blank" rel="nofollow sponsored noopener">Buy on Amazon</a>`
    : "";

  // Main content
  const body = `
  <header class="container center">
    <a href="/index.html">
      <img class="site-logo" src="/images/logo.jpg" alt="Grandma’s Kitchen Logo">
    </a>
    <nav aria-label="Primary">
      <a href="/index.html">Home</a>
      <a href="/about.html">About</a>
      <a href="/recipes.html">Recipes</a>
      <a href="/shop.html">Shop</a>
    </nav>
    <p class="lead">Staples we actually use at home—simple, honest ingredients.</p>
  </header>

  <main>
    <div class="container container--narrow">
      <article class="card product-detail">
        ${img ? `<div class="product-image" style="max-width:360px">${img}</div>` : ""}
        <h1 class="product-title--detail">${title}</h1>
        ${blurb ? `<p>${blurb}</p>` : ""}
        ${longDesc ? `<p>${longDesc}</p>` : ""}

        <div class="actions">
          ${backBtn}
          ${buyBtn}
        </div>
      </article>
    </div>
  </main>

  <footer class="container container--narrow">
    <p>© 2025 Grandma’s Kitchen • All rights reserved</p>
    <p class="affiliate-note">As an Amazon Associate, we (Grandma's Kitchen) earn from qualifying purchases.</p>
  </footer>
  `;

  // Meta / head bits
  const reqUrl = new URL(request.url);
  const canonical = `${reqUrl.origin}/products/${encodeURIComponent(p.product_num)}`;
  const ogImage = p.image_main || "/images/logo.jpg";

  return html(
    200,
    pageShell(
      title,
      body,
      {
        canonical,
        og: {
          title,
          description: blurb,
          image: ogImage,
          url: canonical
        }
      },
      // add a class so CSS can “tame” the H1 on this page only
      "page-product"
    )
  );
};

/* ---------- helpers ---------- */

function html(status, body) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function pageShell(title, innerHtml, meta = {}, bodyClass = "") {
  const canonical = meta.canonical ? `<link rel="canonical" href="${escapeHtml(meta.canonical)}">` : "";
  const og = meta.og || {};
  const ogTags = `
    ${og.title ? `<meta property="og:title" content="${escapeHtml(og.title)}">` : ""}
    ${og.description ? `<meta property="og:description" content="${escapeHtml(og.description)}">` : ""}
    ${og.image ? `<meta property="og:image" content="${escapeHtml(og.image)}">` : ""}
    ${og.url ? `<meta property="og:url" content="${escapeHtml(og.url)}">` : ""}
    <meta property="og:type" content="product">
  `;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} • Grandma’s Kitchen</title>
  ${canonical}
  ${ogTags}
  <link rel="stylesheet" href="/style.css">
</head>
<body class="${escapeHtml(bodyClass)}">
${innerHtml}
</body>
</html>`;
}
