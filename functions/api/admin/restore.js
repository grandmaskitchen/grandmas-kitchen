// POST /api/admin/restore  { path:"backups/YYYY/MM/DD/backup-....json" }
// Protected by BACKUP_TOKEN. Upserts products, shop_products, clicks.

export const onRequestPost = async ({ request, env }) => {
  try {
    const { path } = await request.json();
    const token = request.headers.get("X-Backup-Token") || "";
    if (!env.BACKUP_TOKEN || token !== env.BACKUP_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!path) return json({ error: "Missing path" }, 400);

    // 1) Load snapshot
    const getUrl = `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(path)}`;
    const r = await fetch(getUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) return json({ error: `Fetch snapshot failed ${r.status}` }, 500);
    const snapshot = await r.json();

    // 2) Upsert tables
    const results = {};
    for (const [table, rows] of Object.entries(snapshot.tables || {})) {
      if (!Array.isArray(rows) || rows.length === 0) { results[table] = { upserted: 0 }; continue; }
      const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
      // choose a sensible conflict target per table
      const conflict = table === "products" ? "product_num" :
                       table === "shop_products" ? "product_num" :
                       table === "clicks" ? "id" : "";
      if (conflict) url.searchParams.set("on_conflict", conflict);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(rows),
      });
      if (!resp.ok) {
        const text = await resp.text();
        results[table] = { error: text };
      } else {
        results[table] = { upserted: rows.length };
      }
    }

    return json({ ok: true, results });
  } catch (err) {
    return json({ error: err?.message || "Restore failed" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
