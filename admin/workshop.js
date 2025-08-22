/* ---- admin/workshop.js ---- */
// /admin/workshop.js — full file

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
  // default: include auth cookies; avoid caches for admin calls
  const r = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...opts,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json, text };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[m]));
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
  } catch {
    return '';
  }
}

// ---------- whoami banner ----------
(async () => {
  try {
    const r = await fetch('/api/admin/whoami', {
      credentials: 'include',
      cache: 'no-store',
    });
    const { user } = await r.json();
    const el = $('#whoami');
    if (el && user) el.textContent = `You are logged in as ${user}`;
  } catch (_) {}
})();

// ---------- Home Picks: refresh 6 random ----------
$('#btnRefreshPicks')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Refreshing…';

  const { ok, status, json } = await fetchJSON('/api/admin/home-picks-refresh', {
    method: 'POST',
  });
  log('home-picks-refresh', { ok, status, json });

  const out = $('#picksOut');
  if (ok) {
    alert(`✅ Home picks updated (${json.inserted ?? 0} items).`);
    if (out) out.innerHTML = `<small>Inserted: ${json.inserted ?? 0}</small>`;
  } else {
    alert(`❌ Refresh failed (${status})${json?.error ? `\n${json.error}` : ''}`);
    if (out) out.innerHTML = `<small>Error: ${status}</small>`;
  }

  btn.disabled = false;
  btn.textContent = label;
});

// ---------- diagnostics ----------
$('#btnDiagProducts')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=products');
  log('diag products', { ok, status, json });
  const el = $('#diagOut');
  if (el) el.innerHTML = `<small>Status: ${status}</small>`;
});

$('#btnDiagShop')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=shop_products');
  log('diag shop_products', { ok, status, json });
  const el = $('#diagOut');
  if (el) el.innerHTML = `<small>Status: ${status}</small>`;
});

// ---------- stats ----------
$('#btnStats')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/admin/stats');
  log('stats', { ok, status, json });
  const el = $('#diagOut');
  if (!el) return;
  el.innerHTML = ok
    ? `<small>products: ${json.products?.count ?? 0}, shop_products: ${json.shop_products?.count ?? 0}, env: ${json.envOk ? 'OK' : 'MISSING'}</small>`
    : `<small>Stats error: ${status}</small>`;
});

// ---------- backups (download JSON) ----------
document.querySelectorAll('.btnBackup').forEach(btn => {
  btn.addEventListener('click', async () => {
    const table = btn.dataset.table;
    const file = `${table}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`;

    const r = await fetch(`/api/admin/backup?table=${encodeURIComponent(table)}`, {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!r.ok) {
      let msg = '';
      try { const j = await r.json(); msg = j?.error || ''; } catch {}
      alert(`Backup failed (${r.status})${msg ? `\n${msg}` : ''}`);
      log('backup failed', { table, status: r.status, msg });
      return;
    }

    const blob = await r.blob();
    log('backup ok', { table, status: r.status, size: blob.size });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    URL.revokeObjectURL(a.href);
  });
});

// ======================================================================
//                           TEST FETCH CARD
// ======================================================================
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
