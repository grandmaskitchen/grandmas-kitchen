// === Products — Archive / Delete (ADD THIS BLOCK) ===
(() => {
  const $  = (window.$  || ((s)=>document.querySelector(s)));
  const $$ = (window.$$ || ((s)=>Array.from(document.querySelectorAll(s))));
  const dbg = document.getElementById('debugBox') || { textContent:'', append(){}, };
  const log = (t, o) => { try { console.log(t, o); } catch{}; if (dbg) dbg.textContent += `\n\n=== ${t} ===\n${typeof o==='string'?o:JSON.stringify(o,null,2)}`; };
  const esc = (s)=>String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const prodInput = document.getElementById('prodSearch');
  const prodBtn   = document.getElementById('prodSearchBtn');
  const tbody     = document.getElementById('prodTbody');
  if (!prodInput || !prodBtn || !tbody) return; // panel not on this page build

  // Small helper that doesn't collide with your existing fetchJSON
  async function fetchJSON2(url, opts={}) {
    const r = await fetch(url, { credentials:'include', cache:'no-store', ...opts });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw:text }; }
    return { ok:r.ok, status:r.status, json, text };
  }

  const stateVal = () => ($$('input[name="prodState"]').find(r=>r.checked)?.value || 'all');
  const fmtDate = (s)=>{ if(!s) return ''; const d=new Date(s); return isFinite(d)? d.toLocaleDateString(undefined,{year:'2-digit',month:'short',day:'2-digit'}):s; };

  const rowHtml = (p) => {
    const title = p.my_title || p.amazon_title || '(untitled)';
    const cat   = p.amazon_category || '';
    const pn    = p.product_num || '';
    const img   = p.image_main ? `<img src="${esc(p.image_main)}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #eee;margin-right:8px">` : '';
    const active = !p.archived_at;
    return `<tr data-pn="${esc(pn)}">
      <td><div style="display:flex;align-items:center">${img}<div><div style="font-weight:600">${esc(title)}</div></div></div></td>
      <td>${cat ? `<span style="display:inline-block;background:#eef3ee;color:#2f5130;border-radius:999px;padding:.15rem .5rem;font-size:.8rem">${esc(cat)}</span>` : ''}</td>
      <td><code>${esc(pn)}</code></td>
      <td>${fmtDate(p.updated_at || p.created_at)}</td>
      <td class="actions">
        <button class="btn-archive" style="background:#ddd;color:#222;border:0;border-radius:8px;padding:.35rem .6rem;margin-right:4px">${active?'Archive':'Restore'}</button>
        <button class="btn-delete"  style="background:#b33;color:#fff;border:0;border-radius:8px;padding:.35rem .6rem">Delete</button>
      </td>
    </tr>`;
  };

  async function search() {
    const q = (prodInput.value || '').trim();
    const s = stateVal();
    prodBtn.disabled = true;
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading…</td></tr>`;
    try {
      // Use the public list you already have, then filter client-side by archived/active.
      const url = new URL('/api/products-list', location.origin);
      if (q) url.searchParams.set('q', q);
      url.searchParams.set('limit', '200');

      const { ok, status, json, text } = await fetchJSON2(url.toString());
      if (!ok) throw new Error(json?.error || text || `HTTP ${status}`);
      let items = Array.isArray(json.products || json.items) ? (json.products || json.items) : [];

      if (s === 'active')   items = items.filter(p => !p.archived_at);
      if (s === 'archived') items = items.filter(p =>  p.archived_at);

      log('products search', { q, state:s, count:items.length });

      tbody.innerHTML = items.length
        ? items.map(rowHtml).join('')
        : `<tr><td colspan="5" class="muted">No matches.</td></tr>`;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:#a00">Error: ${esc(e.message||e)}</td></tr>`;
      log('products search ERROR', e);
    } finally {
      prodBtn.disabled = false;
    }
  }

  // Try a few endpoint shapes for archive/delete to fit your repo
  async function tryEndpoints(queue) {
    let lastErr;
    for (const req of queue) {
      try {
        const { ok, json, text, status } = await fetchJSON2(req.url, req.opts);
        if (ok) return { ok:true, json };
        lastErr = new Error(json?.error || text || `HTTP ${status}`);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All endpoints failed');
  }

  tbody.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-pn]');
    if (!tr) return;
    const pn = tr.dataset.pn;

    // Archive / Restore
    if (e.target.classList.contains('btn-archive')) {
      const restoring = e.target.textContent.toLowerCase() === 'restore';
      if (!confirm(`${restoring ? 'Restore' : 'Archive'} ${pn}?`)) return;
      e.target.disabled = true;
      try {
        await tryEndpoints([
          { url:`/api/admin/products/${encodeURIComponent(pn)}/archive`, opts:{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(restoring?{restore:1}:{}) } },
          { url:`/api/products/${encodeURIComponent(pn)}/archive`,       opts:{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(restoring?{restore:1}:{}) } },
          { url:`/api/product-${restoring?'restore':'archive'}?product_num=${encodeURIComponent(pn)}`, opts:{ method:'POST' } },
        ]);
        tr.remove();
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
        await tryEndpoints([
          { url:`/api/admin/products/${encodeURIComponent(pn)}`, opts:{ method:'DELETE' } },
          { url:`/api/products/${encodeURIComponent(pn)}`,       opts:{ method:'DELETE' } },
          { url:`/api/product-delete?product_num=${encodeURIComponent(pn)}`, opts:{ method:'POST' } },
        ]);
        tr.remove();
      } catch (err) {
        alert(err?.message || err);
      } finally {
        e.target.disabled = false;
      }
    }
  });

  // Wire UI
  prodBtn.addEventListener('click', search);
  prodInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { e.preventDefault(); search(); } });
  $$('input[name="prodState"]').forEach(r => r.addEventListener('change', search));
})();
