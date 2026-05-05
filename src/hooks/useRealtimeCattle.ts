import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

/**
 * Hook untuk mendengarkan perubahan data secara real-time dari Supabase
 * dan menampilkannya di UI React (mengupdate context/state serta memicu toast).
 */
export const useRealtimeCattle = (updateCattleState) => {
  useEffect(() => {
    // 1. Mendengarkan masuknya data sensor baru
    const sensorSubscription = supabase
      .channel('sensor_data_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, (payload) => {
        const newData = payload.new;
        console.log('📡 Data sensor realtime diterima:', newData);
        
        // Memperbarui UI secara langsung
        if (updateCattleState) {
          updateCattleState(newData.cattle_id, {
            temp: newData.temperature,
            chewing: newData.chewing_rate,
            battery: newData.battery_level
          });
        }
      })
      .subscribe();

    // 2. Mendengarkan notifikasi anomali yang dipicu oleh Node.js Server
    const notifSubscription = supabase
      .channel('notification_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const notif = payload.new;
        
        // Memicu library Sonner untuk toast notification UI
        if (notif.type === 'warning' || notif.type === 'danger') {
          toast.error(`Peringatan: Sapi ${notif.cattle_id}`, {
            description: notif.message,
            duration: 8000,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sensorSubscription);
      supabase.removeChannel(notifSubscription);
    };
  }, [updateCattleState]);
};
