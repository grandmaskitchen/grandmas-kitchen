// /admin/workshop.js — replace the file with this

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
  return { ok: r.ok, status: r.status, json };
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
