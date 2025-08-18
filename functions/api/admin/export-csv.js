// GET /api/admin/export-csv?q=&category=&approved=
// Returns CSV for download

export const onRequestGet = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const category = url.searchParams.get('category') || '';
    const approved = url.searchParams.get('approved') || '';

    const params = new URLSearchParams();
    params.set('select', [
      'product_num','my_title','my_subtitle','amazon_title','amazon_category',
      'affiliate_link','approved','created_at','added_by'
    ].join(','));
    params.set('order', 'created_at.desc.nullslast');
    params.set('limit', '10000');

    if (q) params.set('or', `my_title.ilike.*${q}*,amazon_title.ilike.*${q}*`);
    if (category) params.set('amazon_category', `eq.${category}`);
    if (approved === 'true' || approved === 'false') params.set('approved', `eq.${approved}`);

    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/products?${params}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      }
    });
    const rows = await r.json();
    if (!r.ok) return text(`Error: ${rows?.message || 'Query failed'}`, 400);

    const cols = ['product_num','my_title','my_subtitle','amazon_title','amazon_category','affiliate_link','approved','created_at','added_by'];
    const esc = (v) => {
      const s = (v==null)? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const csv = [
      cols.join(','),
      ...rows.map(r => cols.map(c => esc(r[c])).join(','))
    ].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="products.csv"'
      }
    });
  } catch (err) {
    return text('Error: ' + (err?.message || 'Server error'), 500);
  }
};

function text(s, status=200){ return new Response(s, {status, headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
