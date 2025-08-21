// functions/api/admin/amazon-fetch.ts
// Admin: Fetch basic product details from an Amazon URL or ASIN.
// POST /api/admin/amazon-fetch -> { scraped: { ... }, source }

export const onRequestOptions = ({ request }: { request: Request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request) });

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request;
  env: Record<string, string>;
}) => {
  // Optional defense-in-depth (global middleware should already protect /admin/*)
  const auth = requireBasicAuthIfConfigured(request, env);
  if (auth instanceof Response) return auth;

  try {
    const { input } = await request.json();
    if (!input || !String(input).trim()) {
      return jerr("input is required", 400, request);
    }

    // 1) Normalize to a canonical Amazon product URL
    const { url, asin, source } = await normalizeAmazonInput(String(input));

    // 2) Fetch the product page (best-effort)
    const res = await fetch(url, {
      redirect: "follow",
      cf: { cacheTtl: 0, cacheEverything: false },
      headers: {
        // Reasonable headers to avoid bot challenges where possible
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });

    const html = await res.text();

    // 3) If blocked/challenged, return minimal payload so caller can still proceed
    if (
      !res.ok ||
      !html ||
      /captcha|robot\s*check|enter the characters you see/i.test(html)
    ) {
      return jok(
        {
          scraped: minimalFrom(url, asin),
          warning:
            "Could not fully parse product page (blocked or unexpected HTML).",
          source,
        },
        request
      );
    }

    // 4) Best-effort scraping
    const scraped = {
      affiliate_link: url,
      amazon_title:
        pickMeta(html, /property=["']og:title["']|name=["']og:title["']/i) ||
        textBetween(
          html,
          /<span[^>]+id=["']productTitle["'][^>]*>/i,
          /<\/span>/i
        ) ||
        pickTitleTag(html) ||
        "",
      amazon_desc:
        pickMeta(html, /name=["']description["']/i) ||
        pickMeta(html, /property=["']og:description["']/i) ||
        "",
      image_main:
        pickMeta(
          html,
          /property=["']og:image["']|name=["']og:image["']/i
        ) ||
        firstImageCandidate(html) ||
        guessImageFromDataHtml(html) ||
        "",
      image_extra_1: null as string | null,
      image_extra_2: null as string | null,
      amazon_category:
        pickMeta(html, /property=["']og:site_name["']/i) ||
        guessCategoryFromBreadcrumb(html) ||
        null,
      asin: asin || extractASIN(url),
    };

    // 5) Tidy fields
    scraped.amazon_title = clamp(clean(scraped.amazon_title), 300);
    scraped.amazon_desc = clamp(clean(scraped.amazon_desc), 800);

    return jok({ scraped, source }, request);
  } catch (err: any) {
    return jerr(err?.message || "Server error", 500, request);
  }
};

/* ---------------- helpers ---------------- */

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Cf-Access-Jwt-Assertion",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
  };
}

function jok(obj: unknown, request: Request) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

function jerr(error: string, status: number, request: Request) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

/**
 * Optional Basic Auth on this function.
 * Uses WORKSHOP_USER / WORKSHOP_PASS if set.
 * Returns Response (401) when challenge is required, or null if authorized / not enforced.
 */
function requireBasicAuthIfConfigured(
  request: Request,
  env: Record<string, string>
): Response | null {
  const user = env.WORKSHOP_USER;
  const pass = env.WORKSHOP_PASS;
  if (!user || !pass) return null; // not enforced

  const realm = env.WORKSHOP_REALM || "Workshop Admin";
  const challenge = () =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
    });

  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return challenge();

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return challenge();
  }

  const idx = decoded.indexOf(":");
  const u = idx === -1 ? decoded : decoded.slice(0, idx);
  const p = idx === -1 ? "" : decoded.slice(idx + 1);
  if (u !== user || p !== pass) return challenge();

  return null;
}

/* ---------- input normalization ---------- */

async function normalizeAmazonInput(raw: string): Promise<{
  asin: string | null;
  url: string;
  source: "asin" | "amzn.to" | "amazon" | "string" | "unknown";
}> {
  const s = String(raw).trim();

  // Bare ASIN (10 alphanumeric)
  const mAsin = s.match(/^[A-Z0-9]{10}$/i);
  if (mAsin) {
    const asin = mAsin[0].toUpperCase();
    return { asin, url: `https://www.amazon.co.uk/dp/${asin}`, source: "asin" };
  }

  // Try parse as URL; if it fails, fall back to extracting ASIN from text
  let u: URL | null = null;
  try {
    u = new URL(s);
  } catch {
    const asin2 = extractASIN(s);
    return {
      asin: asin2,
      url: asin2 ? `https://www.amazon.co.uk/dp/${asin2}` : s,
      source: "string",
    };
  }

  // amzn.to shortener -> follow redirects to final URL, then canonicalize
  if (/^amzn\.to$/i.test(u.hostname)) {
    // Use GET + follow; .url should be final
    const hop = await fetch(u.toString(), { redirect: "follow" });
    const finalURL = hop.url || u.toString();
    const asin = extractASIN(finalURL);
    return {
      asin,
      url: asin ? `https://www.amazon.co.uk/dp/${asin}` : finalURL,
      source: "amzn.to",
    };
  }

  // Any amazon.* URL -> canonicalize to /dp/ASIN when possible
  if (/amazon\./i.test(u.hostname)) {
    const asin = extractASIN(u.toString());
    return {
      asin,
      url: asin ? `https://www.amazon.co.uk/dp/${asin}` : u.toString(),
      source: "amazon",
    };
  }

  // Unknown -> echo back or canonicalize if ASIN is discoverable
  const fallbackAsin = extractASIN(s);
  return {
    asin: fallbackAsin,
    url: fallbackAsin ? `https://www.amazon.co.uk/dp/${fallbackAsin}` : s,
    source: "unknown",
  };
}

function extractASIN(s: string | null | undefined): string | null {
  if (!s) return null;
  const str = String(s);
  const m =
    str.match(/\/dp\/([A-Z0-9]{10})/i) ||
    str.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
    str.match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

/* ---------- scraping primitives ---------- */

function pickMeta(html: string, attrRegex: RegExp): string {
  // Finds <meta ... content="..."> where the tag matches attrRegex
  const re = new RegExp(
    `<meta[^>]+(?:${attrRegex.source})[^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : "";
}

function pickTitleTag(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1])) : "";
}

function textBetween(
  html: string,
  startRe: RegExp,
  endRe: RegExp
): string {
  const start = html.search(startRe);
  if (start === -1) return "";
  const slice = html.slice(start);
  const end = slice.search(endRe);
  const inner = end === -1 ? slice : slice.slice(0, end);
  return decodeEntities(stripTags(inner));
}

function firstImageCandidate(html: string): string {
  // Common main image container
  const m = html.match(
    /<img[^>]+id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["'][^>]*>/i
  );
  if (m) return decodeEntities(m[1]);

  // Fallback: any product image CDN match
  const m2 = html.match(/https:\/\/m\.media-amazon\.com\/images\/[^"'<>\s]+/i);
  return m2 ? decodeEntities(m2[0]) : "";
}

function guessImageFromDataHtml(html: string): string {
  const m = html.match(/"hiRes"\s*:\s*"([^"]+)"/i);
  return m ? decodeEntities(m[1]) : "";
}

function guessCategoryFromBreadcrumb(html: string): string | null {
  // Amazon often has a breadcrumb list; grab the last/first match's text
  const m =
    html.match(
      /<a[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/a>/i
    ) ||
    html.match(
      /<li[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/li>/i
    );
  return m ? clean(stripTags(m[1])) : null;
}

/* ---------- tiny utils ---------- */

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string): string {
  return String(s).replace(/<[^>]*>/g, " ");
}

function clean(s: string): string {
  return String(s).replace(/\s+/g, " ").trim();
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function minimalFrom(url: string, asin?: string | null) {
  return {
    affiliate_link: url,
    amazon_title: "",
    amazon_desc: "",
    image_main: "",
    image_extra_1: null as string | null,
    image_extra_2: null as string | null,
    amazon_category: null as string | null,
    asin: asin || extractASIN(url),
  };
}
