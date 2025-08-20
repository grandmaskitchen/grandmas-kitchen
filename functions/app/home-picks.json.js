// GET /app/home-picks.rss
// RSS feed: 6 daily picks (approved products), deterministically shuffled by day.
// No npm deps. Works on Cloudflare Pages Functions.

export const onRequestGet = async ({ request, env }) => {
  try {
    const reqUrl = new URL(request.url);
    const site = env.SITE_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    // 1) Fetch a pool of approved products from Supabase
    const sb = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    sb.searchParams.set(
      "select",
      [
        "product_num",
        "my_title",
        "amazon_title",
        "my_description_short",
        "image_main",
        "created_at",
        "approved"
      ].join(",")
    );
    sb.searchParams.set("approved", "eq.true");
    sb.searchParams.set("order", "created_at.desc");
    sb.searchParams.set("limit", "200"); // pull up to 200, then pick 6

    const r = await fetch(sb.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact"
      }
    });

    if (!r.ok) {
      const text = await r.text();
      return rssError(`Supabase error ${r.status}: ${text}`);
    }

    const rows = await r.json();

    // 2) Filter to valid rows
    const pool = (rows || []).filter(
      (p) => p && p.product_num && p.image_main
    );

    // 3) Deterministic "shuffle" per day using a simple hash on (product_num + YYYY-MM-DD)
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    pool.sort((a, b) => hash(a.product_num + day) - hash(b.product_num + day));

    const picks = pool.slice(0, 6);

    // 4) Build RSS items
    const itemsXml = picks
      .map((p) => {
        const title = p.my_title || p.amazon_title || "Product";
        const link = `${site}/products/${encodeURIComponent(p.product_num)}`;
        const desc = p.my_description_short || "";
        const guid = `${p.product_num}-${day}`;
        const enclosure = p.image_main
          ? `<enclosure url="${xml(p.image_main)}" type="image/jpeg" />`
          : "";
        return `
  <item>
    <title>${xml(title)}</title>
    <link>${xml(link)}</link>
    <guid isPermaLink="false">${xml(guid)}</guid>
    <description>${xml(desc)}</description>
    ${enclosure}
    <pubDate>${new Date(p.created_at || Date.now()).toUTCString()}</pubDate>
  </item>`;
      })
      .join("\n");

    // 5) Final RSS
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Grandma’s Kitchen • Daily Picks</title>
  <link>${xml(site)}</link>
  <description>Six fresh picks each day from Grandma’s Pantry</description>
  <language>en-gb</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemsXml}
</channel>
</rss>`;

    return new Response(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        // cache a bit; it only changes daily
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400"
      }
    });
  } catch (err) {
    return rssError(err?.message || "Server error");
  }
};

function rssError(message) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Grandma’s Kitchen • Daily Picks</title>
  <description>Error: ${xml(message)}</description>
  <link>/</link>
</channel></rss>`;
  return new Response(body, {
    status: 500,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" }
  });
}

function xml(s) {
  return String(s || "").replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[c]);
}

// Simple deterministic hash (not cryptographic)
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  // make unsigned
  return h >>> 0;
}
