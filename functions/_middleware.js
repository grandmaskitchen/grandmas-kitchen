// Global middleware for Cloudflare Pages Functions
// Protects /admin/* pages and /api/admin/* endpoints with HTTP Basic Auth.
//
// Set env vars in Cloudflare Pages → Settings → Environment variables:
//   WORKSHOP_USER = your username (e.g. "gary")
//   WORKSHOP_PASS = your strong password (avoid leading/trailing spaces)
// Optional:
//   WORKSHOP_REALM = 'Workshop Admin' (text shown in the login prompt)

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const p = url.pathname;

  // Only protect these areas
  const protect = p.startsWith('/admin/') || p.startsWith('/api/admin/');

  if (!protect) {
    return next();
  }

  const realm = env.WORKSHOP_REALM || 'Workshop Admin';
  const challenge = () =>
    new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': `Basic realm="${realm}"` }
    });

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) {
    return challenge();
  }

  try {
    // Decode "user:pass" (allow ':' inside the password)
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(':');
    const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
    const pass = idx >= 0 ? decoded.slice(idx + 1) : '';

    // Compare to env
    if (user === env.WORKSHOP_USER && pass === env.WORKSHOP_PASS) {
      return next();
    }
  } catch {
    // fall through
  }

  return challenge();
}
