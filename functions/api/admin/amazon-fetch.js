// Admin: Fetch basic product details from an Amazon URL or ASIN.
// POST /api/admin/amazon-fetch   -> { scraped: { ... } }

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });

export const onRequestPost = async ({ request, env }) => {
  // Optional extra auth (your global _middleware already protects /admin/*)
  const auth = requireBasicAuthIfConfigured(request, env);
  if (auth instanceof Response) return auth;

  try {
    const { input } = await request.json();
    if (!input || !String(input).trim()) {
      return jerr("input is required", 400, request);
    }

    // 1) Normalize to an Amazon product URL
    const { url, asin, source } = await normalizeAmazonInput(input);

    // 2) Fetch the page
    const res = await fetch(url, {
      redirect: "follow",
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const html = await res.text();

    if (!res.ok || !html || /captcha|robot check/i.test(html)) {
      return jok(
        {
          scraped: minimalFrom(url, asin),
          warning:
            "Could not fully parse product page (blocked or unexpected HTML).",
        },
        request
      );
    }

    // 3) Scrape
    const scraped = {
      affiliate_link: url,
      amazon_title:
        pickMeta(html, /property=["']og:title["']|name=["']og:title["']/i) ||
        textBetween(html, /<span[^>]+id=["']productTitle["'][^>]*>/i, /<\/span>/i) ||
        pickTitleTag(html) ||
        "",
      amazon_desc:
        pickMeta(html, /name=["']description["']/i) ||
        pickMeta(html, /property=["']og:description["']/i) ||
        "",
      image_main:
        pickMeta(html, /property=["']og:image["']|name=["']og:image["']/i) ||
        firstImageCandidate(html) ||
        "",
      image_extra_1: null,
      image_extra_2: null,
      amazon_category:
        pickMeta(html, /property=["']og:site_name["']/i) ||
        guessCategoryFromBreadcrumb(html) ||
        null,
    };

    scraped.amazon_title = clean(scraped.amazon_title).slice(0, 300);
    scraped.amazon_desc  = clean(scraped.amazon_desc).slice(0, 800);
    if (!scraped.image_main) scraped.image_main = guessImageFromDataHtml(html) || "";

    return jok({ scraped, source }, request);
  } catch (err) {
    return jerr(err?.message || "Server error", 500, request);
  }
};

/* ---------------- helpers ---------------- */

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Cf-Access-Jwt-Assertion",
    "Cache-Control": "no-store",
  };
}

function jok(obj, request) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}
function jerr(error, status, request) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

// Optional Basic Auth here too (same creds as middleware)
function requireBasicAuthIfConfigured(request, env) {
  if (!env.WORKSHOP_USER || !env.WORKSHOP_PASS) return null;
  const realm = env.WORKSHOP_REALM || "Workshop Admin";
  const challenge = () =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
    });

  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return challenge();

  let decoded = "";
  try { decoded = atob(header.slice(6)); } catch { return challenge(); }
  const idx = decoded.indexOf(":");
  const u = idx === -1 ? decoded : decoded.slice(0, idx);
  const p = idx === -1 ? "" : decoded.slice(idx + 1);
  if (u !== env.WORKSHOP_USER || p !== env.WORKSHOP_PASS) return challenge();
  return null;
}

/* ---------- input normalization ---------- */

async function normalizeAmazonInput(raw) {
  const s = String(raw).trim();

  // Bare ASIN?
  const mAsin = s.match(/^[A-Z0-9]{10}$/i);
  if (mAsin) {
    const asin = mAsin[0].toUpperCase();
    return { asin, url: `https://www.amazon.co.uk/dp/${asin}`, source: "asin" };
  }

  // URL?
  let u;
  try { u = new URL(s); } catch {
    const asin2 = extractASIN(s);
    const url2 = asin2 ? `https://www.amazon.co.uk/dp/${asin2}` : "https://www.amazon.co.uk/";
    return { asin: asin2, url: url2, source: "string" };
  }

  // amzn.to shortener -> follow
  if (/^amzn\.to$/i.test(u.hostname)) {
    const head = await fetch(u.toString(), { redirect: "follow" });
    const finalURL = head.url || u.toString();
    const asin = extractASIN(finalURL);
    return {
      asin,
      url: asin ? `https://www.amazon.co.uk/dp/${asin}` : finalURL,
      source: "amzn.to",
    };
  }

  // amazon.* URL
  if (/amazon\./i.test(u.hostname)) {
    const asin = extractASIN(u.toString());
    return {
      asin,
      url: asin ? `https://www.amazon.co.uk/dp/${asin}` : u.toString(),
      source: "amazon",
    };
  }

  // Unknown
  const fallback = extractASIN(s);
  return {
    asin: fallback,
    url: fallback ? `https://www.amazon.co.uk/dp/${fallback}` : s,
    source: "unknown",
  };
}

function extractASIN(s) {
  if (!s) return null;
  const m =
    String(s).match(/\/dp\/([A-Z0-9]{10})/i) ||
    String(s).match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
    String(s).match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

/* ---------- scraping primitives ---------- */

function pickMeta(html, attrRegex) {
  const re = new RegExp(
    `<meta[^>]+(?:${attrRegex.source})[^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : "";
}
function pickTitleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])) : "";
}
function textBetween(html, startRe, endRe) {
  const start = html.search(startRe);
  if (start === -1) return "";
  const slice = html.slice(start);
  const end = slice.search(endRe);
  const inner = end === -1 ? slice : slice.slice(0, end);
  return decodeEntities(stripTags(inner));
}
function firstImageCandidate(html) {
  const m = html.match(
    /<img[^>]+id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["'][^>]*>/i
  );
  if (m) return decodeEntities(m[1]);
  const m2 = html.match(/https:\/\/m\.media-amazon\.com\/images\/[^"'<>\s]+/i);
  return m2 ? decodeEntities(m2[0]) : "";
}
function guessImageFromDataHtml(html) {
  const m = html.match(/"hiRes"\s*:\s*"([^"]+)"/i);
  return m ? decodeEntities(m[1]) : "";
}
function guessCategoryFromBreadcrumb(html) {
  const m =
    html.match(/<a[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ||
    html.match(/<li[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/li>/i);
  return m ? clean(stripTags(m[1])) : null;
}

/* ---------- tiny utils ---------- */
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function stripTags(s) { return String(s).replace(/<[^>]*>/g, " "); }
function clean(s) { return String(s).replace(/\s+/g, " ").trim(); }

function minimalFrom(url, asin) {
  return {
    affiliate_link: url,
    amazon_title: "",
    amazon_desc: "",
    image_main: "",
    image_extra_1: null,
    image_extra_2: null,
    amazon_category: null,
    asin: asin || extractASIN(url),
  };
}
