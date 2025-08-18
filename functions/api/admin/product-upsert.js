// /functions/api/admin/product-upsert.js
// POST /api/admin/product-upsert  ->  { ok:true, product:{...} } on success

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Authenticated-User-Email"
    }
  });

export const onRequestPost = async ({ request, env }) => {
  try {
    const incoming = await request.json();

    // Map legacy keys if any
    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l",
    };

    // Allowed columns
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
      "commission_l",     // numeric
      "approved",         // boolean
      "added_by",
      "features",
      "advantages",
      "benefits",
    ]);

    // Normalize keys and drop unknowns
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
    }

    // --- Normalize affiliate link to keep DB clean ---
    if (row.affiliate_link) {
      row.affiliate_link = normalizeAffiliate(row.affiliate_link, env);
    }

    // Derive product_num from ASIN if not provided
    if (!row.product_num) {
      const asin =
        extractASIN(row.affiliate_link) ||
        extractASIN(row.amazon_title) ||
        extractASIN(row.my_title);
      if (asin) row.product_num = asin.toLowerCase();
    }
    if (!row.product_num) {
      row.product_num = slugify(row.my_title || row.amazon_title || "sku") + "-" + (Date.now() % 100000);
    }

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

    // Prefer Cloudflare Access email
    const accessEmail =
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email");
    if (accessEmail) row.added_by = accessEmail;

    // Basic validation
    if (!row.my_title || !String(row.my_title).trim()) {
      return json({ error: "my_title is required" }, 400);
    }
    try {
      if (row.image_main) new URL(row.image_main);
      else return json({ error: "image_main must be a valid URL" }, 400);
    } catch {
      return json({ error: "image_main must be a valid URL" }, 400);
    }
    if (
      row.affiliate_link &&
      !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link)
    ) {
      return json({ error: "affiliate_link must be an Amazon URL" }, 400);
    }

    // Insert
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });

    const out = await resp.json();
    if (!resp.ok) {
      return json({ error: out?.message || "Insert failed", details: out }, 400);
    }

    return json({ ok: true, product: out?.[0] ?? null }, 201);
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

// ---------- helpers ----------

function normalizeAffiliate(raw, env) {
  const s = String(raw || "").trim();
  // Keep short links exactly
  try {
    const u = new URL(s);
    const host = u.host.toLowerCase();

    // If already amzn.to, keep as-is
    if (/\bamzn\.to$/.test(host)) return s;

    // If amazon.* link, reduce to a clean DP link with a single tag param
    if (/amazon\./i.test(host)) {
      const asin =
        (u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
          u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
          u.search.match(/[?&]asin=([A-Z0-9]{10})/i) ||
          [])[1];

      if (asin) {
        const out = new URL(`https://${host}/dp/${asin.toUpperCase()}`);
        const tag =
          u.searchParams.get("tag") ||
          (env && env.AMAZON_ASSOCIATE_TAG) ||
          "";
        if (tag) out.searchParams.set("tag", tag);
        return out.toString();
      }
    }
  } catch {
    // fall through
  }
  return s; // if parsing fails, store the original
}

function extractASIN(s) {
  if (!s) return null;
  try {
    const u = new URL(s, "https://x.invalid");
    const m =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
      u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (m?.[1]) return m[1].toUpperCase();
  } catch {}
  const m2 = String(s).toUpperCase().match(/\b([A-Z0-9]{10})\b/);
  return m2 ? m2[1] : null;
}

function slugify(s = "") {
  return s
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 24);
}
