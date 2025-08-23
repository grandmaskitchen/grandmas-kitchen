// DELETE /api/admin/products/:product_num
// -> { ok:true, deleted:{...} }
export const onRequestOptions = ({ request }) =>
  new Response(null,{status:204,headers:allow(request,"DELETE, OPTIONS")});

export const onRequestDelete = async ({ params, env, request }) => {
  try {
    const product_num = String(params.product_num || "").trim().toLowerCase();
    if (!product_num) return j(400,{error:"product_num required"},request);

    const u = new URL(`${env.SUPABASE_URL}/rest/v1/products`);
    u.searchParams.set("product_num", `eq.${product_num}`);
    const r = await fetch(u, {
      method:"DELETE",
      headers:{
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer:"return=representation"
      }
    });
    const out = await r.json().catch(()=>null);
    if (!r.ok) return j(400,{error:out?.message||"Delete failed", details:out},request);
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
