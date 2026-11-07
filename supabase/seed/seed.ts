import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'https://deno.land/std@0.200.0/dotenv/mod.ts';

dotenv.load();

const supabase = createClient(
  Deno.env.get('VITE_SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

async function seed() {
  const ownerUsername = Deno.env.get('SEED_OWNER_USERNAME') || 'admin';
  const ownerPassword = Deno.env.get('SEED_OWNER_PASSWORD') || 'password123';

  console.log('Seeding initial owner...');
  const { data: ownerUser, error: ownerError } = await supabase.auth.admin.createUser({
    email: `${ownerUsername}@staff.champhospital.internal`,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { username: ownerUsername }
  });

  if (ownerError) throw ownerError;

  await supabase.from('profiles').insert({
    id: ownerUser.user.id,
    username: ownerUsername,
    full_name: 'Hospital Owner',
    role: 'owner',
    is_active: true
  });

  console.log('Seeding demo staff...');
  const staff = [
    { username: 'dr_smith', password: 'password123', full_name: 'Dr. Smith', role: 'doctor' },
    { username: 'nurse_jane', password: 'password123', full_name: 'Nurse Jane', role: 'nurse' },
  ];

  for (const s of staff) {
    const { data: user, error: uErr } = await supabase.auth.admin.createUser({
      email: `${s.username}@staff.champhospital.internal`,
      password: s.password,
      email_confirm: true,
      user_metadata: { username: s.username }
    });
    if (uErr) throw uErr;
    await supabase.from('profiles').insert({
      id: user.user.id,
      username: s.username,
      full_name: s.full_name,
      role: s.role,
      is_active: true
    });
  }

  console.log('Seeding completed successfully.');
}

seed().catch(console.error);
