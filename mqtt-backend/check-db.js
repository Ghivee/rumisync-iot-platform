import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://zegtvozrgyjbmfsgglrb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

const supabaseService = createClient(supabaseUrl, supabaseKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

async function checkDatabase() {
  console.log('--- SERVICE ROLE ---');
  let res = await supabaseService.from('cattle_inventory').select('*');
  console.log('cattle_inventory rows:', res.data ? res.data.length : res.error);

  console.log('--- ANON KEY ---');
  res = await supabaseAnon.from('cattle_inventory').select('*');
  console.log('cattle_inventory rows:', res.data ? res.data.length : res.error);
}

checkDatabase();
