export const onRequestGet = async ({ env }) => {
  const out = {
    urlOk: !!env.SUPABASE_URL,
    keyOk: !!env.SUPABASE_SERVICE_ROLE_KEY,
    status: null,
    body: null,
  };
  if (!out.urlOk || !out.keyOk) return json(out);

  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    out.status = r.status;
    out.body = await r.text();
  } catch (e) {
    out.status = 0;
    out.body = e?.message || 'fetch error';
  }
  return json(out);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
