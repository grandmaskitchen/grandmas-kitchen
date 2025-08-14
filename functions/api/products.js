// functions/api/products.js
// POST /api/products  (JSON body)
// Inserts a row into Supabase via REST using the SERVICE ROLE key (server-side only)

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email"
    }
  });

export const onRequestPost = async ({ request, env }) => {
  try {
    const incoming = await request.json();

    // Accept older/alternate names and normalise them to your DB columns
    const synonyms = {
      amazon_descr: "amazon_desc",
      amazon_description: "amazon_desc",
      commission_percentage: "commission_l",
      commission_percent: "commission_l",
      commission: "commission_l"
    };

    // Your actual Supabase columns
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
      "commission_l",   // numeric
      "approved",       // boolean
      "added_by"        // optional; set from Access header if present
    ]);

    // Normalise keys, drop unknowns, "" -> null
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
    }

    // Type coercions
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

    // Prefer Cloudflare Access email header for added_by (if/when you enable Access)
    const accessEmail =
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email");
    if (accessEmail && !row.added_by) row.added_by = accessEmail;

    // Basic validation (matches your form)
    if (!row.my_title || !String(row.my_title).trim()) {
      return json({ error: "my_title is required" }, 400);
    }
    try {
      new URL(row.image_main);
    } catch {
      return json({ error: "image_main must be a valid URL" }, 400);
const AMAZON_LINK_RE =
  /^(https?:\/\/)(amzn\.to|a\.co|(?:[\w-]+\.)?amazon\.[a-z.]{2,})/i;

if (row.affiliate_link && !AMAZON_LINK_RE.test(row.affiliate_link)) {
  return json(
    { error: "affiliate_link must be Amazon (amazon.* / amzn.to / a.co)" },
    400
  );
}     
      return json({ error: "affiliate_link must be an Amazon URL" }, 400);
    }

    // Insert via Supabase REST (service role key)
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
      return json(
        { error: out?.message || "Insert failed", details: out },
        400
      );
    }

    // Supabase returns an array when Prefer:return=representation
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
