// Grandma's Kitchen – Form Logic
const SUPABASE_URL = 'https://upsoalxeqigztjhhadph.supabase.co';
const SUPABASE_KEY = 'your-supabase-public-api-key'; // ← replace with real key!

const credentials = { username: 'admin', password: 'letmein123' };

document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const enteredUser = document.getElementById('username').value;
  const enteredPass = document.getElementById('password').value;

  if (enteredUser === credentials.username && enteredPass === credentials.password) {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('productForm').style.display = 'grid';
  } else {
    alert('❌ Incorrect login. Please try again.');
  }
});

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });

  data.created_at = new Date().toISOString();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });

  const preview = document.getElementById('preview');
  if (response.ok) {
    preview.innerHTML = `
      <h3>✅ Product Preview</h3>
      <p><strong>${data.my_title}</strong><br><em>${data.my_subtitle}</em></p>
      <img src="${data.image_main}" alt="Preview"><p>${data.my_description_short}</p>`;
    preview.style.display = 'block';
    e.target.reset();
  } else {
    alert('❌ Failed to add product.');
    console.error(await response.text());
  }
});
