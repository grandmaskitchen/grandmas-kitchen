/* ---- admin/workshop.js (v2) ---- */

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
  return { ok: r.ok, status: r.status, headers: r.headers, json, text };
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

// ========== Backups (Dedicated Card) ==========
(function backupCard(){
  const card      = $('#backup-card');
  if (!card) return; // not on this page

  const tableSel  = $('#backup-table');
  const runBtn    = $('#backup-now');
  const latestEl  = $('#latest-backup');
  const statusEl  = $('#backup-status');
  const outEl     = $('#backup-output');
  const copyBtn   = $('#copy-local-cmd');
  const vhBtn     = $('#vh-run');
  const vhUrlEl   = $('#vh-url');
  const vhOut     = $('#vh-output');

  const setStatus = (s) => statusEl && (statusEl.textContent = 'Status: ' + s);
  const fmtBytes = (n) => {
    if (n == null || isNaN(n)) return 'unknown';
    const units = ['B','KB','MB','GB','TB'];
    let i=0, v=Number(n);
    while (v >= 1024 && i < units.length-1) { v/=1024; i++; }
    return (v < 10 && i ? v.toFixed(1) : Math.round(v)) + ' ' + units[i];
  };
  const fmtWhen = (iso) => {
    if (!iso) return 'unknown time';
    try { const d = new Date(iso); return d.toLocaleString(); } catch { return iso; }
  };

  // Auth gate (if Basic Auth enabled in middleware)
  (async () => {
    try {
      const r = await fetch('/api/admin/whoami', { headers: { 'Accept':'application/json' }, credentials:'include' });
      if (r.status === 401 || r.status === 403) {
        if (runBtn) { runBtn.disabled = true; runBtn.title = 'Login required'; }
        setStatus('login required');
      }
    } catch {}
  })();

  async function loadLatest() {
    if (!latestEl) return;
    const table = (tableSel && tableSel.value) || 'products';
    try {
      // Prefer standardized meta shape for the selected table
      let { ok, json } = await fetchJSON(`/api/admin/backup?format=meta&table=${encodeURIComponent(table)}`);
      if (!ok) ({ ok, json } = await fetchJSON('/api/admin/backup'));
      const latest = json && (json.latest || json.backup || (Array.isArray(json) ? json[0] : null));
      if (latest) {
        const url = latest.url || latest.download_url || latest.path || '';
        const size = fmtBytes(latest.bytes || latest.size);
        const when = fmtWhen(latest.updated_at || latest.timestamp || latest.created_at);
        latestEl.innerHTML = url
          ? `Latest: <a href="${esc(url)}" target="_blank" rel="noopener">download</a> • ${size} • ${when}`
          : `Latest: ${size} • ${when}`;
      } else {
        latestEl.innerHTML = 'Latest: <em>unknown</em>';
      }
    } catch (e) {
      latestEl.innerHTML = 'Latest: <em>unknown</em>';
      log('backup latest ERROR', e);
    }
  }

  tableSel && tableSel.addEventListener('change', loadLatest);
  loadLatest();

  // Trigger backup (download attachment for selected table)
  runBtn && runBtn.addEventListener('click', () => {
    const table = (tableSel && tableSel.value) || 'products';
    const url = `/api/admin/backup?table=${encodeURIComponent(table)}&download=1`;
    setStatus('starting download…');
    outEl && (outEl.textContent = '');
    window.location.href = url; // trigger browser download
    setTimeout(loadLatest, 1500);
    setTimeout(() => setStatus('idle'), 2000);
  });

  // Verify headers (HEAD)
  function pickHeaders(headers) {
    const keys = ['cache-control','pragma','expires','x-robots-tag','x-admin-mw'];
    const lines = [];
    for (const k of keys) {
      const v = headers.get(k);
      if (v) lines.push(`${k}: ${v}`);
    }
    return lines.join('\n') || '(no expected headers present)';
  }
  vhBtn && vhBtn.addEventListener('click', async () => {
    const url = (vhUrlEl && vhUrlEl.value || '/admin/workshop.html').trim();
    if (vhOut) vhOut.textContent = 'checking…';
    try {
      const res = await fetch(url, { method: 'HEAD' });
      vhOut && (vhOut.textContent = pickHeaders(res.headers));
    } catch (e) {
      vhOut && (vhOut.textContent = String(e && e.message || e));
    }
  });

  // Copy local commands
  copyBtn && copyBtn.addEventListener('click', () => {
    const cmd = 'cd ~/documents/github/grandmas-kitchen\n./backup.zsh\nopen "$HOME/Backups/grandmas-kitchen"';
    navigator.clipboard.writeText(cmd).then(() => {
      const old = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = old), 1200);
    });
  });
})();

// ========== Category Manager ==========
(async function renderCategoryManager(){
  const box = document.getElementById('catMgr');
  if (!box) return;

  async function load() {
    box.innerHTML = '<small>Loading…</small>';
    const r = await fetch('/api/admin/categories', { credentials:'include', cache:'no-store' });
    const j = await r.json();
    if (!r.ok) { box.innerHTML = `<small style="color:#a00">${esc(j?.error||'Error')}</small>`; return; }
    const items = Array.isArray(j.items)? j.items : [];
    box.innerHTML = items.map(c => `
      <div class="row" style="align-items:center;gap:8px;margin:.3rem 0" data-id="${esc(c.id)}">
        <input class="rename" value="${esc(c.name)}" style="flex:1">
        <button class="save">Rename</button>
        <select class="reassign"><option value="">— Reassign to… —</option>
          ${items.filter(x=>x.id!==c.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}
        </select>
        <button class="del" style="background:#b33">Delete</button>
      </div>
    `).join('');
  }
  await load();

  box.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]'); if (!row) return;
    const id = row.dataset.id;

    // Rename
    if (e.target.classList.contains('save')) {
      const name = row.querySelector('.rename').value.trim();
      if (!name) return alert('Name required');
      const r = await fetch(`/api/admin/categories/${encodeURIComponent(id)}`, {
        method:'PATCH',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
      const j = await r.json();
      if (!r.ok) return alert(j?.error||'Rename failed');
      alert('Renamed ✔'); await load();
    }

    // Delete (optional reassignment)
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

// ========== Product quick-delete ==========
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
    </div>
  `;
});

// ========== Archived Products (restore panel) ==========
(async function archivedManager(){
  const box = document.getElementById('archivedBox');
  if (!box) return;

  async function load() {
    // Use the updated endpoint that doesn't reference updated_at
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
      // IMPORTANT: use products-search (no updated_at usage)
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
        tr.remove(); // remove from current view
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

  // Optional: auto-search if prefilled
  if ((input.value || '').trim()) search();
})();
