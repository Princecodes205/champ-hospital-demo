const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  const ownerUsername = process.env.SEED_OWNER_USERNAME || 'champ';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'champ123$';
  const ownerEmail = `${ownerUsername.toLowerCase()}@staff.champhospital.internal`;

  console.log(`Seeding owner: ${ownerUsername}...`);

  // Check if user exists
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;

  const existingUser = users.users.find(u => u.email === ownerEmail);

  if (!existingUser) {
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { username: ownerUsername }
    });

    if (createError) throw createError;

    await supabase.from('profiles').upsert({
      id: authUser.user.id,
      username: ownerUsername.toLowerCase(),
      full_name: 'Hospital Owner',
      role: 'owner',
      is_active: true
    });
    console.log('✅ Owner created successfully.');
  } else {
    console.log('ℹ️ Owner already exists.');
  }

  const staff = [
    { username: 'dr_smith', password: 'password123', full_name: 'Dr. Smith', role: 'doctor' },
    { username: 'nurse_jane', password: 'password123', full_name: 'Nurse Jane', role: 'nurse' },
  ];

  for (const s of staff) {
    const email = `${s.username.toLowerCase()}@staff.champhospital.internal`;
    const existingStaff = users.users.find(u => u.email === email);

    if (!existingStaff) {
      console.log(`Seeding staff: ${s.username}...`);
      const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: s.password,
        email_confirm: true,
        user_metadata: { username: s.username }
      });

      if (createError) {
        console.error(`Error creating ${s.username}: ${createError.message}`);
        continue;
      }

      await supabase.from('profiles').upsert({
        id: authUser.user.id,
        username: s.username.toLowerCase(),
        full_name: s.full_name,
        role: s.role,
        is_active: true
      });
    }
  }

  console.log('🚀 Seeding completed.');
}

seed().catch(console.error);
