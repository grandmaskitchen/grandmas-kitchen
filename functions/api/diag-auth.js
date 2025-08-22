/* ---- functions/api/diag-auth.js ---- */
// GET /api/diag-auth
// Simple diag: shows whether WORKSHOP_* env vars exist and whether an Authorization header was received.

export const onRequestGet = async ({ request, env }) => {
  const auth = request.headers.get('Authorization') || '';
  let basicUser = null;
  let basicGiven = false;

  if (auth.startsWith('Basic ')) {
    basicGiven = true;
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(':');
      basicUser = idx >= 0 ? decoded.slice(0, idx) : decoded;
    } catch {}
  }

  return json({
    env_seen: {
      WORKSHOP_USER: typeof env.WORKSHOP_USER === 'string',
      WORKSHOP_PASS: typeof env.WORKSHOP_PASS === 'string'
    },
    auth_header_present: basicGiven,
    basic_user_preview: basicUser // shows only the username portion
  });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
