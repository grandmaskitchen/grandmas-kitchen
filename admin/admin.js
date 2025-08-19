// /admin/admin.js
// Minimal client: validate, normalize, debug (optional), and POST to our Pages Function.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('productForm');
  const preview = document.getElementById('preview');

  // --- Debug helper: open page with ?debug=1 to see payloads
  const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
  function showDebug(title, obj) {
    if (!DEBUG) return;
    console.log('🔎', title, obj);
    let box = document.getElementById('debugBox');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'debugBox';
      box.style.cssText = 'background:#111;color:#0f0;padding:10px;white-space:pre-wrap;';
      document.body.appendChild(box);
    }
    box.textContent += `\n\n=== ${title} ===\n` + JSON.stringify(obj, null, 2);
  }

  const isAmazon = (url) =>
    /^(https?:\/\/)(amzn\.to|www\.amazon\.)/i.test((url || '').trim());

  function validHttpUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'http:' || x.protocol === 'https:';
    } catch { return false; }
  }

  function slugify(s) {
    return (s || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 32);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    // Ensure product_num (slug); if missing, derive from title
    if (!data.product_num || !data.product_num.trim()) {
      const guess = slugify(data.my_title);
      if (!guess) {
        alert('Please enter a product code (e.g., acv001).');
        return;
      }
      data.product_num = guess;
      const pn = document.getElementById('product_num');
      if (pn) pn.value = guess;
    }

    // Required checks
    if (!data.my_title || !data.my_title.trim()) {
      alert('My Title is required'); return;
    }
    if (!validHttpUrl(data.image_main)) {
      alert('Main image URL must be a valid http(s) URL'); return;
    }
    // Affiliate link is OPTIONAL, but if present it must be Amazon (amzn.to or amazon.*)
    // Preserve EXACT text user typed (Sitestripe short links are fine)
    data.affiliate_link = (document.getElementById('affiliate_link')?.value || '').trim();
    if (data.affiliate_link && !isAmazon(data.affiliate_link)) {
      alert('Affiliate link must be amzn.to or an amazon.* URL'); return;
    }

    // Coerce types the backend expects
    data.approved = !!fd.get('approved');
    if (data.commission_l !== '' && data.commission_l != null) {
      const n = Number(data.commission_l);
      data.commission_l = Number.isFinite(n) ? n : null;
    } else {
      data.commission_l = null;
    }

    showDebug('Outgoing payload', data);

    try {
      const res = await fetch('/api/admin/product-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      showDebug('Server reply', json);

      if (!res.ok) {
        console.error(json);
        throw new Error(json?.error || 'Failed to save');
      }

      const saved = json.product || data;

      preview.style.display = 'block';
      preview.innerHTML = `
        <h3>✅ Product saved</h3>
        <p><strong>${saved.my_title || ''}</strong>${saved.my_subtitle ? `<br><em>${saved.my_subtitle}</em>` : ''}</p>
        ${saved.image_main ? `<img src="${saved.image_main}" alt="Preview" style="max-width:180px;border-radius:8px">` : ''}
        ${saved.my_description_short ? `<p>${saved.my_description_short}</p>` : ''}
        ${saved.product_num ? `<p class="hint">View page: <code>/products/${saved.product_num}</code></p>` : ''}
      `;

      form.reset();
      alert('✅ Saved!');
    } catch (err) {
      console.error(err);
      alert('❌ ' + err.message);
    }
  });
});
