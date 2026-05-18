import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zegtvozrgyjbmfsgglrb.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZ3R2b3pyZ3lqYm1mc2dnbHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjQyOTQsImV4cCI6MjA5MzU0MDI5NH0.KnlbxyYKttfDLCwAs_V7xqBwiDSzR9z4djkrj9Ggi40';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing connection to Supabase...');
  const { data, error } = await supabase.from('cattle_inventory').select('*');
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log('Data fetched successfully:', data.length, 'rows');
    console.log(data);
  }
}

testConnection();
