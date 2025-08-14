// functions/api/amazon-fetch.js
// POST { input: "<ASIN or Amazon URL>", marketplace?: "uk" | "us" | "ca" | ... }
// Needs env.RAINFOREST_API_KEY (Pages → Settings → Variables & Secrets)

export async function onRequestPost({ request, env }) {
  if (!env.RAINFOREST_API_KEY) {
    return new Response('Missing RAINFOREST_API_KEY', { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Send JSON: { "input": "<asin or url>" }', { status: 400 });
  }

  const raw = (body?.input || '').trim();
  if (!raw) return new Response('Provide "input" (ASIN or Amazon URL)', { status: 400 });

  // pick marketplace / domain
  const domainFromUrl = (() => {
    try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return null; }
  })();
  const normDomain = (h) => {
    if (!h) return null;
    const m = h.match(/amazon\.[a-z.]+$/i);
    return m ? m[0].toLowerCase() : null;
  };
  const mapMarket = (m) => ({
    us: 'amazon.com',
    uk: 'amazon.co.uk',
    ca: 'amazon.ca',
    de: 'amazon.de',
    fr: 'amazon.fr',
    it: 'amazon.it',
    es: 'amazon.es',
    au: 'amazon.com.au',
    jp: 'amazon.co.jp',
    in: 'amazon.in',
    mx: 'amazon.com.mx',
  }[String(m || '').toLowerCase()] || null);

  const amazon_domain =
    mapMarket(body?.marketplace) || normDomain(domainFromUrl) || 'amazon.co.uk';

  // Build Rainforest request
  const base = 'https://api.rainforestapi.com/request';
  const qs = new URLSearchParams({
    api_key: env.RAINFOREST_API_KEY,
    type: 'product',
    amazon_domain,
  });

  if (/^https?:\/\//i.test(raw)) {
    qs.set('url', raw);
  } else {
    // treat as ASIN, strip non-alphanum, take first 10 chars
    const asin = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
    if (!/^[A-Z0-9]{10}$/.test(asin)) {
      return new Response('Input does not look like a valid ASIN', { status: 400 });
    }
    qs.set('asin', asin);
  }

  const rfRes = await fetch(`${base}?${qs.toString()}`);
  const rfJson = await rfRes.json().catch(() => ({}));

  if (!rfRes.ok) {
    return new Response(
      JSON.stringify({ error: rfJson?.error || rfJson }),
      { status: rfRes.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const p = rfJson?.product || rfJson;

  // Extract clean fields for your form
  const amazon_title = p?.title || '';
  let amazon_desc = p?.description || '';
  if (!amazon_desc && Array.isArray(p?.feature_bullets)) {
    amazon_desc = p.feature_bullets.join('\n');
  }

  const images = Array.isArray(p?.images) ? p.images : [];
  const first = p?.main_image?.link || images[0]?.link || '';
  const second = images[1]?.link || '';
  const third  = images[2]?.link || '';

  const amazon_category =
    (Array.isArray(p?.categories) && (p.categories.at(-1)?.name || p.categories[0]?.name)) ||
    p?.category || '';

  const payload = {
    amazon_title,
    amazon_desc,
    image_main: first,
    image_small: first,          // you can change this to a smaller asset later
    image_extra_1: second,
    image_extra_2: third,
    amazon_category,
    affiliate_canonical: p?.link || p?.canonical_url || ''
  };

  return new Response(JSON.stringify({ scraped: payload, source: { amazon_domain } }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
