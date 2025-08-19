export const onRequestGet = async ({ env }) => {
  const out = {
    urlOk: !!env.SUPABASE_URL,
    keyOk: !!env.SUPABASE_SERVICE_ROLE_KEY,
    urlHost: "", products: { total: null }, shop: { total: null },
    status: null, msg: null
  };

  try { out.urlHost = new URL(env.SUPABASE_URL || "https://x.invalid").host; } catch {}

  // helper to count rows by reading Content-Range header
  async function countRows(table) {
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("select", "id");
    const r = await fetch(url.toString(), {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "count=exact"
      }
    });
    const range = r.headers.get("content-range") || "0/0";
    const total = Number((range.split("/")[1] || "0"));
    return { ok: r.ok, total, status: r.status, body: await r.text() };
  }

  try {
    const p = await countRows("products");          // old table (optional)
    const s = await countRows("shop_products");     // new lean table
    out.products.total = p.total;
    out.shop.total = s.total;
    out.status = 200;
  } catch (e) {
    out.status = 500;
    out.msg = e?.message || "diag failed";
  }

  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" }});
};
