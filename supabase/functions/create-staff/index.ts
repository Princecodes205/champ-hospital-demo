import { createClient } from '@supabase/supabase-js';

// Note: This is a placeholder for the Edge Function logic.
// In a real Supabase Edge Function, this would be in index.ts and use the Deno runtime.

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Missing Auth header', { status: 401 });

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  // Verify the caller is an active owner
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'owner' || !profile.is_active) {
    return new Response('Forbidden: Only active owners can create staff', { status: 403 });
  }

  const { username, password, full_name, role } = await req.json();

  // Map username to synthetic email
  const email = `${username.toLowerCase()}@staff.champhospital.internal`;

  const { data: authUser, error: createError } = await supabaseClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (createError) return new Response(createError.message, { status: 400 });

  const { error: profileError } = await supabaseClient
    .from('profiles')
    .insert({
      id: authUser.user.id,
      username: username.toLowerCase(),
      full_name,
      role,
    });

  if (profileError) return new Response(profileError.message, { status: 400 });

  return new Response(JSON.stringify({ id: authUser.user.id }), { status: 201 });
});
