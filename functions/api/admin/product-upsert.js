// /functions/api/admin/product-upsert.js
// POST /api/admin/product-upsert  → upsert into Supabase "products" (on_conflict=product_num)

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestPost = async ({ request, env }) => {
  try {
    const incoming = await request.json();

    // Legacy → current names
    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l",
    };

    // Columns we allow
    const allowed = new Set([
      "manufacturer",
      "product_num",
      "affiliate_link",
      "amazon_title",
      "amazon_desc",
      "my_title",
      "my_subtitle",
      "my_description_short",
      "my_description_long",
      "image_main",
      "image_small",
      "image_extra_1",
      "image_extra_2",
      "where_advertised",
      "ad_type",
      "amazon_category",
      "product_type",
      "commission_l",
      "approved",
      "added_by",
      // FAB fields intentionally excluded in this “Product Source Admin”
    ]);

    // Normalize payload ("" → null, drop unknowns)
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
    }

    // Keep EXACT Sitestripe link user typed
    if (typeof incoming.affiliate_link === "string") {
      row.affiliate_link = incoming.affiliate_link.trim();
    }

    // --- number block: compute product_num (ASIN or slug) -------------------
    // only if not supplied
    if (!row.product_num || !String(row.product_num).trim()) {
      const title = (row.my_title || row.amazon_title || "").trim();
      const asinFromLink = extractASIN(row.affiliate_link || "");
      const asinFromTitle = extractASIN(title);

      const picked =
        asinFromLink ||
        asinFromTitle ||
        makeSlug(title) ||
        // absolute last fallback
        `sku-${Date.now().toString(36)}`;

      row.product_num = picked.toLowerCase();
    }
    // ------------------------------------------------------------------------

    // Coerce types
    if (row.commission_l != null && row.commission_l !== "") {
      const n = Number(row.commission_l);
      row.commission_l = Number.isFinite(n) ? n : null;
    } else {
      row.commission_l = null;
    }
    row.approved =
      row.approved === true ||
      row.approved === "true" ||
      row.approved === "on" ||
      row.approved === 1;

    // Access email → added_by (if not provided)
    const accessEmail =
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email");
    if (accessEmail && !row.added_by) row.added_by = accessEmail;

    // Validation
    if (!row.my_title || !String(row.my_title).trim()) {
      return json({ error: "my_title is required" }, 400);
    }
    try {
      new URL(row.image_main);
    } catch {
      return json({ error: "image_main must be a valid URL" }, 400);
    }
    if (
      row.affiliate_link &&
      !/^https?:\/\/(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link)
    ) {
      return json({
        error: "affiliate_link must be an Amazon URL (amzn.to or amazon.*)",
      }, 400);
    }

    // Upsert
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    url.searchParams.set("on_conflict", "product_num");

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify([row]),
    });

    const out = await resp.json();
    if (!resp.ok) {
      return json({ error: out?.message || "Insert failed", details: out }, 400);
    }

    const product = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product }, 201);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Extract ASIN from an Amazon URL or any string that might contain one
function extractASIN(s = "") {
  if (!s) return null;
  // common URL forms: /dp/ASIN, /gp/product/ASIN, ?asin=ASIN
  const m =
    s.match(/\/dp\/([A-Z0-9]{10})/i) ||
    s.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
    s.match(/[?&]asin=([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

// Make a clean slug from a title (ASCII, hyphens)
function makeSlug(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")      // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")          // non a-z0-9 → hyphen
    .replace(/^-+|-+$/g, "")              // trim hyphens
    .replace(/-{2,}/g, "-")               // collapse
    .slice(0, 48);
}
