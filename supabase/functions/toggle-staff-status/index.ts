import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Missing Auth header', { status: 401 });

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'owner' || !profile.is_active) {
    return new Response('Forbidden', { status: 403 });
  }

  const { userId, is_active } = await req.json();

  const { error } = await supabaseClient
    .from('profiles')
    .update({ is_active })
    .eq('id', userId);

  if (error) return new Response(error.message, { status: 400 });

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
