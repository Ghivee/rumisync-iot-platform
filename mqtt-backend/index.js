import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  ERROR: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
console.log('✅ Supabase client siap.');

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883', {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
});

mqttClient.on('connect', () => {
  console.log('✅ Terhubung ke MQTT Broker');
  mqttClient.subscribe('rumisync/cattle/+', err => {
    if (!err) console.log('📡 Subscribe: rumisync/cattle/+');
    else console.error('❌ Subscribe gagal:', err.message);
  });
});

mqttClient.on('reconnect', () => console.log('🔄 Reconnecting MQTT...'));
mqttClient.on('error', err => console.error('❌ MQTT Error:', err.message));

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const cattleId = topic.split('/').pop();

    if (!cattleId || data.temp == null || data.chewing == null) {
      console.warn('⚠️ Payload tidak valid:', { topic, data });
      return;
    }

    console.log(`\n📥 Data baru dari ${cattleId}:`, data);

    const isAnomaly = data.temp > 39.5 || data.chewing < 30;
    const alertMessage = data.temp > 39.5
      ? `Suhu tinggi terdeteksi (${data.temp}°C). Indikasi demam/infeksi!`
      : data.chewing < 30
        ? `Tingkat kunyahan rendah (${data.chewing}x/mnt). Indikasi gangguan pencernaan.`
        : '';

    // ─── STEP 1: UPSERT cattle_inventory DULU ──────────────
    // Ini memastikan FK constraint terpenuhi sebelum insert sensor_data/notifications
    const upsertPayload = {
      id: cattleId,
      name: `Sapi ${cattleId}`,
      current_temp: data.temp,
      current_chewing: data.chewing,
      battery: data.battery ?? null,
      health_status: isAnomaly ? 'Sakit' : 'Aman',
      last_updated: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('cattle_inventory')
      .upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) {
      console.error('❌ Gagal upsert cattle_inventory:', upsertError.message);
      return; // Stop — jangan insert anak tabel jika parent gagal
    }
    console.log(`✅ cattle_inventory [${cattleId}] upsert → realtime dikirim ke Vercel.`);

    // ─── STEP 2: Insert sensor_data (histori) ──────────────
    const { error: sensorError } = await supabase.from('sensor_data').insert([{
      cattle_id: cattleId,
      temperature: data.temp,
      chewing_rate: data.chewing,
      battery_level: data.battery ?? null,
      status: isAnomaly ? 'danger' : 'normal',
    }]);
    if (sensorError) console.error('❌ Gagal simpan sensor_data:', sensorError.message);
    else console.log('✅ sensor_data disimpan.');

    // ─── STEP 3: Insert notification (jika anomali) ────────
    if (isAnomaly) {
      console.log(`🚨 ANOMALI: ${alertMessage}`);
      const { error: notifError } = await supabase.from('notifications').insert([{
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false,
      }]);
      if (notifError) console.error('❌ Gagal simpan notifikasi:', notifError.message);
      else console.log('✅ Notifikasi anomali disimpan.');
    }

  } catch (err) {
    console.error('⚠️ Error memproses MQTT:', err.message);
  }
});
