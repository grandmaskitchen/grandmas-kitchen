// /functions/api/admin/product-upsert.js
// POST /api/admin/product-upsert  ->  { ok:true, product:{...} }

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

    // Aliases we accept from older clients
    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l",
    };

    // Whitelist of columns we allow
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
      "amazon_category",   // legacy, optional
      "product_type",
      "commission_l",
      "approved",
      "added_by",
      "shop_category_id",  // REQUIRED: FK to categories.id
      "category_slug"      // convenience input we resolve to id
    ]);

    // Pick only allowed keys; convert "" -> null; trim strings
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      const val = v === "" ? null : v;
      row[dest] = typeof val === "string" ? val.trim() : val;
    }

    // Normalize affiliate_link: accept amzn.to, amazon.* OR bare ASIN
    if (typeof incoming.affiliate_link === "string") {
      const raw = incoming.affiliate_link.trim();
      const asinOnly = raw.toUpperCase().match(/^[A-Z0-9]{10}$/);
      if (asinOnly) {
        row.affiliate_link = `https://www.amazon.co.uk/dp/${asinOnly[0]}`;
      } else {
        row.affiliate_link = raw;
      }
    }

    // Coerce numeric/boolean fields
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

    // Prefer Cloudflare Access email for added_by
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
      !/^([A-Z0-9]{10}|https?:\/\/(amzn\.to|www\.amazon\.))/i.test(row.affiliate_link)
    ) {
      return json({
        error:
          "affiliate_link must be amzn.to, an amazon.* URL, or a 10-char ASIN",
      }, 400);
    }

    // Resolve category (REQUIRED)
    if (!row.shop_category_id && row.category_slug) {
      const cat = await fetchOneCategoryBySlug(env, String(row.category_slug));
      if (!cat) return json({ error: "Unknown category_slug" }, 400);
      row.shop_category_id = cat.id;
    }
    const cid = Number(row.shop_category_id);
    if (!Number.isInteger(cid) || cid <= 0) {
      return json({ error: "Category is required (shop_category_id or category_slug)" }, 400);
    }
    row.shop_category_id = cid;
    delete row.category_slug;

    // product_num: prefer ASIN if detected; else slug of title + suffix
    if (!row.product_num || !String(row.product_num).trim()) {
      const asin =
        extractASIN(row.affiliate_link) ||
        extractASIN(row.amazon_title) ||
        extractASIN(row.my_title);
      if (asin) {
        row.product_num = asin.toLowerCase();
      } else {
        row.product_num =
          slugify(row.my_title) + "-" + Date.now().toString(36).slice(-4);
      }
    } else {
      row.product_num = String(row.product_num).trim().toLowerCase();
    }

    // Upsert on product_num
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
      return json(
        { error: out?.message || "Insert failed", details: out },
        400
      );
    }

    const product = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, product }, 201);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
};

// ---------- helpers ----------

async function fetchOneCategoryBySlug(env, slug) {
  const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
  u.searchParams.set("select", "id,name,slug");
  u.searchParams.set("slug", `eq.${slug}`);
  u.searchParams.set("limit", "1");
  const r = await fetch(u.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Try to find a 10-char ASIN in a URL or raw string
function extractASIN(s) {
  if (!s) return null;
  const raw = String(s).trim();

  // Already a 10-char token?
  const mBare = raw.match(/^[A-Z0-9]{10}$/i);
  if (mBare) return mBare[0].toUpperCase();

  // Look inside a proper URL, if it is one
  try {
    const u = new URL(raw);
    const mPath =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
    if (mPath) return mPath[1].toUpperCase();

    const mQuery = u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (mQuery) return mQuery[1].toUpperCase();
  } catch {
    // not a URL; fall through
  }

  // Generic scan
  const mScan =
    raw.match(/\b([A-Z0-9]{10})\b/) ||
    raw.match(/asin[:\s-]*([A-Z0-9]{10})/i);
  return mScan ? mScan[1].toUpperCase() : null;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")     // strip accents
    .replace(/[^a-z0-9]+/g, "-")         // non-alnum -> dash
    .replace(/^-+|-+$/g, "")             // trim dashes
    .slice(0, 60);                       // keep short for URLs
}
