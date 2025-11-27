import { supabase } from './lib/supabase';

async function main() {
  console.log('AI Scrapbook - Connected to Supabase');

  // Test connection by checking if we can reach Supabase
  const { error } = await supabase.from('_test_connection').select('*').limit(1);

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = table doesn't exist, which is expected
    console.error('Connection error:', error.message);
  } else {
    console.log('Supabase connection successful!');
  }
}

main().catch(console.error);
