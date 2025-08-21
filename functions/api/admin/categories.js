// /functions/api/admin/categories.js
// GET  /api/admin/categories        -> list categories
// POST /api/admin/categories {name} -> create (or return existing) category

export const onRequestOptions = ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
    },
  });

export const onRequestGet = async ({ env }) => {
  try {
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
    u.searchParams.set("select", "id,name,slug");
    u.searchParams.set("order", "name.asc");

    const r = await fetch(u.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) return json({ error: "Supabase list failed" }, 500);
    const rows = await r.json();
    return json({ items: rows || [] });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const { name } = await request.json();
    const clean = String(name || "").trim();
    if (!clean) return json({ error: "name is required" }, 400);

    const slug = slugify(clean);

    // Upsert on slug (so duplicate names don’t explode)
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
    u.searchParams.set("on_conflict", "slug");

    const r = await fetch(u.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify([{ name: clean, slug }]),
    });

    const out = await r.json();
    if (!r.ok) {
      return json({ error: out?.message || "Create failed", details: out }, 400);
    }

    // representation returns an array
    const cat = Array.isArray(out) ? out[0] : out;
    return json({ ok: true, category: cat }, 201);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
