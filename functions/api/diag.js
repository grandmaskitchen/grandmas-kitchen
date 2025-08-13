// functions/api/diag.js
export async function onRequest({ env }) {
  const urlOk = !!env.SUPABASE_URL;
  const keyOk = !!env.SUPABASE_SERVICE_ROLE_KEY;
  let status = 0, body = "", urlHost = null;

  try {
    urlHost = new URL(env.SUPABASE_URL).host;

    // Try a tiny REST call that requires a valid key
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    status = r.status;
    body = (await r.text()).slice(0, 200); // just a peek
  } catch (e) {
    body = e?.message || String(e);
  }

  return Response.json({ urlOk, keyOk, urlHost, status, body });
}
