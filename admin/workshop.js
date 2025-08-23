/* ---- admin/workshop.js ---- */

// ---------- tiny helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

// ---------- whoami banner ----------
(async () => {
  try {
    const r = await fetch('/api/admin/whoami', { credentials: 'include', cache: 'no-store' });
    const { user } = await r.json();
    const el = $('#whoami');
    if (el && user) el.textContent = `You are logged in as ${user}`;
  } catch (_) {}
})();

// ========== Products — Archive / Delete ==========
(function productsArchiveDelete() {
  const input = $('#prodSearch');
  const btn   = $('#prodSearchBtn');
  const tbody = $('#prodTbody');

  if (!input || !btn || !tbody) return; // panel not present

  function stateVal() {
    const picked = $$('input[name="prodState"]').find(r => r.checked);
    return picked ? picked.value : 'all';
  }

  function fmtDate(s) {
    if (!s) return '';
    try {
      const d = new Date(s);
      if (!isFinite(d)) return s;
      return d.toLocaleDateString(undefined, { year:'2-digit', month:'short', day:'2-digit' });
    } catch { return s; }
  }

  function rowHtml(p) {
    const title = p.my_title || p.amazon_title || '(untitled)';
    const cat   = p.amazon_category || '';
    const pn    = p.product_num || '';
    const img   = p.image_main ? `<img src="${esc(p.image_main)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #eee;margin-right:8px">` : '';
    const active = !p.archived_at;

    return `<tr data-pn="${esc(pn)}">
      <td><div class="row" style="align-items:center">${img}<div><div style="font-weight:600">${esc(title)}</div></div></div></td>
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
      const url = new URL('/api/admin/products', location.origin);
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

    // Archive/Restore
    if (e.target.classList.contains('btn-archive')) {
      const restoring = e.target.textContent.toLowerCase() === 'restore';
      if (!confirm(`${restoring ? 'Restore' : 'Archive'} ${pn}?`)) return;
      e.target.disabled = true;
      try {
        const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}/archive`, {
          method:'POST',
          credentials:'include',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(restoring ? { restore: 1 } : {})
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Action failed');
        tr.remove(); // simplify: remove from current view
      } catch (err) {
        alert(err?.message || err);
      } finally {
        e.target.disabled = false;
      }
    }

    // Delete
    if (e.target.classList.contains('btn-delete')) {
      if (!confirm(`DELETE ${pn} permanently?\nThis cannot be undone.`)) return;
      e.target.disabled = true;
      try {
        const r = await fetch(`/api/admin/products/${encodeURIComponent(pn)}`, {
          method:'DELETE',
          credentials:'include'
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Delete failed');
        tr.remove();
      } catch (err) {
        alert(err?.message || err);
      } finally {
        e.target.disabled = false;
      }
    }
  });

  // Wire controls
  btn.addEventListener('click', search);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
  $$('input[name="prodState"]').forEach(r => r.addEventListener('change', search));
})();
