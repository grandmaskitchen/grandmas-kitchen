// Cloudflare Pages Function: /api/amazon-fetch
// GET  /api/amazon-fetch?input=<amazon url | amzn.to | ASIN>
// POST /api/amazon-fetch  body: { input: "<amazon url | amzn.to | ASIN>" }
// Returns: { scraped: { amazon_title, amazon_desc, image_main, image_small, image_extra_1, image_extra_2, amazon_category, affiliate_link } }

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const input = url.searchParams.get("input") || "";
  if (!input) {
    return json({ error: { message: "Provide ?input=<amazon url | amzn.to | ASIN>" } }, 400);
  }
  return handleFetch(input);
};

export const onRequestPost = async ({ request }) => {
  try {
    const { input } = await request.json();
    if (!input) return json({ error: { message: "Missing input" } }, 400);
    return handleFetch(input);
  } catch {
    return json({ error: { message: "Invalid JSON" } }, 400);
  }
};

async function handleFetch(input) {
  try {
    // 1) Follow amzn.to redirects etc.
    const resolved = await resolveLink(input);

    // 2) Extract ASIN + keep marketplace
    const { asin, url } = parseAsinOrUrl(resolved);
    if (!asin && !url) {
      return json({ error: { message: "Could not find an ASIN or product URL" } }, 400);
    }

    // Prefer the marketplace from url; fallback to UK if raw ASIN
    const finalUrl = url || `https://www.amazon.co.uk/dp/${asin}`;

    // 3) Fetch HTML
    const html = await fetchHtml(finalUrl);

    // 4) Scrape
    const scraped = scrapeAmazon(html, finalUrl);
    scraped.affiliate_link = finalUrl; // your form keeps your own amzn.to if already filled

    return json({ scraped });
  } catch (err) {
    return json({ error: { message: err?.message || "Server error" } }, 500);
  }
}

/* ---------------- helpers ---------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function resolveLink(input) {
  try {
    const looksLikeUrl = /^https?:\/\//i.test(input);
    const u = new URL(looksLikeUrl ? input : `https://www.amazon.co.uk/dp/${input}`);
    const r = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": u.hostname.endsWith(".com") ? "en-US,en;q=0.9" : "en-GB,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": url.includes(".com") ? "en-US,en;q=0.9" : "en-GB,en;q=0.9",
      Accept: "text/html,*/*"
    }
  });
  const text = await r.text();
  if (!r.ok) {
    // bubble a short slice for debugging
    throw new Error(`Amazon responded ${r.status}. ${text.slice(0, 200)}`);
  }
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

  // Description (fallback to feature bullets)
  let desc =
    get(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) || "";
  if (!desc) {
    const bullets = get(/<div\s+id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
    if (bullets) {
      desc = bullets.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  // Images — og:image / JSON blobs / dynamic image attribute
  let mainImg =
    get(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    get(/"large"\s*:\s*"((?:https:)?\/\/[^"]+)"/i) ||
    get(/"hiRes"\s*:\s*"((?:https:)?\/\/[^"]+)"/i) ||
    "";

  if (!mainImg) {
    const dyn = get(/data-a-dynamic-image="({[^"]+})"/i); // {"https://...jpg":[500,500],...}
    if (dyn) {
      try {
        const obj = JSON.parse(dyn.replace(/&quot;/g, '"'));
        const first = Object.keys(obj)[0];
        if (first) mainImg = first;
      } catch {}
    }
  }

  // Category (best-effort)
  const crumb =
    get(/"category"\s*:\s*"([^"]+)"/i) ||
    get(/<span[^>]+class=["'][^"']*nav-a-content[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i);

  return {
    amazon_title: title || "",
    amazon_desc: desc || "",
    image_main: absolutize(mainImg, url),
    image_small: "",
    image_extra_1: "",
    image_extra_2: "",
    amazon_category: crumb || ""
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
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}
