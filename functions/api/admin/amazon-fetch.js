// Admin: Fetch basic product details from an Amazon URL or ASIN.
// POST /api/admin/amazon-fetch   -> { scraped:{...}, warning? }

export const onRequestOptions = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request) });

export const onRequestPost = async ({ request, env }) => {
  try {
    const { input } = await request.json();
    if (!input || !String(input).trim()) {
      return jerr("input is required", 400, request);
    }

    // Resolve short links / pull ASIN
    const base = await normalizeAmazonInput(input);
    let url = base.url;
    let asin = base.asin || extractASIN(url);

    // First attempt: desktop page
    let { ok, html, finalUrl } = await fetchHtml(url, DESKTOP_UA);
    let blocked = !ok || isBlocked(html);

    // Fallback: mobile page (far fewer bot checks)
    if (blocked && asin) {
      const mUrl = `https://m.amazon.co.uk/dp/${asin}`;
      const try2 = await fetchHtml(mUrl, MOBILE_UA);
      if (try2.ok && !isBlocked(try2.html)) {
        ok = true;
        html = try2.html;
        finalUrl = try2.finalUrl;
        blocked = false;
      }
    }

    // If still blocked, return minimal but usable payload
    if (blocked) {
      return jok(
        { scraped: minimalFrom(base.url, asin), warning: "Amazon blocked scraping; filled only ASIN/link." },
        request
      );
    }

    // Scrape
    const scraped = {
      affiliate_link: finalUrl || base.url,
      amazon_title:
        pickMeta(html, /property=["']og:title["']|name=["']og:title["']/i) ||
        textBetween(html, /<span[^>]+id=["']productTitle["'][^>]*>/i, /<\/span>/i) ||
        textBetween(html, /<span[^>]+id=["']title["'][^>]*>/i, /<\/span>/i) ||
        pickTitleTag(html) ||
        "",
      amazon_desc:
        pickMeta(html, /name=["']description["']/i) ||
        pickMeta(html, /property=["']og:description["']/i) ||
        "",
      image_main:
        pickMeta(html, /property=["']og:image["']|name=["']og:image["']/i) ||
        firstImageCandidate(html) ||
        guessImageFromDataHtml(html) ||
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

    // Always return success with whatever we got
    return jok({ scraped }, request);
  } catch (err) {
    return jerr(err?.message || "Server error", 500, request);
  }
};

/* ---------------- fetch & parse helpers ---------------- */

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

async function fetchHtml(url, ua) {
  const r = await fetch(url, {
    redirect: "follow",
    cf: { cacheTtl: 0, cacheEverything: false },
    headers: {
      "User-Agent": ua,
      "Accept-Language": "en-GB,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  const html = await r.text();
  return { ok: r.ok, html, finalUrl: r.url || url };
}

function isBlocked(html = "") {
  return /captcha|enter the characters|robot check|automated access|sorry/i.test(html);
}

/* ---------------- response helpers ---------------- */

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

/* ---------------- normalization ---------------- */

async function normalizeAmazonInput(raw) {
  const s = String(raw).trim();

  // Bare ASIN
  const mAsin = s.match(/^[A-Z0-9]{10}$/i);
  if (mAsin) {
    const asin = mAsin[0].toUpperCase();
    return { asin, url: `https://www.amazon.co.uk/dp/${asin}` };
  }

  // URL
  try {
    const u = new URL(s);
    // amzn.to -> follow (short link)
    if (/^amzn\.to$/i.test(u.hostname)) {
      const head = await fetch(u.toString(), { redirect: "follow" });
      const finalURL = head.url || u.toString();
      const asin = extractASIN(finalURL);
      return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : finalURL };
    }
    // any amazon.* URL
    if (/amazon\./i.test(u.hostname)) {
      const asin = extractASIN(u.toString());
      return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : u.toString() };
    }
  } catch {}

  // Unknown string, last-ditch ASIN pull
  const asin = extractASIN(s);
  return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : s };
}

function extractASIN(s) {
  if (!s) return null;
  const str = String(s);
  const m =
    str.match(/\/dp\/([A-Z0-9]{10})/i) ||
    str.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
    str.match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

/* ---------------- scraping primitives ---------------- */

function pickMeta(html, attrRegex) {
  const re = new RegExp(
    `<meta[^>]+(?:${attrRegex.source})[^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : "";
}
function textBetween(html, startRe, endRe) {
  const i = html.search(startRe);
  if (i === -1) return "";
  const slice = html.slice(i);
  const j = slice.search(endRe);
  const inner = j === -1 ? slice : slice.slice(0, j);
  return decodeEntities(stripTags(inner));
}
function pickTitleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])) : "";
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

/* ---------------- tiny utils ---------------- */

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
