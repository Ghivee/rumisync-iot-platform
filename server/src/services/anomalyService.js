import { supabase } from '../config/supabase.js';

/**
 * Memeriksa anomali pada data sensor sapi (suhu dan kunyahan).
 * Mengembalikan true jika terdapat anomali klinis.
 */
export const checkAnomaly = async (cattleId, data) => {
  let isAnomaly = false;
  let alertMessage = '';

  // 1. Logika Pencegahan Penyakit
  if (data.temp > 39.5) {
    isAnomaly = true;
    alertMessage = `Suhu tinggi terdeteksi (${data.temp}°C). Indikasi demam/infeksi!`;
  } else if (data.chewing < 30) {
    isAnomaly = true;
    alertMessage = `Tingkat kunyahan rendah (${data.chewing}x/mnt). Indikasi gangguan pencernaan.`;
  }

  // 2. Jika anomali, trigger notifikasi ke database
  if (isAnomaly) {
    console.log(`[ANOMALI TERDETEKSI] Sapi ${cattleId}: ${alertMessage}`);
    
    // Menyimpan notifikasi agar dapat dibaca oleh Frontend (React) secara Real-time
    await supabase.from('notifications').insert([
      {
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false,
        created_at: new Date().toISOString()
      }
    ]);
  }

  return isAnomaly;
};
