import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import http from 'http';

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

// ─── Fungsi hitung Skor Kesehatan Global ───────────────────
// Berdasarkan suhu dan kunyahan, menghasilkan skor 0–100
function computeHealthScore(temp, chewing) {
  let score = 100;

  // Penalti suhu: normal 38.0-39.0, warning 39.0-39.5, danger >39.5
  if (temp > 39.5) score -= 40;
  else if (temp > 39.0) score -= Math.round((temp - 39.0) * 40); // 0-20 penalti gradual
  else if (temp < 37.5) score -= 15; // hipotermia ringan

  // Penalti kunyahan: normal >60, warning 30-60, danger <30
  if (chewing < 30) score -= 40;
  else if (chewing < 60) score -= Math.round((60 - chewing) / 30 * 20); // 0-20 penalti gradual

  return Math.max(0, Math.min(100, score));
}

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());


    // ─── Handle data sapi ──────────────────────────────────
    const cattleId = topic.split('/').pop();

    if (!cattleId) return;

    console.log(`\n📥 Data baru dari ${cattleId}:`, data);

    // Update ESP Battery jika ada di payload (bisa terkirim tanpa suhu)
    if (data.battery != null) {
      await supabase.from('esp_status').upsert({
        id: 'main',
        battery: data.battery,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }

    // Jika hanya mengirim RSSI & Baterai (Sapi belum dekat palung makanan)
    if (data.temp == null || data.chewing == null) {
      if (data.rssi != null) {
        const { error } = await supabase
          .from('cattle_inventory')
          .update({ current_rssi: data.rssi, last_updated: new Date().toISOString() })
          .eq('id', cattleId);
        
        if (error) console.error('❌ Gagal update RSSI cattle_inventory:', error.message);
        else console.log(`✅ Update RSSI [${cattleId}] ke ${data.rssi}`);
      }
      return; // Selesai memproses partial payload
    }

    // Jika masuk ke sini, artinya ESP mengirim data lengkap (Suhu & Kunyahan)
    // Hitung skor kesehatan dari suhu & kunyahan
    const healthScore = computeHealthScore(data.temp, data.chewing);
    const isAnomaly = healthScore < 60;
    const isWarning = healthScore < 80;

    const alertMessage = data.temp > 39.5
      ? `Suhu tinggi terdeteksi (${data.temp}°C). Indikasi demam/infeksi!`
      : data.chewing < 30
        ? `Tingkat kunyahan rendah (${data.chewing}x/mnt). Indikasi gangguan pencernaan.`
        : '';

    // ─── STEP 1: UPSERT cattle_inventory ────────────────────
    const upsertPayload = {
      id: cattleId,
      name: `Sapi ${cattleId}`,
      current_temp: data.temp,
      current_chewing: data.chewing,
      current_rssi: data.rssi ?? null,
      health_score: healthScore,
      health_status: isAnomaly ? 'Sakit' : isWarning ? 'Pantauan' : 'Aman',
      last_updated: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('cattle_inventory')
      .upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) {
      console.error('❌ Gagal upsert cattle_inventory:', upsertError.message);
      return;
    }
    console.log(`✅ cattle_inventory [${cattleId}] upsert OK (health: ${healthScore}/100)`);

    // ─── STEP 2: Insert sensor_data (histori) ───────────────
    const { error: sensorError } = await supabase.from('sensor_data').insert([{
      cattle_id: cattleId,
      temperature: data.temp,
      chewing_rate: data.chewing,
      rssi: data.rssi ?? null,
      status: isAnomaly ? 'danger' : isWarning ? 'warning' : 'normal',
    }]);
    if (sensorError) console.error('❌ Gagal simpan sensor_data:', sensorError.message);
    else console.log('✅ sensor_data disimpan.');

    // ─── STEP 3: Insert notification (jika anomali) ─────────
    if (isAnomaly && alertMessage) {
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

// ─── Dummy HTTP Server untuk Railway ───────────────────────
// Railway mengharuskan aplikasi mengikat port (bind to PORT) agar tidak di-kill dengan SIGTERM
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RumiSync MQTT Backend is running!\n');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Dummy HTTP server listening on port ${port} (untuk Railway health check)`);
});
