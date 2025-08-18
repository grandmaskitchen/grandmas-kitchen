// DELETE /api/admin/product-delete?product_num=acv001

export const onRequestDelete = async ({ request, env }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('product_num');
  if (!slug) return json({ error: 'product_num required' }, 400);

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?product_num=eq.${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal'
    }
  });

  if (!r.ok) {
    const t = await r.text();
    return json({ error: t || 'Delete failed' }, 400);
  }
  return json({ ok: true });
};

function json(obj, status=200){ return new Response(JSON.stringify(obj), {status, headers:{'Content-Type':'application/json'}}); }
