export const onRequestGet = async ({ request }) => {
  const auth = request.headers.get('Authorization') || '';
  let user = null;

  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(':');
      user = idx === -1 ? decoded : decoded.slice(0, idx);
    } catch {}
  }

  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
