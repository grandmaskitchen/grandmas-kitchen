// Admin • Approve Products (table view) — with inline category editing

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const rowsEl = $('#rows');
const countEl = $('#resultCount');
const form = $('#filters');
const qEl = $('#q');
const statusEl = $('#status');
const catFilterEl = $('#category');
const addedByEl = $('#addedBy');
const dateFromEl = $('#dateFrom');
const dateToEl = $('#dateTo');
const checkAllEl = $('#checkAll');
const btnApproveSelected = $('#btnApproveSelected');
const btnClear = $('#btnClear');

const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const fmtDate = (s) => s ? new Date(s).toLocaleString() : '—';

// cached categories for filter + inline editors
let CATS = [];
let CATMAP = new Map();

function getCatName(id){
  if (id == null) return null;
  return CATMAP.get(String(id)) || null;
}
function catOptionsHTML(selectedId){
  const sid = selectedId == null ? '' : String(selectedId);
  return CATS.map(c => {
    const sel = String(c.id) === sid ? ' selected' : '';
    return `<option value="${esc(c.id)}"${sel}>${esc(c.name)}</option>`;
  }).join('');
}

async function loadCategories() {
  try {
    const r = await fetch('/api/admin/categories-list', { credentials: 'include', cache: 'no-store' });
    const { items } = await r.json();
    if (Array.isArray(items)) {
      CATS = items;
      CATMAP = new Map(items.map(c => [String(c.id), c.name]));
      // fill the filter select
      for (const c of items) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        catFilterEl.appendChild(opt);
      }
    }
  } catch (e) { console.error('categories', e); }
}

function getFilters() {
  const p = new URLSearchParams();
  const q = qEl.value.trim();
  const addedBy = addedByEl.value.trim();
  const cat = catFilterEl.value;
  const status = statusEl.value;
  const d1 = dateFromEl.value;
  const d2 = dateToEl.value;

  if (q) p.set('q', q);
  if (addedBy) p.set('addedBy', addedBy);
  if (cat) p.set('category', cat);
  if (status) p.set('approved', status); // pending | approved | all
  if (d1) p.set('dateFrom', d1);
  if (d2) p.set('dateTo', d2);
  p.set('limit', '200');
  return p.toString();
}

function rowHTML(p) {
  const title = p.my_title || p.amazon_title || 'Untitled';
  const img = p.image_main ? `<img class="thumb" src="${esc(p.image_main)}" alt="">` : '';
  const siteUrl = `/products/${encodeURIComponent(p.product_num||'')}`;
  const amzUrl  = `https://www.amazon.co.uk/dp/${encodeURIComponent(p.product_num||'')}`;
  const approvedCell = p.approved ? '✅' : '—';

  // Inline category editor
  const catSelect = CATS.length
    ? `<select class="catSelect" style="max-width:180px">
         ${catOptionsHTML(p.shop_category_id)}
       </select>
       <span class="muted saveStatus" style="margin-left:6px"></span>`
    : (p.category_name ? `<span class="chip">${esc(p.category_name)}</span>` : '—');

  return `
  <tr data-num="${esc(p.product_num||'')}">
    <td class="center"><input type="checkbox" class="chk"/></td>
    <td>
      <div style="display:flex;gap:10px;align-items:center">
        ${img}
        <div class="grow">
          <div style="font-weight:700">${esc(title)}</div>
          <div class="muted" style="font-size:.85rem;display:flex;gap:8px;flex-wrap:wrap;margin-top:2px">
            <a href="${esc(siteUrl)}" target="_blank" rel="noopener">View product</a> ·
            <a href="${esc(amzUrl)}" target="_blank" rel="noopener">Amazon</a>
          </div>
        </div>
      </div>
    </td>
    <td class="nowrap"><code>${esc(p.product_num||'')}</code></td>
    <td>${catSelect}</td>
    <td>${esc(p.added_by||'—')}</td>
    <td class="nowrap">${fmtDate(p.created_at)}</td>
    <td class="center">${approvedCell}</td>
    <td class="center">
      ${p.approved ? '' : `<button class="btn small approve">Approve</button>`}
    </td>
  </tr>`;
}

async function fetchList() {
  rowsEl.innerHTML = `<tr><td colspan="8" class="muted center">Loading…</td></tr>`;
  checkAllEl.checked = false;

  const qs = getFilters();
  const r = await fetch(`/api/admin/products-pending?${qs}`, { credentials: 'include', cache: 'no-store' });
  const { items = [], error } = await r.json().catch(()=>({items:[], error:'Bad JSON'}));

  if (!r.ok) {
    rowsEl.innerHTML = `<tr><td colspan="8" class="muted center">Failed to load (${r.status}) ${esc(error||'')}</td></tr>`;
    countEl.textContent = '';
    return;
  }
  if (!items.length) {
    rowsEl.innerHTML = `<tr><td colspan="8" class="muted center">No products found.</td></tr>`;
    countEl.textContent = '0 items';
    return;
  }

  rowsEl.innerHTML = items.map(rowHTML).join('');
  countEl.textContent = `${items.length} item${items.length===1?'':'s'}`;

  // wire per-row approve buttons
  $$('#rows .approve').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tr = e.currentTarget.closest('tr');
      const num = tr?.dataset?.num;
      if (!num) return;
      await approveOne(num, tr);
    });
  });

  // wire per-row category editors
  wireRowCategoryEditors();
}

function wireRowCategoryEditors(){
  $$('#rows .catSelect').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const selEl = e.currentTarget;
      const tr = selEl.closest('tr');
      const num = tr?.dataset?.num;
      const status = tr.querySelector('.saveStatus');
      if (!num) return;

      const newId = selEl.value ? Number(selEl.value) : null;

      selEl.disabled = true;
      if (status) status.textContent = 'Saving…';

      const r = await fetch('/api/admin/product-update-category', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_num: num, shop_category_id: newId }),
      });
      const j = await r.json().catch(()=>({}));

      if (r.ok) {
        if (status) status.textContent = 'Saved';
      } else {
        alert('Save failed: ' + (j.error || r.status));
        if (status) status.textContent = 'Failed';
      }
      selEl.disabled = false;
      setTimeout(() => { if (status) status.textContent = ''; }, 1200);
    });
  });
}

async function approveOne(productNum, rowEl) {
  const btn = rowEl?.querySelector('.approve');
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }

  const r = await fetch('/api/admin/product-approve', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_num: productNum, approved: true }),
  });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) {
    alert('Approve failed: ' + (j.error || r.status));
    if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
    return false;
  }

  if (statusEl.value === 'pending') {
    rowEl.remove();
  } else {
    rowEl.querySelector('td:nth-child(7)').textContent = '✅';
    if (btn) btn.remove();
  }
  const n = $$('#rows tr').length;
  countEl.textContent = `${n} item${n===1?'':'s'}`;
  return true;
}

async function approveSelected() {
  const rows = $$('#rows tr').filter(tr => tr.querySelector('.chk')?.checked);
  if (!rows.length) { alert('No rows selected.'); return; }
  if (!confirm(`Approve ${rows.length} selected product(s)?`)) return;
  for (const tr of rows) {
    const num = tr.dataset.num;
    await approveOne(num, tr);
  }
}

function clearFilters() {
  qEl.value = '';
  statusEl.value = 'pending';
  catFilterEl.value = '';
  addedByEl.value = '';
  dateFromEl.value = '';
  dateToEl.value = '';
}

function wireEvents() {
  form.addEventListener('submit', (e) => { e.preventDefault(); fetchList(); });
  btnClear.addEventListener('click', () => { clearFilters(); fetchList(); });
  btnApproveSelected.addEventListener('click', approveSelected);
  checkAllEl.addEventListener('change', () => {
    $$('#rows .chk').forEach(ch => ch.checked = checkAllEl.checked);
  });
}

(async function init(){
  await loadCategories();
  wireEvents();
  fetchList();
})();
