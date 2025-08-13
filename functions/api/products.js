// functions/api/products.js
import { createClient } from "@supabase/supabase-js";

// (optional) simple OPTIONS handler if a browser ever does a preflight
export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email"
    }
  });

export async function onRequestPost({ request, env }) {
  try {
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const incoming = await request.json();

    // Accept old names, write to your NEW schema names
    const synonyms = {
      amazon_descr: "amazon_desc",
      commission_percentage: "commission_l"
    };

    // Your actual columns (post-rename)
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
      "commission_l",       // numeric
      "approved",           // boolean
      "added_by"
    ]);

    // Normalize keys, drop unknowns, turn "" -> null
    const row = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const dest = synonyms[k] || k;
      if (!allowed.has(dest)) continue;
      row[dest] = v === "" ? null : v;
    }

    // Types
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

    // Prefer Access email header for added_by, if present
    const accessEmail =
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email");
    if (accessEmail && !row.added_by) row.added_by = accessEmail;

    // Validation (mirrors your form)
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
      !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link)
    ) {
      return json({ error: "affiliate_link must be an Amazon URL" }, 400);
    }

    // Insert and return the created row
    const { data, error } = await supabase
      .from("products")
      .insert(row)
      .select("*")
      .single();

    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, product: data }, 201);
  } catch (err) {
    return json({ error: err?.message || "Server error" }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
