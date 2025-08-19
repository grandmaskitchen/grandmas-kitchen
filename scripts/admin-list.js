// scripts/admin-list.js
(() => {
  const rowsEl = document.getElementById('rows') || document.querySelector('#rows');
  if (!rowsEl) return;

  rowsEl.addEventListener('change', async (e) => {
    if (!e.target.matches('input.appr')) return;

    const cb = e.target;
    const id = Number(cb.dataset.id);
    const approved = cb.checked;
    const status = document.querySelector(`.status[data-id="${id}"]`);
    const prevText = status?.textContent ?? '';

    cb.disabled = true;
    if (status) status.textContent = 'Saving…';

    try {
      const r = await fetch('/api/admin/product-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approved })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Approve failed');

      if (status) status.textContent = approved ? 'Approved' : 'Pending';
    } catch (err) {
      alert(err.message || 'Failed to update approval');
      cb.checked = !approved; // revert
      if (status) status.textContent = prevText || (cb.checked ? 'Approved' : 'Pending');
    } finally {
      cb.disabled = false;
    }
  });
})();
