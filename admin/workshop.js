/* ---- admin/workshop.js — v3 (compact categories, counts, pagination, inline editor) ---- */

// ---------- tiny helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const debugBox = $('#debugBox');

function log(title, obj) {
  const line = `\n\n=== ${title} ===\n` + (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  if (debugBox) debugBox.textContent += line;
  try { console.log(title, obj); } catch {}
}

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json, text, headers: r.headers };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}
function extractASIN(s) {
  if (!s) return '';
  const str = String(s).trim();
  if (/^[A-Z0-9]{10}$/i.test(str)) return str.toUpperCase();
  try {
    const u = new URL(str, 'https://x.invalid');
    const m = u.pathname.match(/\/dp\/([A-Z0-9]{10})/i) || u.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i) || u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
    return (m && m[1] && m[1].toUpperCase()) || '';
  } catch { return ''; }
}

// ---------- whoami banner ----------
(async () => {
  try {
    const r = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
    const j = await r.json();
    const el = $('#whoami');
    if (el && j && j.user) el.textContent = `You are logged in as ${j.user}`;
  } catch (_) {}
})();

// ========== Category Manager (compact + counts + pagination + inline editor) ==========
(async function renderCategoryManager(){
  const box = document.getElementById('catMgr');
  if (!box) return;

  const PAGE = 12;
  let items = [];
  let filtered = [];
  let page = 1;

  // Shell UI
  function shell(){
    return `
      <div class="row" style="gap:6px;align-items:center;margin-bottom:.4rem">
        <input id="catSearch" type="text" placeholder="Filter categories…" aria-label="Filter categories" style="flex:1;min-width:120px">
        <button id="catNew" class="btn secondary" type="button">New</button>
      </div>
      <div class="table-wrap">
        <table class="compact" aria-label="Categories">
          <thead><tr><th style="width:66%">Name</th><th style="width:14%">Items</th><th style="width:20%;text-align:right">Actions</th></tr></thead>
          <tbody id="catTbody"><tr><td colspan="3" class="muted">Loading…</td></tr></tbody>
        </table>
      </div>
      <div class="row" id="catPager" style="justify-content:space-between;margin-top:.35rem">
        <small id="catCount" class="muted">—</small>
        <div>
          <button id="catPrev" class="iconbtn" type="button" aria-label="Previous">◀</button>
          <span id="catPage" class="muted" style="margin:0 .4rem">1/1</span>
          <button id="catNext" class="iconbtn" type="button" aria-label="Next">▶</button>
        </div>
      </div>
      <style>
        #catMgr table.compact th, #catMgr table.compact td { padding:.35rem .5rem; }
        #catMgr .iconbtn{ background:#eee; color:#222; border:0; border-radius:6px; padding:.25rem .45rem; font-size:.9rem; }
        #catMgr .iconbtn:hover{ background:#e2e2e2; }
        #catMgr .pill-count{display:inline-block;background:#eef3ee;color:#2f5130;border-radius:999px;padding:.05rem .4rem;font-size:.8rem}
        #catMgr .row-edit{display:flex;gap:6px;align-items:center}
        #catMgr .row-edit input{flex:1;min-width:80px;padding:.35rem .45rem;border:1px solid #cfcfcf;border-radius:6px}
        #catMgr .btn-mini{background:#ddd;color:#222;border:0;border-radius:6px;padding:.25rem .5rem}
      </style>
    `;
  }

  // Fetch list (optionally with counts)
  async function fetchItemsWithCounts(){
    // Try include=count first
    let url = new URL('/api/admin/categories', location.origin);
    url.searchParams.set('include', 'count');
    const r = await fetchJSON(url.toString());
    if (r.ok && Array.isArray(r.json.items)) return r.json.items;

    // Fallback without counts
    const r2 = await fetchJSON('/api/admin/categories');
    const items = Array.isArray(r2.json.items)? r2.json.items : [];
    // As a last resort, show 0
    return items.map(x => ({ ...x, count: (typeof x.count === 'number' ? x.count : null) }));
  }

  function paginate(list){
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE;
    return { total, pages, slice: list.slice(start, start + PAGE) };
  }

  function renderTable(){
    const tbody = document.getElementById('catTbody');
    const pageEl = document.getElementById('catPage');
    const countEl = document.getElementById('catCount');
    if (!tbody) return;
    const { total, pages, slice } = paginate(filtered);
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">No categories.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(c => `
        <tr data-id="${esc(c.id)}" data-name="${esc(c.name)}">
          <td class="name"><span class="nm">${esc(c.name)}</span></td>
          <td>${typeof c.count === 'number' ? `<span class="pill-count" title="Products in this category">${c.count}</span>` : '<span class="muted">—</span>'}</td>
          <td class="actions" style="text-align:right">
            <button class="iconbtn edit" title="Rename" aria-label="Rename">✎</button>
            <button class="iconbtn del" title="Delete" aria-label="Delete">🗑</button>
          </td>
        </tr>
      `).join('');
    }
    if (pageEl) pageEl.textContent = `${page}/${Math.max(1, pages)}`;
    if (countEl) countEl.textContent = `${total} categories`;
    // Wire inline editor each render
    wireInlineEditor();
  }

  function applyFilter(){
    const q = (document.getElementById('catSearch')?.value || '').toLowerCase().trim();
    filtered = !q ? items : items.filter(c => (c.name||'').toLowerCase().includes(q));
    page = 1; renderTable();
  }

  function wireSkeleton(){
    const search = document.getElementById('catSearch');
    const newBtn = document.getElementById('catNew');
    const prev = document.getElementById('catPrev');
    const next = document.getElementById('catNext');

    search?.addEventListener('input', applyFilter);

    newBtn?.addEventListener('click', async () => {
      const name = prompt('New category name?');
      if (!name) return;
      const r = await fetchJSON('/api/admin/categories', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: name.trim() })
      });
      if (!r.ok) { alert(r.json?.error||'Create failed'); return; }
      await load();
    });

    prev?.addEventListener('click', () => { if (page > 1) { page--; renderTable(); }});
    next?.addEventListener('click', () => {
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
      if (page < pages) { page++; renderTable(); }
    });

    $('#catTbody')?.addEventListener('click', onRowAction);
  }

  // Inline editor: turn a row into edit mode
  function wireInlineEditor(){
    $$('#catTbody tr').forEach(tr => {
      // noop; actions are delegated in onRowAction
    });
  }

  async function onRowAction(e){
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id; const current = tr.querySelector('.nm')?.textContent || '';

    // Rename -> inline editor
    if (e.target.classList.contains('edit')) {
      tr.innerHTML = `
        <td colspan="3">
          <div class="row-edit">
            <input class="edit-input" value="${esc(current)}" aria-label="Category name">
            <button class="btn-mini save">Save</button>
            <button class="btn-mini cancel">Cancel</button>
          </div>
        </td>`;
      const input = tr.querySelector('.edit-input');
      input?.focus();
      tr.querySelector('.save')?.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name || name === current) { renderTable(); return; }
        const r = await fetchJSON(`/api/admin/categories/${encodeURIComponent(id)}`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name })
        });
        if (!r.ok) { alert(r.json?.error||'Rename failed'); return; }
        await load();
      });
      tr.querySelector('.cancel')?.addEventListener('click', renderTable);
      return;
    }

    // Delete (optional reassignment via prompt for compactness)
    if (e.target.classList.contains('del')) {
      if (!confirm(`Delete "${current}"?\nYou can optionally reassign products to another category.`)) return;
      const targetName = prompt('Reassign products to category (leave blank to not reassign):', '');
      let url = new URL(`/api/admin/categories/${encodeURIComponent(id)}`, location.origin);
      if (targetName) {
        const toCat = items.find(x => (x.name||'').toLowerCase() === targetName.toLowerCase());
        if (!toCat) { alert('No category with that name.'); return; }
        url.searchParams.set('reassign_to', toCat.id);
      }
      const r = await fetchJSON(url.toString(), { method:'DELETE' });
      if (!r.ok) { alert(r.json?.error||'Delete failed'); return; }
      await load();
      return;
    }
  }

  async function load(){
    box.innerHTML = shell();
    try {
      items = await fetchItemsWithCounts();
    } catch (e) {
      box.innerHTML = `<small style="color:#a00">${esc(e.message||e)}</small>`; return;
    }
    filtered = items.slice();
    wireSkeleton();
    renderTable();
  }

  try { await load(); } catch (e) {
    box.innerHTML = `<small style="color:#a00">${esc(e.message||e)}</small>`;
  }
})();

// ========== Product quick-delete ==========
document.getElementById('btnDelProd')?.addEventListener('click', async () => {
  const pn = (document.getElementById('delProdNum')?.value || '').trim().toLowerCase();
  if (!pn) return alert('Enter product_num');
  if (!confirm(`Delete product ${pn}?`)) return;
  const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}`, { method:'DELETE', credentials:'include' });
  const j = await r.json();
  if (!r.ok) return alert(j?.error||'Delete failed');
  alert('Deleted ✔');
});

// ---------- TEST FETCH CARD ----------
const testForm  = $('#testFetchForm');
const testInput = $('#testFetchInput');
const testOut   = $('#testFetchOut');

testForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = (testInput?.value || '').trim();
  if (!input) { alert('Paste an Amazon URL or a 10-char ASIN'); return; }

  testOut.innerHTML = '<small>Fetching…</small>';

  const { ok, status, json, text } = await fetchJSON('/api/admin/amazon-fetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
  });

  if (!ok) {
    const msg = json?.error?.message || json?.error || text || 'Unknown error';
    testOut.innerHTML = `<small style="color:#a00">Error ${status}: ${esc(msg)}</small>`;
    log('test-fetch ERROR', { status, msg, json });
    return;
  }

  const s = json.scraped || {};
  log('test-fetch OK (scraped)', s);

  const asin  = extractASIN(s.affiliate_link || input);
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
});

// ========== Archived Products (restore panel) ==========
(async function archivedManager(){
  const box = document.getElementById('archivedBox');
  if (!box) return;

  async function load() {
    const url = new URL('/api/admin/products-search', location.origin);
    url.searchParams.set('state', 'archived');
    url.searchParams.set('limit', '200');

    const { ok, json } = await fetchJSON(url.toString());
    if (!ok) { box.innerHTML = `<small style="color:#a00">${esc(json?.error || 'Error loading')}</small>`; return; }

    const items = Array.isArray(json.items) ? json.items : [];
    if (!items.length) { box.innerHTML = `<small>Nothing archived.</small>`; return; }

    box.innerHTML = items.map(p => `
      <div class="row" style="gap:8px;align-items:center;margin:.3rem 0" data-pn="${esc(p.product_num)}">
        <img src="${esc(p.image_main || '')}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #eee">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.my_title || p.amazon_title || '')}</div>
          <div class="muted"><code>${esc(p.product_num || '')}</code>${p.amazon_category?` • ${esc(p.amazon_category)}`:''}</div>
        </div>
        <button class="btn-restore">Restore</button>
      </div>`).join('');
  }
  await load();

  box.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('btn-restore')) return;
    const row = e.target.closest('[data-pn]'); if (!row) return;
    const pn = row.dataset.pn;
    const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}/archive`, {
      method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ restore: 1 })
    });
    const j = await r.json();
    if (!r.ok) { alert(j?.error||'Restore failed'); return; }
    row.remove();
  });
})();

// ========== Products — Archive / Delete (search + actions) ==========
(function productsArchiveDelete() {
  const input = $('#prodSearch');
  const btn   = $('#prodSearchBtn');
  const tbody = $('#prodTbody');

  if (!input || !btn || !tbody) return; // section not on page

  const fmtDate = (s) => {
    if (!s) return '';
    const d = new Date(s);
    return isFinite(d) ? d.toLocaleDateString(undefined,{year:'2-digit',month:'short',day:'2-digit'}) : s;
  };

  function stateVal() {
    const picked = $$('input[name="prodState"]').find(r => r.checked);
    return picked ? picked.value : 'all';
  }

  function rowHtml(p) {
    const title = p.my_title || p.amazon_title || '(untitled)';
    const cat   = p.amazon_category || '';
    const pn    = p.product_num || '';
    const img   = p.image_main ? `<img src="${esc(p.image_main)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #eee;margin-right:8px">` : '';
    const active = !p.archived_at;

    return `<tr data-pn="${esc(pn)}">
      <td><div class="row" style="align-items:center">${img}<div style="font-weight:600">${esc(title)}</div></div></td>
      <td>${cat ? `<span class="pill">${esc(cat)}</span>` : ''}</td>
      <td><code>${esc(pn)}</code></td>
      <td>${fmtDate(p.updated_at || p.created_at)}</td>
      <td class="actions">
        <button class="btn-quiet btn-archive" title="${active ? 'Archive' : 'Restore'}">${active ? 'Archive' : 'Restore'}</button>
        <button class="btn-danger btn-delete"  title="Delete permanently">Delete</button>
      </td>
    </tr>`;
  }

  async function search() {
    const q = (input.value || '').trim();
    const state = stateVal();

    btn.disabled = true;
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;

    try {
      const url = new URL('/api/admin/products-search', location.origin);
      if (q) url.searchParams.set('q', q);
      url.searchParams.set('state', state);
      url.searchParams.set('limit', '100');

      const { ok, status, json, text } = await fetchJSON(url.toString());
      if (!ok) throw new Error(json?.error || text || `HTTP ${status}`);

      const items = Array.isArray(json.items) ? json.items : [];
      log('products search', { state, q, count: items.length });

      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="muted">No matches.</td></tr>`;
        return;
      }
      tbody.innerHTML = items.map(rowHtml).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="color:#a00">Error: ${esc(e.message || e)}</td></tr>`;
      log('products search ERROR', e);
    } finally {
      btn.disabled = false;
    }
  }

  // Actions: Archive/Restore/Delete
  tbody.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-pn]');
    if (!tr) return;
    const pn = tr.dataset.pn;

    if (e.target.classList.contains('btn-archive')) {
      const restoring = e.target.textContent.toLowerCase() === 'restore';
      if (!confirm(`${restoring ? 'Restore' : 'Archive'} ${pn}?`)) return;
      e.target.disabled = true;
      try {
        const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}/archive`, {
          method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(restoring ? { restore: 1 } : {})
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Action failed');
        tr.remove();
      } catch (err) { alert(err?.message || err); }
      finally { e.target.disabled = false; }
    }

    if (e.target.classList.contains('btn-delete')) {
      if (!confirm(`DELETE ${pn} permanently?\nThis cannot be undone.`)) return;
      e.target.disabled = true;
      try {
        const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}`, { method:'DELETE', credentials:'include' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Delete failed');
        tr.remove();
      } catch (err) { alert(err?.message || err); }
      finally { e.target.disabled = false; }
    }
  });

  // Wire controls
  btn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  $$('input[name="prodState"]').forEach(r => r.addEventListener('change', search));

  if ((input.value || '').trim()) search();
})();
