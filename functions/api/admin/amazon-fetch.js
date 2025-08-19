// Cloudflare Pages Function: POST /api/admin/amazon-fetch
// Input: { input: "<amazon url | amzn.to short link | ASIN>" }
// Output: { scraped: { amazon_title, amazon_desc, image_main, image_small, image_extra_1, image_extra_2, amazon_category } }

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

export const onRequestPost = async ({ request }) => {
  try {
    const { input } = await request.json();
    if (!input) return json({ error: { message: "Missing input" } }, 400);

    // 1) Resolve amzn.to etc. (follows redirects)
    const resolved = await resolveLink(input);

    // 2) Extract ASIN or product URL
    const { asin, url } = parseAsinOrUrl(resolved);
    if (!asin && !url) {
      return json({ error: { message: "Could not find an ASIN or product URL" } }, 400);
    }

    // 3) Fetch HTML
    const finalUrl = url || `https://www.amazon.co.uk/dp/${asin}`;
    const html = await fetchHtml(finalUrl);

    // 4) Scrape fields
    const scraped = scrapeAmazon(html, finalUrl);

    // NOTE: we do NOT overwrite your affiliate_link on the client.
    // The admin form only uses these to prefill IF the field is empty.
    return json({ scraped });
  } catch (err) {
    return json({ error: { message: err?.message || "Server error" } }, 500);
  }
};

/* ---------------- helpers ---------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function resolveLink(input) {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://www.amazon.co.uk/dp/${input}`);
    const r = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language":"en-GB,en;q=0.9",
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    return r.url || u.toString();
  } catch {
    return input;
  }
}

function parseAsinOrUrl(s) {
  try {
    const u = new URL(s);
    const m =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
      u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    return { asin: m?.[1]?.toUpperCase() || null, url: u.toString() };
  } catch {
    const m = String(s).trim().toUpperCase().match(/^[A-Z0-9]{10}$/);
    return { asin: m ? m[0] : null, url: null };
  }
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language":"en-GB,en;q=0.9",
      "Accept":"text/html,*/*"
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Amazon responded ${r.status}. ${text.slice(0, 200)}`);
  return text;
}

function scrapeAmazon(html, url) {
  const get = (re) => {
    const m = html.match(re);
    return (m && m[1] && decodeHtml(m[1])) || "";
  };

  // Title
  const title =
    get(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    get(/<span\s+id=["']productTitle["'][^>]*>\s*([^<]+)\s*<\/span>/i);

  // Description (fallback to bullets text)
  let desc =
    get(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) || "";
  if (!desc) {
    const bulletsBlock = get(/<div\s+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
    if (bulletsBlock) {
      desc = bulletsBlock.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  // Features (bullet list)
  const bulletsSection = html.match(/<div\s+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
  let features = [];
  if (bulletsSection?.[1]) {
    const liMatches = [...bulletsSection[1].matchAll(/<li[^>]*>\s*<span[^>]*>\s*([^<]+)\s*<\/span>\s*<\/li>/gi)];
    features = liMatches.map(m => decodeHtml(m[1]).trim()).filter(Boolean);
  }

  // Images: og:image or image JSON blobs
  const ogImg = get(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const jsonLarge = get(/"large"\s*:\s*"((?:https:)?\/\/[^"]+)"/i);
  const jsonHiRes = get(/"hiRes"\s*:\s*"((?:https:)?\/\/[^"]+)"/i);
  const mainImg = ogImg || jsonLarge || jsonHiRes || "";

  // Category (best-effort)
  const crumb =
    get(/"category"\s*:\s*"([^"]+)"/i) ||
    get(/<a[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([^<]+)<\/a>/i);

  return {
    amazon_title: title || "",
    amazon_desc: desc || "",
    image_main: absolutize(mainImg, url),
    image_small: "",         // optional
    image_extra_1: "",
    image_extra_2: "",
    amazon_category: crumb || "",
    features // array for your Website Admin later (we don’t fill the DB from here)
  };
}

function decodeHtml(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absolutize(src, base) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  try { return new URL(src, base).toString(); } catch { return src; }
}
