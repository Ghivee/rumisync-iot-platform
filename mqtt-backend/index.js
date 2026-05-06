import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// ============================================================
// 1. Inisialisasi Supabase dengan SERVICE_ROLE_KEY
//    (agar bisa bypass RLS dan write data dari backend/Railway)
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  ERROR: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset di .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

console.log('✅ Supabase client inisialisasi berhasil.');

// ============================================================
// 2. Koneksi ke MQTT Broker
// ============================================================
const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
console.log(`🔗 Menghubungkan ke MQTT Broker: ${mqttBrokerUrl}...`);

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000, // Auto reconnect setiap 5 detik jika terputus
  connectTimeout: 30000,
});

mqttClient.on('connect', () => {
  console.log('✅ Berhasil terhubung ke MQTT Broker');

  // Subscribe ke topik sensor ESP32: rumisync/cattle/<CATTLE_ID>
  mqttClient.subscribe('rumisync/cattle/+', (err) => {
    if (!err) {
      console.log('📡 Mendengarkan topik MQTT: rumisync/cattle/+');
    } else {
      console.error('❌ Gagal subscribe:', err.message);
    }
  });
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Mencoba reconnect ke MQTT Broker...');
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
});

// ============================================================
// 3. Proses pesan masuk dari hardware ESP32
//    Payload yang diharapkan (JSON):
//    { "temp": 38.5, "chewing": 65, "battery": 87 }
// ============================================================
mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const cattleId = topic.split('/').pop(); // Ambil ID dari ujung topik: ID-001

    if (!cattleId) {
      console.warn('⚠️ Topik tidak valid, tidak ada cattle ID:', topic);
      return;
    }

    console.log(`\n📥 Data baru dari ${cattleId}:`, data);

    // Validasi field wajib
    if (data.temp == null || data.chewing == null) {
      console.warn(`⚠️ Data dari ${cattleId} tidak lengkap:`, data);
      return;
    }

    // ─── Logika Deteksi Anomali ────────────────────────
    let isAnomaly = false;
    let alertMessage = '';

    if (data.temp > 39.5) {
      isAnomaly = true;
      alertMessage = `Suhu tinggi terdeteksi (${data.temp}°C). Indikasi demam/infeksi!`;
    } else if (data.chewing < 30) {
      isAnomaly = true;
      alertMessage = `Tingkat kunyahan rendah (${data.chewing}x/mnt). Indikasi gangguan pencernaan.`;
    }

    // ─── Simpan Notifikasi Anomali ─────────────────────
    if (isAnomaly) {
      console.log(`🚨 [ANOMALI TERDETEKSI]: ${alertMessage}`);
      const { error: notifError } = await supabase.from('notifications').insert([{
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false,
      }]);
      if (notifError) console.error('❌ Gagal simpan notifikasi:', notifError.message);
    }

    // ─── Simpan Histori Sensor ─────────────────────────
    const { error: insertError } = await supabase.from('sensor_data').insert([{
      cattle_id: cattleId,
      temperature: data.temp,
      chewing_rate: data.chewing,
      battery_level: data.battery ?? null,
      status: isAnomaly ? 'danger' : 'normal',
    }]);

    if (insertError) {
      console.error('❌ Gagal menyimpan sensor_data ke Supabase:', insertError.message);
    } else {
      console.log('✅ sensor_data berhasil disimpan.');
    }

    // ─── Update Status Terkini di cattle_inventory ─────
    // Ini akan men-trigger Supabase Realtime ke frontend Vercel secara otomatis
    const { error: updateError } = await supabase
      .from('cattle_inventory')
      .update({
        current_temp: data.temp,
        current_chewing: data.chewing,
        battery: data.battery ?? null,
        health_status: isAnomaly ? 'Sakit' : 'Aman',
        last_updated: new Date().toISOString(),
      })
      .eq('id', cattleId);

    if (updateError) {
      console.error('❌ Gagal update cattle_inventory:', updateError.message);
      // Jika sapi belum ada di inventory, buat baru
      if (updateError.code === 'PGRST116' || updateError.details?.includes('0 rows')) {
        console.log(`📝 Membuat entri baru untuk ${cattleId}...`);
        await supabase.from('cattle_inventory').insert([{
          id: cattleId,
          name: `Sapi ${cattleId}`,
          current_temp: data.temp,
          current_chewing: data.chewing,
          battery: data.battery ?? null,
          health_status: isAnomaly ? 'Sakit' : 'Aman',
          last_updated: new Date().toISOString(),
        }]);
      }
    } else {
      console.log(`✅ cattle_inventory [${cattleId}] diperbarui → realtime update dikirim ke Vercel.`);
    }

  } catch (error) {
    console.error('⚠️ Gagal memproses pesan MQTT:', error.message);
  }
});
