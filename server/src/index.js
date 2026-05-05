import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import { checkAnomaly } from './services/anomalyService.js';

dotenv.config();

// 1. Koneksi ke MQTT Broker (Menerima data dari ESP32)
const mqttBrokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://test.mosquitto.org';
console.log(`Connecting to MQTT Broker: ${mqttBrokerUrl}`);

const mqttClient = mqtt.connect(mqttBrokerUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT Broker');
  
  // Subscribe ke topik sensor ESP32 (misal: rumisync/cattle/SAPI-001)
  mqttClient.subscribe('rumisync/cattle/+', (err) => {
    if (!err) {
      console.log('📡 Subscribed to RumiSync cattle topics');
    }
  });
});

// 2. Ingesti Data (Menerima data suhu & suara kunyahan)
mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const cattleId = topic.split('/').pop();
    
    // Format JSON yang diharapkan dari ESP32: { "temp": 39.6, "chewing": 45, "battery": 80 }
    console.log(`\n📥 Menerima data untuk ${cattleId}:`, data);

    // 3. Proses Logika Pencegahan Penyakit
    const isAnomaly = await checkAnomaly(cattleId, data);

    // 4. Penyimpanan ke Supabase Database
    const { error } = await supabase
      .from('sensor_data')
      .insert([
        { 
          cattle_id: cattleId, 
          temperature: data.temp, 
          chewing_rate: data.chewing, 
          battery_level: data.battery,
          status: isAnomaly ? 'danger' : 'normal',
          timestamp: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('❌ Gagal menyimpan ke Supabase:', error.message);
    } else {
      console.log('✅ Data berhasil disimpan ke Supabase.');
    }
    
    // Opsional: Perbarui status terkini sapi di tabel cattle_inventory
    await supabase
      .from('cattle_inventory')
      .update({
        current_temp: data.temp,
        current_chewing: data.chewing,
        battery: data.battery,
        health_status: isAnomaly ? 'Sakit' : 'Aman',
        last_updated: new Date().toISOString()
      })
      .eq('id', cattleId);

  } catch (error) {
    console.error('⚠️ Gagal memproses pesan MQTT:', error.message);
  }
});
