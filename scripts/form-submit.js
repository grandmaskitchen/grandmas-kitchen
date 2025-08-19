// scripts/form-submit.js
(() => {
  // TEMP login gate (replace with Cloudflare Access when ready)
  const credentials = { username: 'admin', password: 'letmein123' };

  const loginForm   = document.getElementById('loginForm');
  const productForm = document.getElementById('productForm');
  const preview     = document.getElementById('preview');

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value.trim();
    if (u === credentials.username && p === credentials.password) {
      loginForm.style.display = 'none';
      productForm.style.display = 'grid';
    } else {
      alert('❌ Incorrect login. Please try again.');
    }
  });

  productForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd   = new FormData(productForm);
    const data = Object.fromEntries(fd.entries());

    // booleans / coercions
    data.approved = !!fd.get('approved');
    if (data.commission_l !== '' && data.commission_l != null) {
      const n = Number(data.commission_l);
      data.commission_l = Number.isFinite(n) ? n : null;
    } else {
      data.commission_l = null;
    }

    // IMPORTANT: use exactly what the user typed for the affiliate link
    data.affiliate_link = (document.getElementById('affiliate_link')?.value || '').trim();

    try {
      const res = await fetch('/api/admin/product-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || 'Insert failed');

      const row = out.product || data;
      preview.style.display = 'block';
      preview.innerHTML = `
        <h3>✅ Product saved</h3>
        <p><strong>${row.my_title || ''}</strong><br><em>${row.my_subtitle || ''}</em></p>
        ${row.image_main ? `<img src="${row.image_main}" alt="Preview" style="max-width:100%;border-radius:8px">` : ''}
        <p>${row.my_description_short || ''}</p>
        <p><small>product_num: <code>${row.product_num || ''}</code></small></p>
      `;
      productForm.reset();
      alert('✅ Saved!');
    } catch (err) {
      console.error(err);
      alert('❌ Failed to add product: ' + (err.message || 'unknown error'));
    }
  });
})();
