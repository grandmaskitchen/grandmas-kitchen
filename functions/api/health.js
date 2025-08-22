/* ---- functions/api/health.js ---- */
export const onRequestGet = () => new Response(JSON.stringify({
  ok: true, service: "grandmaskitchen", time: new Date().toISOString()
}), { headers: { "Content-Type": "application/json" }});
