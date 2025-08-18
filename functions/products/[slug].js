// Matches /products/<anything> and serves /products/_template.html
export const onRequestGet = async ({ request, env }) => {
  const u = new URL(request.url);
  u.pathname = '/products/_template.html';
  return env.ASSETS.fetch(new Request(u.toString(), request));
};
