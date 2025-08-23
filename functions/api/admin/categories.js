// /functions/api/admin/categories.js
// GET  /api/admin/categories        -> { items:[{id,name,slug}, ...] }
// POST /api/admin/categories {name} -> { ok:true, category:{...} }  (upsert by slug)

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

export const onRequestGet = async ({ env, request }) => {
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
    if (!r.ok) return json({ error: "Supabase list failed" }, 500, request);
    const rows = await r.json();
    return json({ items: rows || [] }, 200, request);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500, request);
  }
};

export const onRequestPost = async ({ request, env }) => {
  try {
    const { name } = await request.json();
    const clean = String(name || "").trim();
    if (!clean) return json({ error: "name is required" }, 400, request);

    const slug = slugify(clean);

    // Upsert on slug (works now that UNIQUE(slug) exists)
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
    if (r.ok) {
      const cat = Array.isArray(out) ? out[0] : out;
      return json({ ok: true, category: cat }, 201, request);
    }

    // If duplicate race still triggers 409, fetch the row and return it
    if (r.status === 409 || /duplicate key/i.test(out?.message || "")) {
      const u2 = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
      u2.searchParams.set("select", "id,name,slug");
      u2.searchParams.set("slug", `eq.${slug}`);
      u2.searchParams.set("limit", "1");
      const r2 = await fetch(u2.toString(), {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      const rows2 = await r2.json();
      if (r2.ok && Array.isArray(rows2) && rows2[0]) {
        return json({ ok: true, category: rows2[0], existed: true }, 200, request);
      }
    }

    return json({ error: out?.message || "Create failed", details: out }, 400, request);
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500, request);
  }
};

function json(obj, status = 200, request) {
  const origin = request?.headers?.get?.("Origin") || "*";
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Cache-Control": "no-store",
    },
  });
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")      // strip accents
    .replace(/[^a-z0-9]+/g, "-")          // non-alnum -> dash
    .replace(/^-+|-+$/g, "")              // trim dashes
    .slice(0, 60);
}
