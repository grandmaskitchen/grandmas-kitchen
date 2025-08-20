// Global middleware for Cloudflare Pages Functions
// Protects /admin/* pages and /api/admin/* endpoints with HTTP Basic Auth.
// Set env vars WORKSHOP_USER and WORKSHOP_PASS in Cloudflare Pages → Settings → Environment variables.

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const p = url.pathname;

  // Only guard these areas
  const protect =
    p.startsWith('/admin/') ||           // static Workshop pages
    p.startsWith('/api/admin/');         // admin APIs (backup, stats, home-picks, etc.)

  if (!protect) return next();

  // Expect Basic auth
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const [user, pass] = atob(header.slice(6)).split(':');
      if (user === env.WORKSHOP_USER && pass === env.WORKSHOP_PASS) {
        return next(); // OK
      }
    } catch {}
  }

  // Challenge
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Workshop Admin"' }
  });
}
