// Cloudflare Pages Function: POST /api/admin/product-upsert
// Upserts into Supabase "products" (on_conflict=product_num) and returns the row.

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

    // Map any legacy keys -> current DB names
    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l"
    };

    // Columns allowed to be written (must match your Supabase table)
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
      "features",
      "advantages",
      "benefits"
    ]);

    // Normalize + filter unknowns ("" -> null)
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
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

    // Prefer Cloudflare Access email for added_by
    const accessEmail =
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email");
    if (accessEmail && !row.added_by) row.added_by = accessEmail;

    // Basic validation (matches your table NOT NULLs)
    if (!row.my_title || !String(row.my_title).trim()) {
      return json({ error: "my_title is required" }, 400);
    }
    try {
      new URL(row.image_main);
    } catch {
      return json({ error: "image_main must be a valid URL" }, 400);
    }
    if (row.affiliate_link && !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link)) {
      return json({ error: "affiliate_link must be an Amazon URL" }, 400);
    }

    // Ensure a product_num for upsert key if user didn’t provide one
    if (!row.product_num) {
      row.product_num = slugify(row.my_title) + "-" + Date.now().toString(36).slice(-4);
    }

    // ---- Supabase REST upsert ----
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    url.searchParams.set("on_conflict", "product_num");

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        // upsert + return row
        Prefer: "return=representation,resolution=merge-duplicates"
      },
      // Upsert requires an array payload
      body: JSON.stringify([row])
    });

    const out = await resp.json();
    if (!resp.ok) {
      // Bubble up the exact Supabase error so you can see what’s wrong
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
    headers: { "Content-Type": "application/json" }
  });
}

function slugify(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
