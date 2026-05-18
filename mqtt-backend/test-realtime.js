import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const channel = supabase
  .channel('test-channel')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'cattle_inventory' }, (payload) => {
    console.log('REALTIME EVENT RECEIVED:', payload);
  })
  .subscribe((status) => {
    console.log('Subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('Updating cattle_inventory to trigger event...');
      supabase.from('cattle_inventory').update({ current_rssi: -10 }).eq('id', 'ID-001').then(res => {
         console.log('Update result:', res.error ? res.error : 'Success');
      });
    }
  });

setTimeout(() => {
  console.log('Exiting...');
  process.exit(0);
}, 5000);
