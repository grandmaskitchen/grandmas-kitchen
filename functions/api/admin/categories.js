// /functions/api/admin/categories.js
// GET  /api/admin/categories        -> list categories
// POST /api/admin/categories {name} -> create (or return existing) category
// NOTE: No on_conflict param; we "get-or-create" by slug to avoid schema requirement.

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

    // 1) Try to find existing by slug
    {
      const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
      u.searchParams.set("select", "id,name,slug");
      u.searchParams.set("slug", `eq.${slug}`);
      u.searchParams.set("limit", "1");
      const r0 = await fetch(u.toString(), {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      if (!r0.ok) return json({ error: "Lookup failed" }, 500, request);
      const rows = await r0.json();
      if (Array.isArray(rows) && rows[0]) {
        return json({ ok: true, category: rows[0], existed: true }, 200, request);
      }
    }

    // 2) Create (no on_conflict — works even if slug is not UNIQUE)
    {
      const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
      const r1 = await fetch(u.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify([{ name: clean, slug }]),
      });

      const out = await r1.json();
      if (r1.ok) {
        const cat = Array.isArray(out) ? out[0] : out;
        return json({ ok: true, category: cat }, 201, request);
      }

      // If you later add a UNIQUE(slug) and two admins race, we may get 409 here.
      // Handle by re-reading the row and returning it.
      if (r1.status === 409 || /duplicate key/i.test(out?.message || "")) {
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

      return json(
        { error: out?.message || "Create failed", details: out },
        400,
        request
      );
    }
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
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
