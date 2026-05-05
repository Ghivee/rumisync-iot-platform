import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client (mengambil dari Environment Variables Vercel)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Pastikan inisialisasi aman
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

/**
 * VERCEL SERVERLESS FUNCTION (Endpoint API)
 * File ini akan otomatis menjadi endpoint: https://domain-anda.vercel.app/api/ingest
 * ESP32 harus melakukan HTTP POST ke URL tersebut.
 */
export default async function handler(req, res) {
  // Hanya menerima metode POST dari ESP32
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak diizinkan. Gunakan POST.' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Konfigurasi Supabase belum diset di Vercel Environment Variables.' });
  }

  try {
    // 1. Ekstrak data JSON yang dikirim oleh ESP32
    // Contoh format dari ESP32: { "id": "ID-002", "temp": 39.6, "chewing": 45, "battery": 80 }
    const { id: cattleId, temp, chewing, battery } = req.body;

    if (!cattleId) {
      return res.status(400).json({ error: 'ID sapi (id) tidak ditemukan dalam payload.' });
    }

    let isAnomaly = false;
    let alertMessage = '';

    // 2. LOGIKA PENCEGAHAN PENYAKIT (Suhu & Kunyahan)
    if (temp > 39.5) {
      isAnomaly = true;
      alertMessage = `Suhu tinggi terdeteksi (${temp}°C). Indikasi demam/infeksi!`;
    } else if (chewing < 30) {
      isAnomaly = true;
      alertMessage = `Tingkat kunyahan rendah (${chewing}x/mnt). Indikasi gangguan pencernaan.`;
    }

    // 3. JIKA ANOMALI, KIRIM NOTIFIKASI KE DATABASE
    if (isAnomaly) {
      console.log(`[ANOMALI SAPI ${cattleId}]: ${alertMessage}`);
      await supabase.from('notifications').insert([{
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false,
        created_at: new Date().toISOString()
      }]);
    }

    // 4. SIMPAN DATA HISTORI SENSOR
    const { error: insertError } = await supabase.from('sensor_data').insert([{ 
      cattle_id: cattleId, 
      temperature: temp, 
      chewing_rate: chewing, 
      battery_level: battery,
      status: isAnomaly ? 'danger' : 'normal',
      timestamp: new Date().toISOString()
    }]);

    if (insertError) throw insertError;

    // 5. PERBARUI STATUS TERKINI INVENTARIS SAPI
    await supabase.from('cattle_inventory').update({
      current_temp: temp,
      current_chewing: chewing,
      battery: battery,
      health_status: isAnomaly ? 'Sakit' : 'Aman',
      last_updated: new Date().toISOString()
    }).eq('id', cattleId);

    // Kirim respons "OK" kembali ke ESP32
    return res.status(200).json({ 
      success: true, 
      message: 'Data berhasil diterima dan disimpan di Supabase.',
      anomaly_detected: isAnomaly
    });

  } catch (error) {
    console.error('Error saat memproses data:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server (ingest).' });
  }
}
