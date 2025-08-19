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

    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l",
    };

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
    ]);

    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
    }

    // --- Normalize affiliate_link: accept amzn.to, amazon.* OR bare ASIN ---
    if (typeof incoming.affiliate_link === "string") {
      const raw = incoming.affiliate_link.trim();
      const asinOnly = raw.toUpperCase().match(/^[A-Z0-9]{10}$/);
      if (asinOnly) {
        // turn a bare ASIN into a canonical product URL
        row.affiliate_link = `https://www.amazon.co.uk/dp/${asinOnly[0]}`;
      } else {
        row.affiliate_link = raw;
      }
    }

    // --- Coerce types ---
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

    // --- Validation ---
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

    // --- product_num: prefer ASIN if we can detect one; else title slug ---
    if (!row.product_num) {
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
    }

    // ---- Supabase REST upsert (on product_num) ----
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractASIN(s) {
  if (!s) return null;
  const str = String(s);
  // as URL?
  try {
    const u = new URL(str, "https://x.invalid");
    const m =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
      u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    if (m?.[1]) return m[1].toUpperCase();
  } catch {}
  // bare or embedded
  const m2 = str.toUpperCase().match(/\b([A-Z0-9]{10})\b/);
  return m2 ? m2[1] : null;
}

function slugify(s = "") {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40);
}
