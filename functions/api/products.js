// functions/api/products.js
import { createClient } from "@supabase/supabase-js";

export async function onRequestPost(ctx) {
  try {
    const { request, env } = ctx;

    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // incoming form JSON
    const incoming = await request.json();

    // map old field names -> table column names
    const keyMap = {
      amazon_desc: "amazon_descr",
      commission_l: "commission_percentage",
    };

    // allow-list of real DB columns
    const allowed = [
      "manufacturer",
      "product_num",
      "affiliate_link",
      "amazon_title",
      "amazon_descr",
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
      "commission_percentage",
      "approved",
      "added_by",
    ];

    // normalize + pick only allowed keys
    const payload = {};
    for (const [k, v] of Object.entries(incoming || {})) {
      const key = keyMap[k] ?? k;
      if (!allowed.includes(key)) continue;
      payload[key] = v;
    }

    // type coercions
    if (payload.commission_percentage !== undefined && payload.commission_percentage !== "") {
      payload.commission_percentage = Number(payload.commission_percentage);
      if (Number.isNaN(payload.commission_percentage)) delete payload.commission_percentage;
    }
    payload.approved = !!payload.approved;

    // if Cloudflare Access is enabled later, this header will be present:
    const cfEmail = ctx.request.headers.get("Cf-Access-Authenticated-User-Email");
    if (cfEmail && !payload.added_by) payload.added_by = cfEmail;

    // basic required checks that match your form
    if (!payload.my_title?.trim()) {
      return new Response("Missing my_title", { status: 400 });
    }
    try { new URL(payload.image_main); } catch { 
      return new Response("image_main must be a valid URL", { status: 400 });
    }
    if (payload.affiliate_link && !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(payload.affiliate_link)) {
      return new Response("affiliate_link must be an Amazon URL", { status: 400 });
    }

    const { data, error } = await supabase
      .from("products")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      // bubble the specific DB error up to the browser for quick debugging
      return new Response(error.message, { status: 400 });
    }

    return Response.json({ product: data });
  } catch (err) {
    return new Response(err?.message || "Unknown error", { status: 500 });
  }
}
