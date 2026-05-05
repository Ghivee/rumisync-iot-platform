import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// 1. Inisialisasi Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️  ERROR: Supabase URL atau Key belum diset di .env");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Koneksi ke MQTT Broker
const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
console.log(`Menghubungkan ke MQTT Broker: ${mqttBrokerUrl}...`);

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

mqttClient.on('connect', () => {
  console.log('✅ Berhasil terhubung ke MQTT Broker');
  
  // Subscribe ke topik sensor ESP32 (contoh: rumisync/cattle/ID-001)
  mqttClient.subscribe('rumisync/cattle/+', (err) => {
    if (!err) {
      console.log('📡 Mendengarkan topik MQTT: rumisync/cattle/+');
    }
  });
});

// 3. Menangani Data yang Masuk (Ingesti)
mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const cattleId = topic.split('/').pop(); // Ambil ID dari ujung topik
    
    console.log(`\n📥 Data baru dari ${cattleId}:`, data);

    let isAnomaly = false;
    let alertMessage = '';

    // 4. Logika Pencegahan Penyakit
    if (data.temp > 39.5) {
      isAnomaly = true;
      alertMessage = `Suhu tinggi terdeteksi (${data.temp}°C). Indikasi demam/infeksi!`;
    } else if (data.chewing < 30) {
      isAnomaly = true;
      alertMessage = `Tingkat kunyahan rendah (${data.chewing}x/mnt). Indikasi gangguan pencernaan.`;
    }

    // 5. Simpan Notifikasi Anomali (Jika ada)
    if (isAnomaly) {
      console.log(`🚨 [ANOMALI TERDETEKSI]: ${alertMessage}`);
      await supabase.from('notifications').insert([{
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false
      }]);
    }

    // 6. Simpan Data Histori Sensor ke Supabase
    const { error: insertError } = await supabase.from('sensor_data').insert([{ 
      cattle_id: cattleId, 
      temperature: data.temp, 
      chewing_rate: data.chewing, 
      battery_level: data.battery,
      status: isAnomaly ? 'danger' : 'normal'
    }]);

    if (insertError) {
      console.error('❌ Gagal menyimpan ke Supabase:', insertError.message);
    } else {
      console.log('✅ Data berhasil disimpan ke database.');
    }

    // 7. Update status terkini di inventaris
    await supabase.from('cattle_inventory').update({
      current_temp: data.temp,
      current_chewing: data.chewing,
      battery: data.battery,
      health_status: isAnomaly ? 'Sakit' : 'Aman',
      last_updated: new Date().toISOString()
    }).eq('id', cattleId);

  } catch (error) {
    console.error('⚠️ Gagal memproses pesan MQTT:', error.message);
  }
});
