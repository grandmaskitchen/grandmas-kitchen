<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Add Product • Grandma’s Kitchen (Admin)</title>
  <meta name="robots" content="noindex,nofollow" />
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#fffdf8;color:#222;margin:0;padding:24px}
    .wrap{max-width:760px;margin:0 auto}
    h1{font-size:1.6rem;margin:0 0 1rem}
    form{display:grid;gap:12px;background:#fff;padding:16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
    label{font-weight:600}
    input,textarea,select{width:100%;box-sizing:border-box;padding:.6rem;border:1px solid #cfcfcf;border-radius:8px;font-size:1rem}
    .row{display:grid;grid-template-columns:1fr auto;gap:12px}
    .actions{display:flex;gap:12px;align-items:center;margin-top:.5rem}
    .hint{font-size:.85rem;color:#666}
    button{background:#44633F;color:#fff;border:0;border-radius:8px;padding:.7rem 1rem;cursor:pointer}
    button.secondary{background:#ddd;color:#222}
    #fetchStatus{font-size:.9rem;color:#666}
    #preview{display:none;background:#fff7ea;border:1px solid #eee;border-radius:10px;padding:12px}
    a.btn-link{display:inline-block;background:#ddd;color:#222;border-radius:8px;padding:.7rem 1rem;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📦 Add a New Product</h1>

    <form id="productForm" autocomplete="off">
      <!-- Amazon link + Fetch -->
      <label for="affiliate_link">Amazon Link or ASIN *</label>
      <div class="row">
        <input id="affiliate_link" name="affiliate_link" type="text" placeholder="https://amzn.to/... or https://www.amazon.co.uk/... or ASIN" required />
        <button id="fetchAmazon" type="button" title="Fetch details from Amazon">Fetch</button>
      </div>
      <span id="fetchStatus" class="hint"></span>

      <!-- Minimal authoring fields -->
      <label for="my_title">My Title *</label>
      <input id="my_title" name="my_title" required />

      <label for="image_main">Main Image URL *</label>
      <input id="image_main" name="image_main" type="url" required placeholder="https://..." />

      <label for="my_description_short">Short Description</label>
      <textarea id="my_description_short" name="my_description_short" rows="2"></textarea>

      <!-- REQUIRED: our curated category -->
      <label for="shopCategory">Category *</label>
      <select id="shopCategory" name="shop_category_id" required>
        <option value="">— Choose a category —</option>
      </select>
      <small class="hint">Pick the best fit. You can add more categories later.</small>

      <!-- Inline add-new -->
      <div class="row" style="margin-top:.35rem">
        <input id="newCategoryName" type="text" placeholder="New category name (e.g. Water Filters)" />
        <button id="btnAddCategory" type="button" title="Add new category">Add</button>
      </div>
      <small class="hint">Can’t see it? Add one here—this will be saved and selected.</small>

      <label style="display:flex;gap:.5rem;align-items:center;">
        <input type="checkbox" id="approved" name="approved" value="true" />
        Approved
      </label>

      <!-- hidden fields we still store -->
      <input type="hidden" id="amazon_title" name="amazon_title" />
      <input type="hidden" id="amazon_desc"  name="amazon_desc" />
      <input type="hidden" id="image_small"   name="image_small" />
      <input type="hidden" id="image_extra_1" name="image_extra_1" />
      <input type="hidden" id="image_extra_2" name="image_extra_2" />
      <input type="hidden" id="amazon_category" name="amazon_category" />
      <input type="hidden" id="product_num"  name="product_num" />

      <div class="actions">
        <button type="submit">Submit</button>
        <a class="btn-link" href="/shop.html">Back to Pantry</a>
      </div>
    </form>

    <div id="preview" class="wrap"></div>
  </div>

  <!-- Amazon fetch wiring ONLY (submission handled in /admin/admin.js) -->
  <script>
    (function () {
      const btn = document.getElementById('fetchAmazon');
      const statusEl = document.getElementById('fetchStatus');
      const byName = (n) => document.querySelector(\`[name="\${n}"]\`);

      const FIELDS_TO_CLEAR = [
        'amazon_title','amazon_desc','image_main','image_small',
        'image_extra_1','image_extra_2','amazon_category',
        'my_title','my_description_short'
      ];
      function clearAutoFields() {
        FIELDS_TO_CLEAR.forEach((name) => {
          const el = byName(name);
          if (el) el.value = '';
        });
      }

      function extractASIN(s) {
        try {
          if (/^[A-Z0-9]{10}$/i.test((s||'').trim())) return s.trim().toUpperCase();
          const u = new URL(s);
          const m =
            u.pathname.match(/\\/dp\\/([A-Z0-9]{10})/i) ||
            u.pathname.match(/\\/gp\\/product\\/([A-Z0-9]{10})/i) ||
            u.search.match(/[?&]asin=([A-Z0-9]{10})/i);
          return (m && m[1] && m[1].toUpperCase()) || '';
        } catch { return ''; }
      }

      async function doFetch() {
        const inputEl = document.getElementById('affiliate_link');
        let input = (inputEl?.value || '').trim();
        if (!input) {
          input = prompt('Paste an Amazon URL or ASIN:') || '';
          input = input.trim();
          if (!input) return;
          if (inputEl) inputEl.value = input;
        }

        clearAutoFields();
        statusEl.textContent = 'Fetching product details…';
        btn.disabled = true;
        try {
          const r = await fetch('/api/admin/amazon-fetch', {
            method:'POST',
            credentials: 'include',         // send auth cookies
            cache: 'no-store',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ input })
          });

          if (r.status === 401) {
            statusEl.textContent = 'Sign in required.';
            alert('You are not signed in (401). Refresh this page to sign in, then try Fetch again.');
            return;
          }

          const text = await r.text();
          let json;
          try { json = JSON.parse(text); } catch { throw new Error(text?.slice(0,160) || 'Non-JSON response'); }
          if (!r.ok) throw new Error(json?.error?.message || json?.message || 'Fetch failed');

          const s = json.scraped || {};
          const setIfEmpty = (name, val) => {
            if (!val) return;
            const el = byName(name);
            if (el && !el.value) el.value = val;
          };

          // Populate fields
          setIfEmpty('amazon_title', s.amazon_title);
          setIfEmpty('amazon_desc',  s.amazon_desc);
          setIfEmpty('image_main',   s.image_main);
          setIfEmpty('image_small',  s.image_small || s.image_main);
          setIfEmpty('image_extra_1', s.image_extra_1);
          setIfEmpty('image_extra_2', s.image_extra_2);
          setIfEmpty('amazon_category', s.amazon_category);

          // Authoring defaults
          setIfEmpty('my_title', s.amazon_title);
          const short = byName('my_description_short');
          if (short && !short.value && s.amazon_desc) short.value = s.amazon_desc.slice(0, 240);

          // Normalize link & derive product_num (ASIN)
          if (s.affiliate_link) {
            byName('affiliate_link').value = s.affiliate_link;
          }
          const asin = extractASIN(byName('affiliate_link').value) || extractASIN(input);
          if (asin) byName('product_num').value = asin.toLowerCase();

          statusEl.textContent = 'Filled from Amazon. Review fields, then Submit.';
        } catch (err) {
          alert('Fetch failed: ' + err.message);
          statusEl.textContent = 'Fetch failed.';
        } finally {
          btn.disabled = false;
        }
      }

      btn?.addEventListener('click', doFetch);
    })();
  </script>

  <!-- Categories: load list + add-new inline -->
  <script>
    async function loadCategoriesInto(selectEl){
      try{
        const r = await fetch('/api/admin/categories', { credentials: 'include', cache: 'no-store' });
        const { items } = await r.json();
        const current = selectEl.value || '';
        selectEl.innerHTML = '<option value="">— Choose a category —</option>';
        if (Array.isArray(items)){
          items.forEach(c=>{
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            selectEl.appendChild(opt);
          });
        }
        if (current) selectEl.value = current; // preserve selection if possible
      }catch(e){
        console.error('Failed to load categories', e);
      }
    }

    async function addNewCategory(){
      const input = document.getElementById('newCategoryName');
      const name = (input.value || '').trim();
      if (!name){ alert('Please enter a category name.'); return; }
      const btn = document.getElementById('btnAddCategory');
      btn.disabled = true;
      try{
        const r = await fetch('/api/admin/categories', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ name })
        });
        const j = await r.json();
        if (!r.ok || !j?.category?.id) throw new Error(j?.error || 'Create failed');

        // refresh list and select new one
        const sel = document.getElementById('shopCategory');
        await loadCategoriesInto(sel);
        sel.value = j.category.id;
        input.value = '';
      }catch(e){
        alert('Could not add category: ' + (e.message || e));
      }finally{
        btn.disabled = false;
      }
    }

    (async function initCategories(){
      const sel = document.getElementById('shopCategory');
      await loadCategoriesInto(sel);
      document.getElementById('btnAddCategory')?.addEventListener('click', addNewCategory);
    })();
  </script>

  <!-- Handles validation + POST to /api/admin/product-upsert -->
  <script src="/admin/admin.js" defer></script>
</body>
</html>

