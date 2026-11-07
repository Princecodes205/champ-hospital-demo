const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  console.log('Checking profiles table...');
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Profiles found:', data);
}

check();
