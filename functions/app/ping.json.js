// GET /app/ping.json  — simple route check
export const onRequestGet = () =>
  new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { 'Content-Type': 'application/json' }
  });
