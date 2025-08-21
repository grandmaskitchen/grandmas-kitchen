// GET /api/admin/backup?table=products
// Downloads a JSON backup of the requested table.
// Hardened: requires Basic Auth here AND via global middleware,
// and disables any caching at the edge or browser.

export const onRequestGet = async ({ request, env }) => {
  // 1) Require auth here too (defense-in-depth)
  const auth = requireBasicAuth(request, env);
  if (auth instanceof Response) return auth; // 401

  // 2) Whitelist tables you allow to be backed up
  const url = new URL(request.url);
  const table = (url.searchParams.get("table") || "").trim();
  const ALLOW = new Set(["products", "shop_products", "categories"]);
  if (!ALLOW.has(table)) {
    return httpJSON({ error: "Invalid table" }, 400);
  }

  // 3) Pull everything from Supabase (adjust select if you want to trim)
  const sb = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  sb.searchParams.set("select", "*");

  const r = await fetch(sb.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "count=exact",
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    return httpJSON({ error: `Supabase error ${r.status}`, details: txt }, 500);
  }

  const rows = await r.json();

  // 4) Return as an attachment with strict no-cache headers
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `${table}-${ymd}.json`;

  return new Response(JSON.stringify(rows, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // absolutely no caching anywhere
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
      // make sure any cache keys distinguish by auth
      "Vary": "Authorization",
      // keep bots away just in case
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};

// ---- helpers ----

function httpJSON(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "Vary": "Authorization",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// Minimal Basic Auth check (same creds as middleware)
function requireBasicAuth(request, env) {
  const realm = env.WORKSHOP_REALM || "Workshop Admin";
  const challenge = () =>
    new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
    });

  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return challenge();

  let decoded = "";
  try {
    decoded = atob(header.slice(6)); // "user:pass"
  } catch {
    return challenge();
  }
  const idx = decoded.indexOf(":");
  const user = idx === -1 ? decoded : decoded.slice(0, idx);
  const pass = idx === -1 ? "" : decoded.slice(idx + 1);

  if (user !== env.WORKSHOP_USER || pass !== env.WORKSHOP_PASS) {
    return challenge();
  }
  // ok -> return nothing
  return null;
}
