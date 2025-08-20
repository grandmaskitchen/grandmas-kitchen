// /functions/_middleware.js
// Basic Auth for /admin/* and /api/admin/*
//
// Set env vars in Cloudflare Pages → Settings → Environment variables:
//   WORKSHOP_USER  (secret)
//   WORKSHOP_PASS  (secret)
//   WORKSHOP_REALM (optional text shown in the login prompt; default "Workshop Admin")

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);

  // Only guard admin areas
  const protectedArea =
    pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  if (!protectedArea) return next();

  const realm = env.WORKSHOP_REALM || 'Workshop Admin';
  const user  = env.WORKSHOP_USER || '';
  const pass  = env.WORKSHOP_PASS || '';

  if (!user || !pass) {
    return new Response('Admin auth not configured', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const unauthorized = () =>
    new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`,
        'Cache-Control': 'no-store',
      },
    });

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(auth.slice(6)); // "user:pass"
  } catch {
    return unauthorized();
  }

  // Allow colon in password (split only at the first :)
  const sep = decoded.indexOf(':');
  const inUser = sep === -1 ? decoded : decoded.slice(0, sep);
  const inPass = sep === -1 ? ''      : decoded.slice(sep + 1);

  if (inUser !== user || inPass !== pass) return unauthorized();

  // Auth OK
  return next();
}
