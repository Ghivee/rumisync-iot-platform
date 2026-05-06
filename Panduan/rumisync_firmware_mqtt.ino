// ============================================================
//  RUMI-SYNC ESP32 FIRMWARE — MQTT VERSION
//  Hardware → MQTT Broker → Railway Backend → Supabase → Vercel (Realtime)
//
//  Alur Data:
//  ESP32 → MQTT (broker.hivemq.com) → mqtt-backend (Railway) → Supabase
//                                                              ↓
//                                              Vercel (Supabase Realtime)
//
//  Library yang diperlukan (Arduino Library Manager):
//  - PubSubClient by Nick O'Leary
//  - Adafruit MLX90614 Library
//  - ArduinoJson by Benoit Blanchon
// ============================================================

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== KONFIGURASI JARINGAN =====
const char* WIFI_SSID       = "NamaWiFiKandang";
const char* WIFI_PASS       = "PasswordWiFi";

// ===== KONFIGURASI MQTT =====
// Harus sama persis dengan MQTT_BROKER_URL di mqtt-backend/.env Railway
const char* MQTT_SERVER     = "broker.hivemq.com";
const int   MQTT_PORT       = 1883;
const char* MQTT_USERNAME   = "";  // Kosong jika tidak pakai auth
const char* MQTT_PASSWORD   = "";  // Kosong jika tidak pakai auth

// Format topik: rumisync/cattle/<CATTLE_ID>
// Contoh: rumisync/cattle/ID-001
// Backend (Railway) subscribe ke: rumisync/cattle/+
const char* MQTT_TOPIC_BASE = "rumisync/cattle/";

// ===== ID SAPI PADA PERANGKAT INI =====
// Ganti sesuai ID sapi yang dipasangi sensor ini
// Format harus sama dengan yang ada di tabel cattle_inventory Supabase
const char* CATTLE_ID       = "ID-001";

// ===== KONFIGURASI PIN =====
#define MIC_ANALOG_PIN    34    // KY-038 Analog Out → GPIO34
#define MIC_DIGITAL_PIN   35    // KY-038 Digital Out → GPIO35
#define I2C_SDA           21    // MLX90614 SDA
#define I2C_SCL           22    // MLX90614 SCL

// ===== THRESHOLD KESEHATAN =====
#define SUHU_MIN           38.0f
#define SUHU_MAX           39.5f
#define CHEWING_NORMAL     60
#define CHEWING_WARNING    30
#define MIC_ADC_THRESHOLD  800
#define RUMINATION_MS      10000   // Durasi rekam kunyahan (10 detik)
#define SEND_INTERVAL_MS   30000   // Kirim data setiap 30 detik

// ===== OBJEK GLOBAL =====
Adafruit_MLX90614 mlx = Adafruit_MLX90614();
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ============================================================
//  KONEKSI WIFI
// ============================================================
void connectWifi() {
  Serial.print("[WiFi] Menghubungkan ke ");
  Serial.print(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  
  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Terhubung: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] GAGAL — ESP32 akan restart...");
    delay(3000);
    ESP.restart();
  }
}

// ============================================================
//  KONEKSI MQTT
// ============================================================
void connectMQTT() {
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  
  Serial.print("[MQTT] Menghubungkan ke broker...");
  
  // Client ID unik berdasarkan cattle ID
  String clientId = "RumiSync-";
  clientId += String(CATTLE_ID);
  
  int retries = 0;
  while (!mqttClient.connected() && retries < 5) {
    bool connected;
    if (strlen(MQTT_USERNAME) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }
    
    if (connected) {
      Serial.println(" OK!");
    } else {
      Serial.print(" Gagal (state=");
      Serial.print(mqttClient.state());
      Serial.println("), coba lagi...");
      delay(2000);
      retries++;
    }
  }
}

// ============================================================
//  BACA SUHU — MLX90614
// ============================================================
float bacaSuhu() {
  float suhu = mlx.readObjectTempC();
  
  // Validasi range fisik sapi
  if (suhu < 30.0 || suhu > 45.0) {
    Serial.println("[SUHU] Pembacaan tidak valid, retry...");
    delay(500);
    suhu = mlx.readObjectTempC();
  }
  
  Serial.printf("[SUHU] %.1f°C\n", suhu);
  return suhu;
}

// ============================================================
//  HITUNG KUNYAHAN (RUMINASI) — KY-038 Mic Sensor
// ============================================================
int bacaKunyahan() {
  int hitungKunyahan = 0;
  bool sebelumnyaBunyi = false;
  unsigned long mulai = millis();

  while (millis() - mulai < RUMINATION_MS) {
    int nilaiADC = analogRead(MIC_ANALOG_PIN);
    bool adaBunyi = (nilaiADC > MIC_ADC_THRESHOLD);

    if (adaBunyi && !sebelumnyaBunyi) {
      hitungKunyahan++;
    }
    sebelumnyaBunyi = adaBunyi;
    delay(8);
  }

  // Konversi 10 detik → per menit (×6)
  int chewingPerMenit = hitungKunyahan * 6;
  Serial.printf("[RUMINASI] %d x/menit\n", chewingPerMenit);
  return chewingPerMenit;
}

// ============================================================
//  KIRIM DATA VIA MQTT
//  Backend Railway akan menerima payload ini dan:
//  1. Simpan ke sensor_data (histori)
//  2. Update cattle_inventory (status terkini → trigger Realtime ke Vercel)
//  3. Buat notifikasi jika anomali terdeteksi
// ============================================================
void kirimDataMQTT(float suhu, int chewing) {
  // Pastikan masih terhubung MQTT
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  
  // Baca level baterai dari ADC (opsional, sesuai hardware)
  // Jika tidak ada sensor baterai, gunakan nilai fixed
  int batteryLevel = 85; // Ganti dengan pembacaan ADC jika ada
  
  // Build JSON payload sesuai format yang dibaca mqtt-backend/index.js:
  // { "temp": 38.5, "chewing": 65, "battery": 87 }
  StaticJsonDocument<256> doc;
  doc["temp"]    = suhu;
  doc["chewing"] = chewing;
  doc["battery"] = batteryLevel;
  
  String payload;
  serializeJson(doc, payload);
  
  // Topik: rumisync/cattle/ID-001
  String topic = String(MQTT_TOPIC_BASE) + String(CATTLE_ID);
  
  Serial.printf("[MQTT] Publish ke topik: %s\n", topic.c_str());
  Serial.printf("[MQTT] Payload: %s\n", payload.c_str());
  
  bool success = mqttClient.publish(topic.c_str(), payload.c_str(), true); // retained=true
  
  if (success) {
    Serial.println("[MQTT] ✅ Data berhasil dikirim → Railway → Supabase → Vercel");
  } else {
    Serial.println("[MQTT] ❌ Gagal kirim, cek koneksi broker");
  }
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n[RUMI-SYNC MQTT] Booting...");
  Serial.printf("[RUMI-SYNC] Cattle ID: %s\n", CATTLE_ID);

  // Init I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // Init MLX90614
  if (!mlx.begin()) {
    Serial.println("[ERROR] MLX90614 tidak terdeteksi!");
    while(1) delay(1000);
  }
  Serial.println("[OK] MLX90614 siap");

  // Init pin mic
  pinMode(MIC_DIGITAL_PIN, INPUT);
  Serial.println("[OK] KY-038 siap");

  // Koneksi WiFi
  connectWifi();
  
  // Koneksi MQTT
  connectMQTT();

  Serial.println("[RUMI-SYNC] Sistem aktif — mulai monitoring...\n");
}

// ============================================================
//  LOOP UTAMA
// ============================================================
unsigned long lastSendTime = 0;

void loop() {
  // Jaga koneksi MQTT tetap aktif (keepalive)
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Koneksi terputus, reconnect...");
    connectMQTT();
  }
  mqttClient.loop();
  
  // Pastikan WiFi tetap terhubung
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Koneksi terputus, reconnect...");
    connectWifi();
    connectMQTT();
  }
  
  // Kirim data setiap SEND_INTERVAL_MS (default: 30 detik)
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;
    
    Serial.println("\n[LOOP] Membaca sensor...");
    
    // 1. Baca suhu
    float suhu = bacaSuhu();
    
    // 2. Rekam ruminasi (10 detik)
    int chewing = bacaKunyahan();
    
    // 3. Kirim via MQTT → Railway → Supabase → Vercel (realtime)
    kirimDataMQTT(suhu, chewing);
    
    Serial.printf("[LOOP] Selesai. Kirim berikutnya dalam %d detik.\n\n", SEND_INTERVAL_MS / 1000);
  }
  
  delay(100); // Yield untuk MQTT keepalive
}
