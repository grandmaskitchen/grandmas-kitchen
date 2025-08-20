// POST /api/admin/backup        (manual)
// GET  /api/admin/backup?run=1  (allows GET when run=1 present)
// Saves JSON snapshot of key tables to Supabase Storage: backups/YYYY/MM/DD/backup-<timestamp>.json

export const onRequest = async ({ request, env }) => {
  try {
    // --- auth: require token header or ?token= ---
    const url = new URL(request.url);
    const token =
      request.headers.get("X-Backup-Token") ||
      url.searchParams.get("token") ||
      "";
    if (!env.BACKUP_TOKEN || token !== env.BACKUP_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Allow GET only if explicitly asked (so you can hit it from a browser with ?run=1&token=...)
    if (request.method !== "POST" && !(request.method === "GET" && url.searchParams.get("run") === "1")) {
      return json({ error: "Use POST (or GET with ?run=1)" }, 405);
    }

    // --- which tables to snapshot
    const TABLES = ["products", "shop_products", "clicks"]; // include what you want captured

    // fetch a full copy of each table
    const snapshot = { meta: {}, tables: {} };
    snapshot.meta.created_at = new Date().toISOString();
    snapshot.meta.project = env.SUPABASE_URL;

    for (const t of TABLES) {
      const rows = await fetchAllRows(env, t);
      snapshot.tables[t] = rows;
    }

    const body = JSON.stringify(snapshot);
    const { path, size } = await saveToStorage(env, body);

    return json({
      ok: true,
      saved: { path, bytes: size, tables: Object.keys(snapshot.tables) },
    });
  } catch (err) {
    return json({ error: err?.message || "Backup failed" }, 500);
  }
};

async function fetchAllRows(env, table) {
  const base = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
  // you can limit columns if you like; select=*
  base.searchParams.set("select", "*");
  base.searchParams.set("order", "id.asc");
  // paginate in case table grows
  const pageSize = 1000;
  let from = 0;
  let out = [];
  while (true) {
    const url = new URL(base);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(from));
    const r = await fetch(url.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact",
      },
    });
    if (!r.ok) throw new Error(`Fetch ${table} failed ${r.status}`);
    const chunk = await r.json();
    out = out.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function saveToStorage(env, body) {
  // backups/YYYY/MM/DD/backup-<timestamp>.json
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const path = `backups/${yyyy}/${mm}/${dd}/backup-${ts}.json`;

  const url = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(path)}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "x-upsert": "true",
    },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Storage put failed ${r.status} ${text}`);
  }
  return { path, size: body.length };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
