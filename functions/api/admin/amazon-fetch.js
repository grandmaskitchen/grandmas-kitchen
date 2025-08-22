// /functions/api/admin/amazon-fetch.js
// POST { input } -> { scraped:{ ... }, warning? }
// Robust Amazon scraper with desktop+mobile fallback and multiple selectors.

export const onRequestOptions = ({ request }) =>
  new Response(null, { status: 204, headers: cors(request) });

export const onRequestPost = async ({ request }) => {
  try {
    const { input } = await request.json();
    if (!input || !String(input).trim()) {
      return jerr(request, "input is required", 400);
    }

    // Normalize input -> { asin, url }
    const norm = await normalizeInput(input);
    let targetUrl = norm.url;
    const asin = norm.asin || extractASIN(targetUrl);

    // 1) Try desktop
    let { ok, html, finalUrl } = await fetchHtml(targetUrl, DESKTOP_UA);
    let blocked = !ok || isBlocked(html);

    // 2) Fallback to mobile template
    if (blocked && asin) {
      const mUrl = `https://m.amazon.co.uk/dp/${asin}`;
      const r2 = await fetchHtml(mUrl, MOBILE_UA);
      if (r2.ok && !isBlocked(r2.html)) {
        ok = true;
        html = r2.html;
        finalUrl = r2.finalUrl;
        blocked = false;
      }
    }

    // If still blocked, at least return ASIN + normalized link
    if (blocked) {
      return jok(request, {
        scraped: minimal(finalUrl || targetUrl, asin),
        warning: "Amazon blocked scraping; returned only ASIN/link.",
      });
    }

    // ---- Parse fields (try many sources) ----
    const amazon_title =
      meta(html, ["og:title", "twitter:title"]) ||
      textBetween(html, /<span[^>]+id=["']productTitle["'][^>]*>/i, /<\/span>/i) ||
      textBetween(html, /<span[^>]+id=["']title["'][^>]*>/i, /<\/span>/i) ||
      titleTag(html) ||
      "";

    const amazon_desc =
      meta(html, ["description", "og:description", "twitter:description"]) || "";

    const image_main =
      // ld+json often has an array or string
      ldImage(html) ||
      // og/twitter images
      meta(html, ["og:image:secure_url", "og:image", "twitter:image"]) ||
      // img#landingImage via data-a-dynamic-image
      dynamicImage(html) ||
      // any plausible m.media-amazon image
      firstMediaImage(html) ||
      "";

    const amazon_category =
      meta(html, ["og:site_name"]) || breadcrumbGuess(html) || null;

    const scraped = {
      affiliate_link: finalUrl || targetUrl,
      amazon_title: clean(amazon_title).slice(0, 300),
      amazon_desc: clean(amazon_desc).slice(0, 800),
      image_main,
      image_small: image_main || "",
      image_extra_1: null,
      image_extra_2: null,
      amazon_category,
    };

    return jok(request, { scraped });
  } catch (err) {
    return jerr(request, err?.message || "Server error", 500);
  }
};

/* ---------------- fetch helpers ---------------- */

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
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
  const html = await r.text();
  return { ok: r.ok, html, finalUrl: r.url || url };
}

function isBlocked(html = "") {
  return /captcha|robot check|automated access|enter the characters/i.test(html);
}

/* ---------------- normalisation ---------------- */

async function normalizeInput(raw) {
  const s = String(raw).trim();

  // bare ASIN
  const mAsin = s.match(/^[A-Z0-9]{10}$/i);
  if (mAsin) {
    const asin = mAsin[0].toUpperCase();
    return { asin, url: `https://www.amazon.co.uk/dp/${asin}` };
  }

  try {
    const u = new URL(s);

    // amzn.to short link -> follow
    if (/^amzn\.to$/i.test(u.hostname)) {
      const r = await fetch(u.toString(), { redirect: "follow" });
      const final = r.url || u.toString();
      const asin = extractASIN(final);
      return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : final };
    }

    if (/amazon\./i.test(u.hostname)) {
      const asin = extractASIN(u.toString());
      return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : u.toString() };
    }
  } catch (_) {}

  const asin = extractASIN(s);
  return { asin, url: asin ? `https://www.amazon.co.uk/dp/${asin}` : s };
}

function extractASIN(s) {
  if (!s) return null;
  const m =
    String(s).match(/\/dp\/([A-Z0-9]{10})/i) ||
    String(s).match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
    String(s).match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

/* ---------------- parsers ---------------- */

function meta(html, names) {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const m = html.match(re);
    if (m) return decode(m[1]);
  }
  return "";
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(strip(m[1])) : "";
}

function ldImage(html) {
  // try to find application/ld+json blocks and parse first image / name
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1].trim());
      // could be array or object
      const obj = Array.isArray(j) ? j.find(x => x && (x.image || x.name)) : j;
      if (obj) {
        if (obj.image) {
          if (typeof obj.image === "string") return obj.image;
          if (Array.isArray(obj.image) && obj.image[0]) return obj.image[0];
        }
      }
    } catch {}
  }
  return "";
}

function dynamicImage(html) {
  // img#landingImage has data-a-dynamic-image='{"url1":[...]...}'
  const m = html.match(
    /<img[^>]+id=["']landingImage["'][^>]+data-a-dynamic-image=["']([^"']+)["'][^>]*>/i
  );
  if (!m) return "";
  try {
    const map = JSON.parse(decode(m[1]));
    const urls = Object.keys(map || {});
    return urls[0] || "";
  } catch {
    return "";
  }
}

function firstMediaImage(html) {
  const m = html.match(/https:\/\/m\.media-amazon\.com\/images\/[^"'<>\s]+/i);
  return m ? decode(m[0]) : "";
}

function breadcrumbGuess(html) {
  const m =
    html.match(/<li[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/li>/i) ||
    html.match(/<a[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  return m ? clean(strip(m[1])) : null;
}

/* ---------------- utils ---------------- */

function textBetween(html, startRe, endRe) {
  const i = html.search(startRe);
  if (i === -1) return "";
  const s = html.slice(i);
  const j = s.search(endRe);
  const inner = j === -1 ? s : s.slice(0, j);
  return decode(strip(inner));
}
function strip(s) { return String(s).replace(/<[^>]*>/g, " "); }
function decode(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function clean(s) { return String(s).replace(/\s+/g, " ").trim(); }

function minimal(url, asin) {
  return {
    affiliate_link: url,
    amazon_title: "",
    amazon_desc: "",
    image_main: "",
    image_small: "",
    image_extra_1: null,
    image_extra_2: null,
    amazon_category: null,
    asin: asin || extractASIN(url),
  };
}

/* ---------------- response helpers ---------------- */

function cors(request) {
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
function jok(request, obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors(request) },
  });
}
function jerr(request, error, status = 500) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...cors(request) },
  });
}
