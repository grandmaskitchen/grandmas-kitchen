/* ---- admin/workshop.js ---- */

// ---------- tiny helpers ----------
const $ = (sel) => document.querySelector(sel);
const debugBox = $('#debugBox');

function log(title, obj) {
  const line =
    `\n\n=== ${title} ===\n` +
    (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  if (debugBox) debugBox.textContent += line;
  try { console.log(title, obj); } catch {}
}

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json, text };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}
function extractASIN(s) {
  if (!s) return '';
  const str = String(s).trim();
  if (/^[A-Z0-9]{10}$/i.test(str)) return str.toUpperCase();
  try {
    const u = new URL(str, 'https://x.invalid');
    const m =
      u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
      u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
      u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    return (m && m[1] && m[1].toUpperCase()) || '';
  } catch { return ''; }
}

// ---------- whoami banner ----------
(async () => {
  try {
    const r = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
    const { user } = await r.json();
    const el = $('#whoami');
    if (el && user) el.textContent = `You are logged in as ${user}`;
  } catch (_) {}
})();

// ---------- TEST FETCH CARD ----------
const testForm = $('#testFetchForm');
const testInput = $('#testFetchInput');
const testOut = $('#testFetchOut');

testForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = (testInput?.value || '').trim();
  if (!input) { alert('Paste an Amazon URL or a 10-char ASIN'); return; }

  testOut.innerHTML = '<small>Fetching…</small>';

  const { ok, status, json, text } = await fetchJSON('/api/admin/amazon-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  if (!ok) {
    const msg = json?.error?.message || json?.error || text || 'Unknown error';
    testOut.innerHTML = `<small style="color:#a00">Error ${status}: ${esc(msg)}</small>`;
    log('test-fetch ERROR', { status, msg, json });
    return;
  }

  const s = json.scraped || {};
  log('test-fetch OK (scraped)', s);

  const asin = extractASIN(s.affiliate_link || input);
  const image = s.image_main || s.image_small || '';
  const title = s.amazon_title || '';
  const cat   = s.amazon_category || '';

  testOut.innerHTML = `
    <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start">
      <div>
        ${image ? `<img src="${esc(image)}" alt="" style="max-width:120px;border:1px solid #eee;border-radius:8px;background:#fff">` : '<div class="muted"><small>No image</small></div>'}
      </div>
      <div>
        <div><b>Title:</b> ${esc(title || '—')}</div>
        <div><b>ASIN:</b> <code>${esc(asin || '—')}</code></div>
        <div><b>Category:</b> ${esc(cat || '—')}</div>
        <div><b>Image URL:</b> ${image ? `<a href="${esc(image)}" target="_blank" rel="noopener">open</a>` : '—'}</div>
        <div><b>Affiliate Link:</b> ${s.affiliate_link ? `<a href="${esc(s.affiliate_link)}" target="_blank" rel="noopener">open</a>` : esc(input)}</div>
      </div>
    </div>

    <details style="margin-top:.5rem">
      <summary>Raw JSON</summary>
      <pre style="white-space:pre-wrap;background:#fff;border:1px solid #eee;border-radius:8px;padding:8px;margin-top:.5rem">${esc(JSON.stringify(s, null, 2))}</pre>
    </details>

    <div style="margin-top:.5rem">
      <a class="btn small" href="/admin/add-product.html?link=${encodeURIComponent(input)}" target="_blank" rel="noopener">Open “Add Product”</a>
    </div>
  `;
});
