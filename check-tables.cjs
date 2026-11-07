const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.rpc('get_tables'); 
  // This only works if a custom function exists.
  // Let's try querying information_schema.
  const { data: tables, error: tableError } = await supabase
    .from('profiles') // We already know this fails
    .select('*')
    .limit(1);
  
  if (tableError) console.log('Profiles table missing as expected.');
}

check();
