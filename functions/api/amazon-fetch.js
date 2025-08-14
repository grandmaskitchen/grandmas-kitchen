// POST /api/amazon-fetch  { urlOrAsin: string }
export async function onRequestPost({ request, env }) {
  try {
    if (!env.RAINFOREST_API_KEY)
      return new Response("Missing RAINFOREST_API_KEY", { status: 500 });

    const { urlOrAsin } = await request.json();
    if (!urlOrAsin) return new Response("urlOrAsin required", { status: 400 });

    // 1) Normalize to { asin, domain }
    const { asin, domain } = await resolveAsinAndDomain(urlOrAsin);
    if (!asin || !domain) return new Response("Could not resolve ASIN/domain", { status: 400 });

    // 2) Call Rainforest
    const api = new URL("https://api.rainforestapi.com/request");
    api.searchParams.set("api_key", env.RAINFOREST_API_KEY);
    api.searchParams.set("type", "product");
    api.searchParams.set("amazon_domain", domain);        // e.g. "amazon.co.uk"
    api.searchParams.set("asin", asin);

    const resp = await fetch(api, { cf: { cacheTtl: 300, cacheEverything: false } });
    if (!resp.ok) return new Response(`Upstream ${resp.status}`, { status: 502 });
    const j = await resp.json();

    const p = j?.product || {};
    const images = p.images || [];
    const mainImg = p.main_image?.link || images[0]?.link || null;

    // Map to your DB/form fields
    const out = {
      amazon_title: p.title || "",
      amazon_desc: Array.isArray(p.feature_bullets) ? p.feature_bullets.join(" ") : (p.description || ""),
      image_main: mainImg,
      image_small: images[1]?.link || null,
      amazon_category: p.categories?.[0]?.name || p.product_information?.brand || "",
      affiliate_link: p.link || "",             // you can still use your amzn.to link if you prefer
      product_type: "",                         // still your choice (powder/tablet/etc.)
    };

    return Response.json({ asin, domain, scraped: out });
  } catch (e) {
    return new Response(e?.message || "fetch error", { status: 500 });
  }
}

async function resolveAsinAndDomain(input) {
  // Accept raw ASIN
  const asinLike = /^[A-Z0-9]{10}$/i;
  if (asinLike.test(input)) return { asin: input.toUpperCase(), domain: "amazon.co.uk" };

  // Expand and parse URLs
  try {
    let url = new URL(input);
    // Expand amzn.to shortlinks
    if (url.hostname === "amzn.to") {
      const r = await fetch(url.toString(), { redirect: "manual" });
      const loc = r.headers.get("location");
      if (loc) url = new URL(loc);
    }
    const host = url.hostname.toLowerCase();
    const domain = host.endsWith("amazon.co.uk") ? "amazon.co.uk"
                 : host.endsWith("amazon.com")    ? "amazon.com"
                 : host.replace(/^www\./, "");
    // Try to pull ASIN from common URL patterns
    const m = url.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i) ||
              url.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    const asin = (m && (m[1] || m[0]))?.toUpperCase()?.slice(-10);
    return { asin, domain };
  } catch {
    return { asin: null, domain: null };
  }
}

