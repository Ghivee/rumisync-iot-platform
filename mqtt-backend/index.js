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
console.log('🌐 Supabase URL:', supabaseUrl?.substring(0, 40) + '...');

const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
console.log('📡 Menghubungi MQTT Broker:', MQTT_BROKER);

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  keepalive: 60,
  clientId: `rumisync-backend-${Math.random().toString(16).substr(2, 8)}`,
});

mqttClient.on('connect', () => {
  console.log('✅ Terhubung ke MQTT Broker:', MQTT_BROKER);

  // Subscribe semua variant topic yang mungkin dikirim Arduino
  const topics = [
    'rumisync/cattle/+',      // rumisync/cattle/ID_001
    'rumisync/sapi/+',        // variant lain
    'rumi/cattle/+',          // variant pendek
    'rumisync/#',             // wildcard semua subtopic
  ];

  topics.forEach(topic => {
    mqttClient.subscribe(topic, err => {
      if (!err) console.log('📡 Subscribed:', topic);
      else console.error('❌ Subscribe gagal:', topic, err.message);
    });
  });
});

mqttClient.on('reconnect', () => console.log('🔄 Reconnecting MQTT...'));
mqttClient.on('error', err => console.error('❌ MQTT Error:', err.message));
mqttClient.on('offline', () => console.warn('⚠️ MQTT Offline'));
mqttClient.on('close', () => console.warn('⚠️ MQTT Connection Closed'));

// ─── GHSI: Global Health Score Index ────────────────────────
// Implementasi sesuai kode kesehatan.txt
// Rumus: GHSI = max(1, Base − Penalty)
// Base = (T_sub × 0.4) + (R_sub × 0.6)
// Penalty = (100−T_sub)/100 × (100−R_sub)/100 × 50

/**
 * Kompensasi stres panas (THI - Temperature Humidity Index)
 * Jika THI ≥ 72 maka kunyahan dinaikkan 12.9% untuk normalisasi
 * THI = 0.8×T + RH/100×(T-14.4) + 46.4
 * Karena kita tidak punya RH dari sensor, gunakan estimasi THI dari suhu saja
 * THI approx = suhu × 1.8 + 20 (estimasi tropis)
 */
function normalizeCPM(cpm, tempC) {
  const THI_approx = tempC * 1.8 + 20; // estimasi untuk daerah tropis lembab
  if (THI_approx >= 72) {
    return cpm * (1 + 0.129); // kompensasi stres panas
  }
  return cpm;
}

/**
 * Sub-Indeks Suhu (T_sub)
 * T_sub = 100                           jika T ≤ 39.8°C
 * T_sub = 100 − [(T−39.8)² × 90]       jika 39.8 < T ≤ 40.8°C
 * T_sub = 0                             jika T > 40.8°C (hiperpireksia)
 */
function calcTSub(tempC) {
  if (tempC <= 39.8) return 100;
  if (tempC <= 40.8) return Math.max(0, 100 - Math.pow(tempC - 39.8, 2) * 90);
  return 0;
}

/**
 * Sub-Indeks Ruminasi (R_sub) — menggunakan CPM_norm
 * R_sub = 100                                    jika CPM_norm ≥ 50
 * R_sub = 100 − [(50−CPM_norm)² × 1.5]          jika 40 ≤ CPM_norm < 50
 * R_sub = max(0, 40 − [(40−CPM_norm)² × 4])     jika CPM_norm < 40
 */
function calcRSub(cpmNorm) {
  if (cpmNorm >= 50) return 100;
  if (cpmNorm >= 40) return Math.max(0, 100 - Math.pow(50 - cpmNorm, 2) * 1.5);
  return Math.max(0, 40 - Math.pow(40 - cpmNorm, 2) * 4);
}

/**
 * Hitung GHSI (Global Health Score Index) — Range 1–100
 * Sesuai kode kesehatan.txt
 */
function computeGHSI(tempC, chewingRaw) {
  // 1. Normalisasi kunyahan dengan kompensasi THI
  const cpmNorm = normalizeCPM(chewingRaw, tempC);

  // 2. Hitung sub-indeks
  const tSub = calcTSub(tempC);
  const rSub = calcRSub(cpmNorm);

  // 3. Skor dasar (40% termal, 60% ruminasi)
  const base = (tSub * 0.4) + (rSub * 0.6);

  // 4. Penalti sinergistik (keduanya parah)
  const penalty = ((100 - tSub) / 100) * ((100 - rSub) / 100) * 50;

  // 5. GHSI final
  const ghsi = Math.max(1, Math.round(base - penalty));

  console.log(`   📊 GHSI Debug: T=${tempC}°C, CPM_raw=${chewingRaw}, CPM_norm=${cpmNorm.toFixed(1)}`);
  console.log(`   📊 T_sub=${tSub.toFixed(1)}, R_sub=${rSub.toFixed(1)}, Base=${base.toFixed(1)}, Penalty=${penalty.toFixed(1)}, GHSI=${ghsi}`);

  return ghsi;
}

// ─── MQTT Message Handler ───────────────────────────────────
mqttClient.on('message', async (topic, message) => {
  try {
    const rawMsg = message.toString().trim();
    console.log(`\n📨 [MQTT] Topic: ${topic}`);
    console.log(`   Raw: ${rawMsg.substring(0, 200)}`);

    // Parse JSON - toleransi format berbeda dari Arduino
    let rawData;
    try {
      rawData = JSON.parse(rawMsg);
    } catch (parseErr) {
      console.error('❌ Gagal parse JSON:', parseErr.message, '| Raw:', rawMsg);
      return;
    }

    // Normalisasi semua key ke lowercase
    const data = Object.keys(rawData).reduce((acc, key) => {
      acc[key.toLowerCase()] = rawData[key];
      return acc;
    }, {});

    console.log(`   Parsed data:`, data);

    // ─── Extract Cattle ID dari topic ──────────────────────
    const topicParts = topic.split('/');
    let rawId = topicParts[topicParts.length - 1].toUpperCase();

    // Normalisasi: "ID_001" → "ID-001", "001" → "ID-001", "1" → "ID-001"
    const numbersOnly = rawId.replace(/\D/g, '');
    if (numbersOnly) {
      rawId = `ID-${numbersOnly.padStart(3, '0')}`;
    }
    const cattleId = rawId;

    if (!cattleId || cattleId === 'ID-') {
      console.warn('⚠️ Tidak bisa extract cattle ID dari topic:', topic);
      return;
    }

    console.log(`   🐄 Cattle ID: ${cattleId}`);

    // ─── Update ESP Battery ─────────────────────────────────
    if (data.battery != null) {
      const { error: battErr } = await supabase.from('esp_status').upsert({
        id: 'main',
        battery: data.battery,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (battErr) console.error('❌ Gagal update battery:', battErr.message);
      else console.log(`   🔋 Battery updated: ${data.battery}%`);
    }

    // ─── Partial payload: hanya RSSI ───────────────────────
    if (data.temp == null && data.temperature == null && data.chewing == null && data.chewing_rate == null) {
      if (data.rssi != null) {
        const { data: updatedData, error } = await supabase
          .from('cattle_inventory')
          .update({ current_rssi: data.rssi, last_updated: new Date().toISOString() })
          .eq('id', cattleId)
          .select();

        if (error) console.error('❌ Gagal update RSSI:', error.message);
        else if (!updatedData || updatedData.length === 0)
          console.warn(`⚠️ ID Sapi [${cattleId}] tidak ada di database!`);
        else console.log(`   ✅ RSSI [${cattleId}] → ${data.rssi} dBm`);
      }
      return;
    }

    // ─── Data lengkap: suhu + kunyahan ─────────────────────
    // Support berbagai nama field dari Arduino: temp/temperature, chewing/chewing_rate/cpm
    const tempVal = data.temp ?? data.temperature ?? null;
    const chewVal = data.chewing ?? data.chewing_rate ?? data.cpm ?? null;

    if (tempVal == null || chewVal == null) {
      console.warn(`⚠️ Data tidak lengkap untuk ${cattleId}. temp=${tempVal}, chewing=${chewVal}`);
      return;
    }

    const temp = parseFloat(tempVal);
    const chewing = parseFloat(chewVal);

    if (isNaN(temp) || isNaN(chewing)) {
      console.error(`❌ Nilai tidak valid: temp=${tempVal}, chewing=${chewVal}`);
      return;
    }

    // ─── Hitung GHSI ────────────────────────────────────────
    const ghsi = computeGHSI(temp, chewing);
    const isAnomaly = ghsi < 60;
    const isWarning = ghsi < 80;

    const healthStatus = isAnomaly ? 'Sakit' : isWarning ? 'Pantauan' : 'Aman';

    // Buat pesan alert yang deskriptif
    let alertMessage = '';
    if (temp > 40.8) {
      alertMessage = `HIPERPIREKSIA terdeteksi! Suhu ${temp.toFixed(1)}°C sangat berbahaya.`;
    } else if (temp > 39.8) {
      alertMessage = `Suhu tinggi terdeteksi (${temp.toFixed(1)}°C). Indikasi demam/infeksi!`;
    } else if (chewing < 30) {
      alertMessage = `Tingkat kunyahan sangat rendah (${chewing}x/mnt). Gangguan pencernaan serius.`;
    } else if (chewing < 40) {
      alertMessage = `Kunyahan rendah (${chewing}x/mnt). Pantau kondisi sapi.`;
    }

    console.log(`   🏥 GHSI=${ghsi}/100, Status=${healthStatus}${alertMessage ? ', Alert: ' + alertMessage : ''}`);

    // ─── STEP 1: Upsert cattle_inventory ───────────────────
    const upsertPayload = {
      id: cattleId,
      name: `Sapi ${cattleId}`,
      current_temp: temp,
      current_chewing: chewing,
      current_rssi: data.rssi ?? null,
      health_score: ghsi,
      health_status: healthStatus,
      last_updated: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('cattle_inventory')
      .upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) {
      console.error('❌ Gagal upsert cattle_inventory:', upsertError.message);
      return;
    }
    console.log(`   ✅ cattle_inventory [${cattleId}] OK | GHSI: ${ghsi}/100`);

    // ─── STEP 2: Insert sensor_data (histori) ──────────────
    const { error: sensorError } = await supabase.from('sensor_data').insert([{
      cattle_id: cattleId,
      temperature: temp,
      chewing_rate: chewing,
      rssi: data.rssi ?? null,
      status: isAnomaly ? 'danger' : isWarning ? 'warning' : 'normal',
    }]);
    if (sensorError) console.error('❌ Gagal simpan sensor_data:', sensorError.message);
    else console.log(`   ✅ sensor_data disimpan.`);

    // ─── STEP 3: Insert notification jika anomali ──────────
    if (isAnomaly && alertMessage) {
      console.log(`   🚨 ANOMALI: ${alertMessage}`);
      const { error: notifError } = await supabase.from('notifications').insert([{
        cattle_id: cattleId,
        message: alertMessage,
        type: 'warning',
        is_read: false,
      }]);
      if (notifError) console.error('❌ Gagal simpan notifikasi:', notifError.message);
      else console.log(`   ✅ Notifikasi anomali disimpan.`);
    }

  } catch (err) {
    console.error('⚠️ Error memproses MQTT:', err.message, err.stack);
  }
});

// ─── HTTP Server untuk Railway health check ─────────────────
const port = parseInt(process.env.PORT || '3000');
const server = http.createServer((req, res) => {
  const status = {
    status: 'running',
    service: 'RumiSync MQTT Backend',
    mqtt: mqttClient.connected ? 'connected' : 'disconnected',
    mqttBroker: MQTT_BROKER,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    ghsiFormula: 'GHSI = max(1, (T_sub×0.4 + R_sub×0.6) - Penalty)'
  };

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2) + '\n');
  } else if (req.url === '/test-mqtt') {
    // Endpoint untuk test publish MQTT
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Use POST to publish test data' }) + '\n');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ HTTP server listening on port ${port}`);
  console.log(`📋 Health check: http://0.0.0.0:${port}/health`);
});

server.on('error', (err) => {
  console.error('❌ HTTP Server error:', err.message);
});

// ─── Graceful Shutdown ──────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  mqttClient.end(true, () => {
    server.close(() => {
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
  });
});

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

console.log('🚀 RumiSync MQTT Backend starting...');
console.log('📐 GHSI Formula: kode kesehatan.txt (THI-compensated, T_sub + R_sub + Penalty)');
