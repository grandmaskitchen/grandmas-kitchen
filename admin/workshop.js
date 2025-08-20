// Workshop page client helpers
const $ = s => document.querySelector(s);
const debugBox = $('#debugBox');
function log(title, obj) {
  const line = `\n\n=== ${title} ===\n` + (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  debugBox.textContent += line;
  console.log(title, obj);
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  return { ok: r.ok, status: r.status, json: j };
}

// --- Diagnostics ---
$('#btnDiagProducts')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=products');
  log('diag products', { ok, status, json });
  $('#diagOut').innerHTML = `<small>Status: ${status}</small>`;
});

$('#btnDiagShop')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/diag?table=shop_products');
  log('diag shop_products', { ok, status, json });
  $('#diagOut').innerHTML = `<small>Status: ${status}</small>`;
});

$('#btnStats')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/admin/stats');
  log('stats', { ok, status, json });
  if (ok) {
    $('#diagOut').innerHTML =
      `<small>products: ${json.products?.count ?? 0}, shop_products: ${json.shop_products?.count ?? 0}, env: ${json.envOk ? 'OK' : 'MISSING'}</small>`;
  } else {
    $('#diagOut').innerHTML = `<small>Stats error: ${status}</small>`;
  }
});

// --- Backups (download JSON) ---
document.querySelectorAll('.btnBackup').forEach(btn => {
  btn.addEventListener('click', async () => {
    const table = btn.dataset.table;
    const file = `${table}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`;
    const r = await fetch(`/api/admin/backup?table=${encodeURIComponent(table)}`);
    const blob = await r.blob();
    log('backup fetched', { table, size: blob.size, status: r.status });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    URL.revokeObjectURL(a.href);
  });
});
<script>
(async function () {
  try {
    const r = await fetch('/api/admin/whoami', { credentials: 'include' });
    const { user } = await r.json();
    const el = document.getElementById('whoami');
    if (el && user) el.textContent = `You are logged in as ${user}`;
  } catch (e) {
    // ignore
  }
})();
</script>
// --- Home picks refresh ---
$('#btnRefreshPicks')?.addEventListener('click', async () => {
  const { ok, status, json } = await fetchJSON('/api/admin/home-picks-refresh', { method: 'POST' });
  log('home-picks-refresh', { ok, status, json });
  $('#picksOut').innerHTML = ok
    ? `<small>Inserted: ${json.inserted ?? 0}</small>`
    : `<small>Error: ${status}</small>`;
});
