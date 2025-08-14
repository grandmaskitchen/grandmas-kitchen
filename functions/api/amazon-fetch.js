// /functions/api/amazon-fetch.js

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
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }

    const { urlOrAsin } = await request.json();
    if (!urlOrAsin) return json({ error: "Missing urlOrAsin" }, 400);

    // Normalise: accept full URL, amzn.to, or raw ASIN
    const productUrl = normaliseInput(urlOrAsin);

    // Fetch the page (basic, non-PA-API approach)
    const res = await fetch(productUrl, {
      redirect: "follow",
      headers: {
        // Spoof a browser-ish UA so Amazon returns the full page
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return json({ error: `Upstream ${res.status} ${res.statusText}` }, 502);
    }

    const html = await res.text();

    // Very light scraping: prefer Open Graph tags
    const getMeta = (prop) =>
      html.match(
        new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i")
      )?.[1];

    const amazon_title = getMeta("og:title") || "";
    const amazon_desc =
      getMeta("og:description") ||
      // fallback: meta name="description"
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      "";

    // Primary image
    let image_main =
      getMeta("og:image") ||
      html.match(/"hiResImage"\s*:\s*"([^"]+)"/i)?.[1] ||
      html.match(/"large"\s*:\s*{\s*"url"\s*:\s*"([^"]+)"/i)?.[1] ||
      "";

    // Small image: try to derive from main, or leave empty
    let image_small = image_main.replace(/\._[A-Z]{2}\d+_./, "._SL500_."); // best-effort

    // Category (best-effort – varies per locale/template)
    const amazon_category =
      html.match(/"itemTypeKeyword"\s*:\s*"([^"]+)"/i)?.[1] ||
      html.match(/<a[^>]+class=["'][^"']*a-link-normal a-color-tertiary[^"']*["'][^>]*>([^<]+)</i)?.[1] ||
      "";

    return json({
      scraped: {
        amazon_title,
        amazon_desc,
        image_main,
        image_small,
        amazon_category,
        affiliate_link: productUrl
      }
    });
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function normaliseInput(input) {
  const t = input.trim();

  // amzn.to short links → leave as-is (CF will follow redirects)
  if (/^https?:\/\/(www\.)?amzn\.to\//i.test(t)) return t;

  // Full amazon.* product URLs → leave as-is
  if (/^https?:\/\/(www\.)?amazon\./i.test(t)) return t;

  // Raw ASIN → convert to amazon.co.uk detail URL (adjust domain if needed)
  if (/^[A-Z0-9]{10}$/i.test(t)) {
    return `https://www.amazon.co.uk/dp/${t}`;
  }

  // last resort, just try it as a URL
  try {
    new URL(t);
    return t;
  } catch {
    throw new Error("Input is neither a valid URL nor an ASIN");
  }
}
