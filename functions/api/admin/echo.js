// POST an object here to see exactly what the browser is sending
export const onRequestPost = async ({ request }) => {
  let bodyText = await request.text();
  let json = null;
  try { json = JSON.parse(bodyText); } catch {}

  return new Response(JSON.stringify({
    receivedType: request.headers.get("content-type") || null,
    rawBody: bodyText,
    parsed: json
  }), { headers: { "Content-Type": "application/json" }});
};
