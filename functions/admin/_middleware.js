export async function onRequest(context) {
  const res = await context.next();
  const r = new Response(res.body, res);

  // Strict no-cache + noindex for all /admin/* pages
  r.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  r.headers.set('Pragma', 'no-cache');
  r.headers.set('Expires', '0');
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');

  return r;
}
