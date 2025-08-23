// PATCH  /api/admin/categories/:id { name }
// DELETE /api/admin/categories/:id[?reassign_to=<catId>]
//  - If products exist and no reassign_to -> 409

export const onRequestOptions = ({ request }) =>
  new Response(null,{status:204,headers:allow(request,"PATCH, DELETE, OPTIONS")});

export const onRequestPatch = async ({ params, request, env }) => {
  try {
    const id = String(params.id || "").trim();
    if (!id) return j(400,{error:"id required"},request);
    const { name } = await request.json();
    const clean = String(name||"").trim();
    if (!clean) return j(400,{error:"name required"},request);

    const slug = slugify(clean);
    const u = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
    u.searchParams.set("id", `eq.${id}`);

    const r = await fetch(u, {
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer:"return=representation"
      },
      body: JSON.stringify({ name: clean, slug })
    });
    const out = await r.json();
    if (!r.ok) return j(400,{error: out?.message || "Update failed", details: out},request);
    const category = Array.isArray(out) ? out[0] : out;
    return j(200,{ok:true, category},request);
  } catch (e) {
    return j(500,{error:e?.message||"Server error"},request);
  }
};

export const onRequestDelete = async ({ params, request, env }) => {
  try {
    const id = String(params.id || "").trim();
    if (!id) return j(400,{error:"id required"},request);
    const reassign = new URL(request.url).searchParams.get("reassign_to");

    // If not reassigning, check if any products use this category
    if (!reassign) {
      const check = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
      check.searchParams.set("select","id");
      check.searchParams.set("shop_category_id", `eq.${id}`);
      check.searchParams.set("limit","1");
      const r0 = await fetch(check, {
        headers:{
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      const rows = await r0.json();
      if (!r0.ok) return j(500,{error:"Precheck failed"},request);
      if (Array.isArray(rows) && rows.length>0) {
        return j(409,{error:"Category has products. Provide ?reassign_to=<categoryId> to move them before delete."},request);
      }
    } else {
      // Reassign all products first
      const uMove = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
      uMove.searchParams.set("shop_category_id", `eq.${id}`);
      const rMove = await fetch(uMove, {
        method:"PATCH",
        headers:{
          "Content-Type":"application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ shop_category_id: reassign })
      });
      if (!rMove.ok) {
        const m = await rMove.json().catch(()=>null);
        return j(400,{error:m?.message||"Reassign failed", details:m},request);
      }
    }

    // Delete category
    const uDel = new URL(`${env.SUPABASE_URL}/rest/v1/categories`);
    uDel.searchParams.set("id", `eq.${id}`);
    const rDel = await fetch(uDel, {
      method:"DELETE",
      headers:{
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer:"return=representation"
      }
    });
    const out = await rDel.json().catch(()=>null);
    if (!rDel.ok) return j(400,{error: out?.message || "Delete failed", details: out},request);
    const deleted = Array.isArray(out) ? out[0] : out;
    return j(200,{ok:true, deleted},request);
  } catch (e) {
    return j(500,{error:e?.message||"Server error"},request);
  }
};

function allow(req,methods){return{
  "Access-Control-Allow-Origin": req.headers.get("Origin")||"*",
  "Access-Control-Allow-Credentials":"true",
  "Access-Control-Allow-Methods":methods,
  "Access-Control-Allow-Headers":"Content-Type, Cf-Access-Jwt-Assertion, Cf-Access-Authenticated-User-Email",
  "Cache-Control":"no-store"}}
function j(status,body,req){return new Response(JSON.stringify(body),{status,headers:{...allow(req,"*"),"Content-Type":"application/json"}});}
function slugify(s){return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);}
