import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import http from 'http';
import { WebSocket } from 'ws';

dotenv.config();

// Polyfill WebSocket untuk Node.js 18 (Railway default)
// Supabase Realtime membutuhkan global WebSocket
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
  console.log('🔧 WebSocket polyfill aktif (Node <20)');
}

// ─── 1. HTTP SERVER DIMULAI PERTAMA ────────────────────────
// Railway langsung health-check port saat startup.
// Jika HTTP belum listen, Railway kirim SIGTERM dan kill proses.
// SOLUSI: listen ke port SEBELUM koneksi MQTT/Supabase.
const port = parseInt(process.env.PORT || '3000');

let mqttStatus = 'connecting';
let supabaseReady = false;
let startTime = Date.now();

const server = http.createServer((req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const body = JSON.stringify({
    status: 'ok',
    service: 'RumiSync MQTT Backend',
    mqtt: mqttStatus,
    supabase: supabaseReady ? 'ready' : 'connecting',
    uptime_seconds: uptime,
    timestamp: new Date().toISOString(),
    ghsi_formula: 'GHSI = max(1, (T_sub×0.4 + R_sub×0.6) - Penalty)',
  }, null, 2);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(body + '\n');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ HTTP server listening on 0.0.0.0:${port}`);
  console.log(`🔗 Health check: http://0.0.0.0:${port}/`);
  // Setelah HTTP ready, baru inisialisasi service lain
  initServices();
});

server.on('error', (err) => {
  console.error('❌ HTTP Server error:', err.message);
  process.exit(1);
});

// ─── 2. INISIALISASI SUPABASE + MQTT (async, setelah HTTP ready) ─
function initServices() {
  console.log('🚀 Inisialisasi Supabase + MQTT...');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('⚠️  ERROR: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset di Railway env vars!');
    // Tidak exit — HTTP server tetap berjalan agar Railway tidak restart terus
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  supabaseReady = true;
  console.log('✅ Supabase client siap:', supabaseUrl.substring(0, 40) + '...');

  // ─── MQTT Connect ─────────────────────────────────────────
  const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
  console.log('📡 Menghubungi MQTT Broker:', MQTT_BROKER);

  const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    keepalive: 60,
    clientId: `rumisync-${Math.random().toString(16).substr(2, 8)}`,
  });

  mqttClient.on('connect', () => {
    mqttStatus = 'connected';
    console.log('✅ Terhubung ke MQTT Broker:', MQTT_BROKER);

    // Subscribe semua variant topic Arduino
    const topics = [
      'rumisync/cattle/+',
      'rumisync/sapi/+',
      'rumi/cattle/+',
      'rumisync/#',
    ];
    topics.forEach(topic => {
      mqttClient.subscribe(topic, err => {
        if (!err) console.log('📡 Subscribed:', topic);
        else console.error('❌ Subscribe gagal:', topic, err.message);
      });
    });
  });

  mqttClient.on('reconnect', () => {
    mqttStatus = 'reconnecting';
    console.log('🔄 Reconnecting MQTT...');
  });
  mqttClient.on('error', err => {
    mqttStatus = 'error';
    console.error('❌ MQTT Error:', err.message);
  });
  mqttClient.on('offline', () => {
    mqttStatus = 'offline';
    console.warn('⚠️ MQTT Offline');
  });

  // ═══════════════════════════════════════════════════════════
  // GHSI — Global Health Score Index
  // Sumber: kode kesehatan.txt (implementasi PERSIS sesuai rumus)
  // ═══════════════════════════════════════════════════════════

  // 1. Kompensasi stres panas (THI)
  //    Di Indonesia (tropis lembab), THI ambient selalu ≥ 72,
  //    sehingga normalisasi CPM SELALU diterapkan.
  //    CPM_normalized = CPM_obs × (1 + 0.129)   jika THI ≥ 72
  //    CPM_normalized = CPM_obs                  jika THI < 72
  function normalizeCPM(cpm_obs) {
    // THI tropis Indonesia selalu ≥ 72 → selalu normalisasi
    return cpm_obs * (1 + 0.129);
  }

  // 2. Sub-Indeks Suhu (T_sub)
  //    T_sub = 100                            jika T ≤ 39.8°C
  //    T_sub = 100 − [(T−39.8)² × 90]        jika 39.8 < T ≤ 40.8°C
  //    T_sub = 0                              jika T > 40.8°C (hiperpireksia)
  function calcTSub(T) {
    if (T <= 39.8) return 100;
    if (T <= 40.8) return 100 - (Math.pow(T - 39.8, 2) * 90);
    return 0;
  }

  // 3. Sub-Indeks Ruminasi (R_sub)
  //    R_sub = 100                                    jika CPM_norm ≥ 50
  //    R_sub = 100 − [(50−CPM_norm)² × 1.5]          jika 40 ≤ CPM_norm < 50
  //    R_sub = max(0, 40 − [(40−CPM_norm)² × 4])     jika CPM_norm < 40
  function calcRSub(CPM_norm) {
    if (CPM_norm >= 50) return 100;
    if (CPM_norm >= 40) return 100 - (Math.pow(50 - CPM_norm, 2) * 1.5);
    return Math.max(0, 40 - (Math.pow(40 - CPM_norm, 2) * 4));
  }

  // 4–6. Hitung GHSI final
  //    Base    = (T_sub × 0.4) + (R_sub × 0.6)
  //    Penalty = (100−T_sub)/100 × (100−R_sub)/100 × 50
  //    GHSI    = max(1, Base − Penalty)
  function computeGHSI(tempC, chewingRaw) {
    const CPM_norm = normalizeCPM(chewingRaw);
    const T_sub    = calcTSub(tempC);
    const R_sub    = calcRSub(CPM_norm);
    const Base     = (T_sub * 0.4) + (R_sub * 0.6);
    const Penalty  = ((100 - T_sub) / 100) * ((100 - R_sub) / 100) * 50;
    const GHSI     = Math.max(1, Math.round(Base - Penalty));

    console.log(
      `   📊 GHSI Calc:\n` +
      `      CPM_obs=${chewingRaw} → CPM_norm=${CPM_norm.toFixed(2)}\n` +
      `      T_sub=${T_sub.toFixed(2)}  R_sub=${R_sub.toFixed(2)}\n` +
      `      Base=${Base.toFixed(2)}  Penalty=${Penalty.toFixed(2)}\n` +
      `      GHSI = max(1, ${Base.toFixed(2)} − ${Penalty.toFixed(2)}) = ${GHSI}`
    );
    return GHSI;
  }

  // ─── MQTT Message Handler ─────────────────────────────────
  mqttClient.on('message', async (topic, message) => {
    try {
      const rawMsg = message.toString().trim();
      console.log(`\n📨 [MQTT] Topic: ${topic} | Raw: ${rawMsg.substring(0, 150)}`);

      let rawData;
      try {
        rawData = JSON.parse(rawMsg);
      } catch {
        console.error('❌ Gagal parse JSON:', rawMsg);
        return;
      }

      // Normalisasi semua key ke lowercase
      const data = Object.keys(rawData).reduce((acc, key) => {
        acc[key.toLowerCase()] = rawData[key];
        return acc;
      }, {});

      // Extract Cattle ID dari topic: ID_001 → ID-001
      const topicParts = topic.split('/');
      let rawId = topicParts[topicParts.length - 1].toUpperCase();
      const numbersOnly = rawId.replace(/\D/g, '');
      const cattleId = numbersOnly ? `ID-${numbersOnly.padStart(3, '0')}` : rawId;

      if (!cattleId || cattleId === 'ID-') {
        console.warn('⚠️ Tidak bisa extract cattle ID dari topic:', topic);
        return;
      }
      console.log(`   🐄 Cattle ID: ${cattleId}`, data);

      // Update ESP Battery
      if (data.battery != null) {
        await supabase.from('esp_status').upsert(
          { id: 'main', battery: data.battery, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
        console.log(`   🔋 Battery: ${data.battery}%`);
      }

      // Partial payload (hanya RSSI)
      const tempVal = data.temp ?? data.temperature ?? null;
      const chewVal = data.chewing ?? data.chewing_rate ?? data.cpm ?? null;

      if (tempVal == null && chewVal == null) {
        if (data.rssi != null) {
          const { data: upd, error } = await supabase
            .from('cattle_inventory')
            .update({ current_rssi: data.rssi, last_updated: new Date().toISOString() })
            .eq('id', cattleId).select();
          if (error) console.error('❌ RSSI update error:', error.message);
          else if (!upd?.length) console.warn(`⚠️ [${cattleId}] tidak ada di DB!`);
          else console.log(`   ✅ RSSI [${cattleId}] → ${data.rssi} dBm`);
        }
        return;
      }

      if (tempVal == null || chewVal == null) {
        console.warn(`⚠️ Data tidak lengkap: temp=${tempVal} chewing=${chewVal}`);
        return;
      }

      const temp = parseFloat(tempVal);
      const chewing = parseFloat(chewVal);
      if (isNaN(temp) || isNaN(chewing)) {
        console.error(`❌ Nilai tidak valid: temp=${tempVal} chewing=${chewVal}`);
        return;
      }

      // Hitung GHSI
      const ghsi = computeGHSI(temp, chewing);
      const isAnomaly = ghsi < 60;
      const isWarning = ghsi < 80;
      const healthStatus = isAnomaly ? 'Sakit' : isWarning ? 'Pantauan' : 'Aman';

      let alertMessage = '';
      // Threshold mengacu pada CPM_norm boundary di R_sub:
      //   CPM_norm ≥ 50  → normal  (raw ≥ 50/1.129 ≈ 44)
      //   40 ≤ CPM_norm < 50 → zona kuning (raw 35–44)
      //   CPM_norm < 40  → zona merah  (raw < 35)
      if (temp > 40.8)       alertMessage = `HIPERPIREKSIA! Suhu ${temp.toFixed(1)}°C sangat berbahaya.`;
      else if (temp > 39.8)  alertMessage = `Suhu tinggi (${temp.toFixed(1)}°C). Indikasi demam/infeksi!`;
      else if (chewing < 35) alertMessage = `Kunyahan sangat rendah (${chewing}x/mnt). Gangguan pencernaan serius.`;
      else if (chewing < 44) alertMessage = `Kunyahan rendah (${chewing}x/mnt). Pantau kondisi sapi.`;

      // STEP 1: Upsert cattle_inventory
      const { error: upsertErr } = await supabase.from('cattle_inventory').upsert({
        id: cattleId,
        name: `Sapi ${cattleId}`,
        current_temp: temp,
        current_chewing: chewing,
        current_rssi: data.rssi ?? null,
        health_score: ghsi,
        health_status: healthStatus,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (upsertErr) { console.error('❌ upsert cattle_inventory:', upsertErr.message); return; }
      console.log(`   ✅ cattle_inventory [${cattleId}] → GHSI=${ghsi} Status=${healthStatus}`);

      // STEP 2: Insert sensor_data
      const { error: sensorErr } = await supabase.from('sensor_data').insert([{
        cattle_id: cattleId,
        temperature: temp,
        chewing_rate: chewing,
        rssi: data.rssi ?? null,
        status: isAnomaly ? 'danger' : isWarning ? 'warning' : 'normal',
      }]);
      if (sensorErr) console.error('❌ sensor_data:', sensorErr.message);
      else console.log(`   ✅ sensor_data disimpan`);

      // STEP 3: Insert notification jika anomali
      if (isAnomaly && alertMessage) {
        const { error: notifErr } = await supabase.from('notifications').insert([{
          cattle_id: cattleId, message: alertMessage, type: 'warning', is_read: false,
        }]);
        if (notifErr) console.error('❌ notifications:', notifErr.message);
        else console.log(`   🚨 Notifikasi: ${alertMessage}`);
      }

    } catch (err) {
      console.error('⚠️ Error MQTT handler:', err.message);
    }
  });

  // ─── Graceful Shutdown ─────────────────────────────────────
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM — shutting down...');
    mqttClient.end(true, () => {
      server.close(() => { console.log('✅ Shutdown OK'); process.exit(0); });
    });
    setTimeout(() => process.exit(0), 5000); // force exit jika stuck
  });
}

process.on('uncaughtException', err => console.error('💥 UncaughtException:', err.message));
process.on('unhandledRejection', reason => console.error('💥 UnhandledRejection:', reason));

console.log(`🚀 RumiSync MQTT Backend starting... PORT=${process.env.PORT || 3000}`);
