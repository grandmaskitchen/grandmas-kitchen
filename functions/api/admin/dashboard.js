export const onRequestGet = () =>
  new Response(`<!doctype html><html><head><meta charset="utf-8">
  <title>Admin Dashboard</title></head><body>…your HTML…</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
