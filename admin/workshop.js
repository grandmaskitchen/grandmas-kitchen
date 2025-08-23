/* ---- admin/workshop.js ---- */
console.log('workshop.js build v2025-08-23-1');

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

// ---------- Home Picks ----------
$('#btnRefreshPicks')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Refreshing…';

  const { ok, status, json } = await fetchJSON('/api/admin/home-picks-refresh', { method: 'POST' });
  log('home-picks-refresh', { ok, status, json });
  const out = $('#picksOut');
  if (ok) {
    alert(`✅ Home picks updated (${json.inserted ?? 0} items).`);
    if (out) out.innerHTML = `<small>Inserted: ${json.inserted ?? 0}</small>`;
  } else {
    alert(`❌ Refresh failed (${status})${json?.error ? `\n${json.error}` : ''}`);
    if (out) out.innerHTML = `<small>Error: ${status}</small>`;
  }

  btn.disabled = false; btn.textContent = label;
});

// ---------- diagnostics ----------
$('#btnDiagProducts')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=products');
  log('diag products', { ok, status, json });
  const el = $('#diagOut'); if (el) el.innerHTML = `<small>Status: ${status}</small>`;
});
$('#btnDiagShop')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=shop_products');
  log('diag shop_products', { ok, status, json });
  const el = $('#diagOut'); if (el) el.innerHTML = `<small>Status: ${status}</small>`;
});
$('#btnStats')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/admin/stats');
  log('stats', { ok, status, json });
  const el = $('#diagOut');
  if (el) el.innerHTML = ok
    ? `<small>products: ${json.products?.count ?? 0}, shop_products: ${json.shop_products?.count ?? 0}, env: ${json.envOk ? 'OK' : 'MISSING'}</small>`
    : `<small>Stats error: ${status}</small>`;
});

// ---------- backups ----------
document.querySelectorAll('.btnBackup').forEach(btn => {
  btn.addEventListener('click', async () => {
    const table = btn.dataset.table;
    const file = `${table}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`;

    const r = await fetch(`/api/admin/backup?table=${encodeURIComponent(table)}`, {
      credentials: 'include', cache: 'no-store',
    });
    if (!r.ok) {
      let msg = ''; try { const j = await r.json(); msg = j?.error || ''; } catch {}
      alert(`Backup failed (${r.status})${msg ? `\n${msg}` : ''}`);
      log('backup failed', { table, status: r.status, msg }); return;
    }
    const blob = await r.blob();
    log('backup ok', { table, status: r.status, size: blob.size });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = file; a.click(); URL.revokeObjectURL(a.href);
  });
});

// ---------- Test fetch card ----------
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
    </div>`;
  // Keep the “Open Add Product” link in the HTML page; we only set its href here.
  const addLink = $('#openAddProduct');
  if (addLink) addLink.href = '/admin/add-product.html?prefill=' + encodeURIComponent(input);
});

// ---------- Category Manager ----------
(async function renderCategoryManager(){
  const box = document.getElementById('catMgr');
  if (!box) return;

  async function load() {
    box.innerHTML = '<small>Loading…</small>';
    const r = await fetch('/api/admin/categories', { credentials:'include', cache:'no-store' });
    const j = await r.json();
    if (!r.ok) { box.innerHTML = `<small style="color:#a00">${j?.error||'Error'}</small>`; return; }
    const items = Array.isArray(j.items)? j.items : [];
    if (!items.length) { box.innerHTML = '<small>No categories yet.</small>'; return; }
    box.innerHTML = items.map(c => `
      <div class="row" style="align-items:center;gap:8px;margin:.3rem 0" data-id="${c.id}">
        <input class="rename" value="${c.name.replace(/"/g,'&quot;')}" style="flex:1">
        <button class="save">Rename</button>
        <select class="reassign"><option value="">— Reassign to… —</option>
          ${items.filter(x=>x.id!==c.id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}
        </select>
        <button class="del" style="background:#b33">Delete</button>
      </div>
    `).join('');
  }
  await load();

  box.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const id = row.dataset.id;

    if (e.target.classList.contains('save')) {
      const name = row.querySelector('.rename').value.trim();
      if (!name) return alert('Name required');
      const r = await fetch(`/api/admin/categories/${encodeURIComponent(id)}`, {
        method:'PATCH', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
      const j = await r.json();
      if (!r.ok) return alert(j?.error||'Rename failed');
      alert('Renamed ✔'); await load();
    }

    if (e.target.classList.contains('del')) {
      const to = row.querySelector('.reassign').value || '';
      if (!confirm(`Delete this category${to?` (reassign products first)`:''}?`)) return;
      const url = new URL(`/api/admin/categories/${encodeURIComponent(id)}`, location.origin);
      if (to) url.searchParams.set('reassign_to', to);
      const r = await fetch(url.toString(), { method:'DELETE', credentials:'include' });
      const j = await r.json();
      if (!r.ok) return alert(j?.error||'Delete failed');
      alert('Deleted ✔'); await load();
    }
  });
})();

// ---------- Product quick-delete ----------
document.getElementById('btnDelProd')?.addEventListener('click', async () => {
  const pn = (document.getElementById('delProdNum')?.value || '').trim().toLowerCase();
  if (!pn) return alert('Enter product_num');
  if (!confirm(`Delete product ${pn}?`)) return;
  const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}`, {
    method:'DELETE', credentials:'include'
  });
  const j = await r.json();
  if (!r.ok) return alert(j?.error||'Delete failed');
  alert('Deleted ✔');
});

// ---------- Archived (restore) ----------
(async function archivedManager(){
  const box = document.getElementById('archivedBox');
  if (!box) return;

  async function load() {
    const r = await fetch('/api/admin/products/list?archived=1&limit=200', {
      credentials:'include', cache:'no-store'
    });
    const j = await r.json();
    if (!r.ok) { box.innerHTML = `<small style="color:#a00">${j?.error||'Error loading'}</small>`; return; }
    const items = Array.isArray(j.items) ? j.items : [];
    if (!items.length) { box.innerHTML = `<small>Nothing archived.</small>`; return; }

    box.innerHTML = items.map(p => `
      <div class="row" style="gap:8px;align-items:center;margin:.3rem 0" data-pn="${p.product_num}">
        <img src="${(p.image_main||'').replace(/"/g,'&quot;')}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #eee">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(p.my_title||p.amazon_title||'').replace(/</g,'&lt;')}</div>
          <div class="muted"><code>${p.product_num}</code>${p.amazon_category?` • ${p.amazon_category}`:''}</div>
        </div>
        <button class="btn-restore">Restore</button>
      </div>
    `).join('');
  }
  await load();

  box.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btn-restore')) return;
    const row = e.target.closest('[data-pn]'); if (!row) return;
    const pn = row.dataset.pn;
    const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}/archive`, {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ restore: 1 })
    });
    const j = await r.json();
    if (!r.ok) { alert(j?.error||'Restore failed'); return; }
    row.remove();
  });
})();
