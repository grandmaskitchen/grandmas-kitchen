// functions/api/amazon-fetch.js
// POST /api/amazon-fetch  { input: "<amzn.to|amazon url|ASIN>" }

export const onRequestGet = () =>
  json({ ok: true, message: "amazon-fetch live" });

export const onRequestPost = async ({ request }) => {
  try {
    const { input } = await request.json().catch(() => ({}));
    if (!input || typeof input !== "string") {
      return jsonErr("Missing 'input' (Amazon URL, amzn.to link, or ASIN).", 400);
    }

    // 1) resolve to a full amazon.* URL
    const resolvedUrl = await resolveInputToAmazonUrl(input.trim());
    if (!resolvedUrl) return jsonErr("Could not resolve to an Amazon product URL.", 400);

    // 2) fetch HTML with a desktop UA (Amazon blocks default fetch UA)
    const html = await fetchHtml(resolvedUrl);
    if (!html) return jsonErr("Amazon blocked the request (no HTML). Try the full amazon.* URL.", 502);

    // 3) scrape a few essentials (keep it simple + robust)
    const scraped = {
      amazon_title: pickFirst([
        metaContent(html, "og:title"),
        textById(html, "productTitle"),
      ]),
      amazon_desc: pickFirst([
        metaContent(html, "og:description"),
        metaContent(html, "description"),
      ]),
      image_main: pickFirst([
        metaContent(html, "og:image"),
        imageFromLanding(html),
      ]),
      image_small: pickFirst([
        imageFromLanding(html),
        metaContent(html, "og:image"),
      ]),
      amazon_category: breadcrumb(html),
      affiliate_link: resolvedUrl,
    };

    // sanity: at least a title OR image should exist
    if (!scraped.amazon_title && !scraped.image_main) {
      return jsonErr("Could not extract details (title/image). Paste a full Amazon product URL.", 422, { resolvedUrl });
    }

    return json({ ok: true, scraped, resolvedUrl });
  } catch (e) {
    return jsonErr(e?.message || "Server error", 500);
  }
};

// ---------- helpers

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonErr(message, status = 400, extra = {}) {
  return json({ ok: false, error: { message }, ...extra }, status);
}

async function resolveInputToAmazonUrl(raw) {
  const ASIN = raw.match(/\b([A-Z0-9]{10})\b/i)?.[1];
  if (ASIN && !/amazon\./i.test(raw)) {
    // no domain given → default to .co.uk (change if you prefer .com)
    return `https://www.amazon.co.uk/dp/${ASIN}`;
  }

  if (/amzn\.to/i.test(raw)) {
    // follow the short-link redirect WITHOUT auto-follow so we can read Location
    const r = await fetch(raw, { redirect: "manual" });
    const loc = r.headers.get("location");
    if (loc && /amazon\./i.test(loc)) return loc;
    // some edges auto-follow; if so, just trust the input
  }

  if (/amazon\./i.test(raw)) return raw;

  return null;
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
      "Accept": "text/html,application/xhtml+xml",
      "Cache-Control": "no-cache",
    },
  });
  if (!r.ok) return null;
  return await r.text();
}

// --- tiny scrapers (regex-based, resilient to extra whitespace) ---

function metaContent(html, propOrName) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRx(propOrName)}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    "i"
  );
  return html.match(re)?.[1]?.trim();
}

function textById(html, id) {
  const re = new RegExp(`<[^>]+id=["']${escapeRx(id)}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  const m = html.match(re)?.[1];
  return m?.replace(/\s+/g, " ").trim();
}

f
