// Minimal client: validate and POST to our Pages Function.
const form = document.getElementById('productForm');
const preview = document.getElementById('preview');

const isAmazon = url =>
  /^https?:\/\/(www\.)?(amzn\.to|amazon\.[a-z.]+)\//i.test(url || '');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());

  // Required checks
  if (!data.my_title?.trim()) {
    alert('My Title is required'); return;
  }
  if (!isAmazon(data.affiliate_link)) {
    alert('Affiliate link must be amzn.to or amazon.*'); return;
  }
  if (!data.image_main?.startsWith('http')) {
    alert('Main image URL must be a valid https:// URL'); return;
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Failed to save');

    preview.style.display = 'block';
    preview.innerHTML = `
      <h3>✅ Product saved</h3>
      <p><strong>${json.row?.my_title || data.my_title}</strong></p>
      <img src="${data.image_main}" alt="Preview" style="max-width:180px;border-radius:8px">
      <p>${data.my_description_short || ''}</p>
      <p><em>Added by: ${json.added_by || 'unknown'}</em></p>
    `;
    form.reset();
  } catch (err) {
    console.error(err);
    alert('❌ ' + err.message);
  }
});
