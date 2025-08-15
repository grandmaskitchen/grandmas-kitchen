// functions/api/diag.js

export async function onRequestGet({ env }) {
  const out = {
    urlOk: Boolean(env.SUPABASE_URL),
    keyOk: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    urlHost: '',
    status: null,
    body: null,
  };

  try {
    const u = new URL(env.SUPABASE_URL || 'https://example.invalid');
    out.urlHost = u.host;
  } catch {}

  if (!out.urlOk || !out.keyOk) {
    return json(out, 200); // show what’s missing
  }

  try {
    // Hit a harmless select to verify the key works
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    out.status = r.status;
    out.body = await r.text();
  } catch (e) {
    out.status = 0;
    out.body = e?.message || 'fetch error';
  }
  return json(out, 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}