// functions/api/diag.js
export async function onRequest({ env }) {
  const urlOk = !!env.SUPABASE_URL;
  const keyOk = !!env.SUPABASE_SERVICE_ROLE_KEY;
  let canAuth = false, urlHost = null;

  try {
    urlHost = new URL(env.SUPABASE_URL).host;
    // Call a public auth health endpoint but include the headers;
    // if the key is valid, Supabase will return 200
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    canAuth = r.ok;
  } catch (_) {}

  return Response.json({ urlOk, keyOk, canAuth, urlHost });
}
