export const onRequestGet = ({ env }) =>
  new Response(
    JSON.stringify({
      hasUrl: !!env.SUPABASE_URL,
      hasServiceRole: !!env.SUPABASE_SERVICE_ROLE_KEY
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
