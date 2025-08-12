// functions/api/products.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_COLS = [
  'manufacturer',
  'product_num',
  'affiliate_link',
  'amazon_title',
  'amazon_desc',
  'my_title',
  'my_subtitle',
  'my_description_short',
  'my_description_long',
  'image_main',
  'image_small',
  'image_extra_1',
  'image_extra_2',
  'where_advertised',
  'ad_type',
  'added_by',
  'amazon_category',
  'product_type',
  'commission_l',
  'approved',
];

function normalizeRow(raw) {
  // Whitelist only columns that exist in the table
  const row = {};
  for (const k of ALLOWED_COLS) {
    if (raw[k] !== undefined) row[k] = raw[k];
  }

  // Turn empty strings into nulls (Postgres is happier)
  for (const k in row) if (row[k] === '') row[k] = null;

  // Booleans
  row.approved =
    row.approved === true ||
    row.approved === 'true' ||
    row.approved === 'on' ||
    row.approved === '1';

  // Numeric
  if (row.commission_l != null) {
    const n = Number(row.commission_l);
    row.commission_l = Number.isFinite(n) ? n : null;
  }

  return row;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const row = normalizeRow(body);

  // Basic validations (mirror the form)
  if (!row.my_title?.trim()) {
    return new Response(JSON.stringify({ error: 'my_title required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    new URL(row.image_main);
  } catch {
    return new Response(JSON.stringify({ error: 'image_main must be a valid URL' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (row.affiliate_link && !/^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test(row.affiliate_link)) {
    return new Response(JSON.stringify({ error: 'affiliate_link must be an Amazon URL' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Optional dry-run: /api/products?dry=1 echoes the row without inserting
  const dry = new URL(request.url).searchParams.get('dry');
  if (dry) {
    return new Response(JSON.stringify({ dry: true, row }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase.from('products').insert(row).select().single();

  if (error) {
    // This will show up in Cloudflare logs and be returned to the browser
    console.error('Supabase insert error:', error);
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ product: data }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

// Fallback for other methods
export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
