export async function onRequest(context) {
  const url = new URL(context.request.url);
  const res = await context.next();
  const r = new Response(res.body, res);

  if (url.pathname.startsWith('/admin/')) {
    r.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    r.headers.set('Pragma', 'no-cache');
    r.headers.set('Expires', '0');
    r.headers.set('X-Robots-Tag', 'noindex, nofollow');
    r.headers.set('X-Admin-MW', 'hit'); // debug header so we know this ran
  }

  return r;
}
