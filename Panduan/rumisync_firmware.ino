// ============================================================
//  RUMI-SYNC ESP32 FIRMWARE - INTEGRASI PENUH DENGAN WEB APP
//  Versi: 1.0 | Cocok dengan index-DEBBaNuR.js
//
//  Data model ini didesain PERSIS sesuai struktur yang dibaca
//  oleh setiap halaman di ghivee.github.io/rumisync-iot/
//
//  Halaman yang diisi oleh firmware ini:
//  [/]             Dashboard   → id, temp, chewing, status, time
//  [/medical]      EWS         → health, rumination.{frequency, duration, status, ...}
//  [/eco-nutrition]Eco-Nutrisi → methaneLevel, rumination.{intensity, feedType, feedBoost, ...}
//  [/system-control] Kontrol  → mac, rssi, position
// ============================================================

#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ===== KONFIGURASI JARINGAN =====
const char* WIFI_SSID     = "NamaWiFiKandang";
const char* WIFI_PASS     = "PasswordWiFi";

// Ganti dengan URL server kamu (bisa localhost, VPS, atau ngrok untuk testing)
const char* SERVER_URL    = "http://192.168.1.100:3000/api/data";

// NTP untuk timestamp yang akurat (sesuai format "14:32" di dashboard)
const char* NTP_SERVER    = "pool.ntp.org";
const long  GMT_OFFSET    = 25200;   // WIB = UTC+7 = 7*3600
const int   DST_OFFSET    = 0;

// ===== KONFIGURASI PIN =====
#define MIC_ANALOG_PIN    34    // KY-038 Analog Out → GPIO34 (ADC1_CH6)
#define MIC_DIGITAL_PIN   35    // KY-038 Digital Out → GPIO35
#define I2C_SDA           21    // MLX90614 SDA
#define I2C_SCL           22    // MLX90614 SCL

// ===== DAFTAR ITAG BLE (MAC ADDRESS sapi terdaftar) =====
// Format sesuai yang ada di software: mac: "A4:C1:38:7F:2E:D1"
// Ganti dengan MAC address iTag sapi kamu yang sebenarnya
struct SapiProfile {
  String mac;           // MAC address iTag (lowercase)
  String id;            // ID sapi (format: "ID-XXX")
  String name;          // Nama sapi (format: "SAPI LOKAL - ID-XXX")
  String gender;        // "Betina" atau "Jantan"
  int    ageYear;
  int    ageMonth;
  int    ageDay;
  int    relPosition;   // Posisi di rel (0-100), sesuai array Ul di web
};

// ---- DAFTAR SAPI — sesuaikan MAC dengan iTag fisik kamu ----
SapiProfile SAPI_DB[] = {
  {"a4:c1:38:7f:2e:d1", "ID-002", "SAPI LOKAL - ID-002", "Betina",  3, 5, 12, 15},
  {"b2:d8:4a:9c:1f:e3", "ID-005", "SAPI LOKAL - ID-005", "Jantan",  1,11,  7, 28},
  {"c5:e9:2b:8d:3a:f2", "ID-007", "SAPI LOKAL - ID-007", "Betina",  4, 2, 18, 42},
  {"d1:f4:5c:7e:4b:a5", "ID-009", "SAPI LOKAL - ID-009", "Betina",  2, 1,  5, 56},
  {"e3:a7:6d:9f:5c:b8", "ID-012", "SAPI LOKAL - ID-012", "Jantan",  5, 3, 22, 70},
  {"f8:b2:7e:a1:6d:c9", "ID-014", "SAPI LOKAL - ID-014", "Jantan",  3, 9, 14, 85},
};
const int SAPI_COUNT = sizeof(SAPI_DB) / sizeof(SAPI_DB[0]);

// ===== THRESHOLD KESEHATAN =====
// Sesuai batas normal yang ditampilkan di halaman medical:
// "Batas Normal: 39.5°C" dan "Normal: 60x/mnt" dari Recharts chart
#define SUHU_MIN           38.0f   // °C
#define SUHU_MAX           39.5f   // °C — batas ditampilkan di kurva suhu
#define CHEWING_NORMAL     60      // x/menit — referensi di ReferenceLine chart
#define CHEWING_WARNING    45      // di bawah ini = "warning"
#define MIC_ADC_THRESHOLD  800     // nilai ADC untuk deteksi 1 kunyahan
#define SCAN_DURATION_SEC  3       // durasi BLE scan per siklus
#define RUMINATION_MS      10000   // durasi rekam kunyahan (10 detik)

// ===== OBJEK SENSOR =====
Adafruit_MLX90614 mlx = Adafruit_MLX90614();
BLEScan* pBLEScan;

// ===== VARIABEL STATE =====
int       lastRssi       = -99;
SapiProfile* currentSapi = nullptr;

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n[RUMI-SYNC] Booting...");

  // Init I2C dengan pin custom
  Wire.begin(I2C_SDA, I2C_SCL);

  // Init MLX90614
  if (!mlx.begin()) {
    Serial.println("[ERROR] MLX90614 tidak terdeteksi! Periksa wiring SDA/SCL.");
    while(1) delay(1000);
  }
  Serial.println("[OK] MLX90614 siap");

  // Init pin mic
  pinMode(MIC_DIGITAL_PIN, INPUT);
  Serial.println("[OK] KY-038 siap");

  // Koneksi WiFi
  connectWifi();

  // Sinkronisasi waktu (untuk field "time" di dashboard: "14:32")
  configTime(GMT_OFFSET, DST_OFFSET, NTP_SERVER);
  Serial.println("[OK] NTP time sync...");
  delay(2000);

  // Init BLE
  BLEDevice::init("RUMISYNC-SCANNER");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  Serial.println("[OK] BLE scanner siap");
  Serial.println("[RUMI-SYNC] Sistem aktif — menunggu sapi...\n");
}

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
    Serial.println("\n[WiFi] GAGAL terhubung — cek SSID/password");
  }
}

// ============================================================
//  SCAN BLE — DETEKSI ITAG SAPI
//  Mengembalikan pointer ke profil sapi jika ditemukan,
//  atau nullptr jika tidak ada sapi dalam jangkauan
// ============================================================
SapiProfile* scanBLE() {
  BLEScanResults results = pBLEScan->start(SCAN_DURATION_SEC, false);

  for (int i = 0; i < results.getCount(); i++) {
    BLEAdvertisedDevice dev = results.getDevice(i);
    String mac = dev.getAddress().toString().c_str();
    mac.toLowerCase();

    for (int j = 0; j < SAPI_COUNT; j++) {
      if (mac == SAPI_DB[j].mac) {
        lastRssi = dev.getRSSI();
        pBLEScan->clearResults();
        Serial.printf("[BLE] Sapi terdeteksi: %s (MAC: %s, RSSI: %d)\n",
                      SAPI_DB[j].id.c_str(), mac.c_str(), lastRssi);
        return &SAPI_DB[j];
      }
    }
  }

  pBLEScan->clearResults();
  return nullptr;
}

// ============================================================
//  BACA SUHU — MLX90614
//  Mengembalikan suhu dalam °C (float)
// ============================================================
float bacaSuhu() {
  float suhu = mlx.readObjectTempC();

  // Validasi range fisik yang masuk akal untuk sapi
  if (suhu < 30.0 || suhu > 45.0) {
    Serial.println("[SUHU] Pembacaan tidak valid, ulangi...");
    delay(500);
    suhu = mlx.readObjectTempC();
  }
  Serial.printf("[SUHU] %.1f°C\n", suhu);
  return suhu;
}

// ============================================================
//  HITUNG KUNYAHAN (RUMINASI) — KY-038
//
//  Algoritma: hitung transisi diam→bunyi dalam durasi RUMINATION_MS
//  → Hasilnya dikonversi ke x/menit (chewing per minute)
//
//  Field yang diisi:
//  - chewing       (int, x/menit)  → dashboard
//  - duration      (float, detik)  → medical chart (Tne: hour/duration)
//  - frequency     (String, "XXx/mnt") → medical + eco
//  - intensity     (String) → eco: "Rendah"/"Sedang"/"Tinggi"
// ============================================================
struct RuminasiResult {
  int   chewingPerMenit;   // contoh: 58
  float durasiRataRata;    // detik per kunyahan, contoh: 3.5
  String frequency;        // "58x/mnt"
  String intensity;        // "Sedang"
  String status;           // sesuai web: "Kunyahan Normal & Aktif"
  String ruminalHealth;    // "Optimal" / "Sedang" / "Buruk"
  String feedType;         // saran pakan
  String recommendation;   // saran tambahan
  String feedBoost;        // "+8%" dsb.
  String targetMethane;    // "110g → 100g/hari"
  String metanePotential;  // "Kategori Normal"
  int    methaneLevel;     // estimasi gram/hari
};

RuminasiResult bacaRuminasi() {
  RuminasiResult hasil;
  int hitungKunyahan = 0;
  bool sebelumnyaBunyi = false;
  unsigned long mulai = millis();
  unsigned long totalBunyi = 0;
  unsigned long mulaiSound = 0;

  while (millis() - mulai < RUMINATION_MS) {
    int nilaiADC = analogRead(MIC_ANALOG_PIN);
    bool adaBunyi = (nilaiADC > MIC_ADC_THRESHOLD);

    if (adaBunyi && !sebelumnyaBunyi) {
      hitungKunyahan++;
      mulaiSound = millis();
    }
    if (!adaBunyi && sebelumnyaBunyi) {
      totalBunyi += (millis() - mulaiSound);
    }
    sebelumnyaBunyi = adaBunyi;
    delay(8);
  }

  // Konversi ke per menit (rekam 10 detik → kali 6)
  hasil.chewingPerMenit = hitungKunyahan * 6;

  // Durasi rata-rata per kunyahan (dalam detik)
  hasil.durasiRataRata = (hitungKunyahan > 0)
    ? (float)totalBunyi / hitungKunyahan / 1000.0f
    : 0.0f;
  if (hasil.durasiRataRata < 0.5f || hasil.durasiRataRata > 8.0f) {
    hasil.durasiRataRata = 3.5f; // fallback ke nilai normal
  }

  Serial.printf("[RUMINASI] %d x/mnt | durasi rata2: %.1f detik\n",
                hasil.chewingPerMenit, hasil.durasiRataRata);

  // ---- Klasifikasi sesuai label yang ada di web app ----
  hasil.frequency = String(hasil.chewingPerMenit) + "x/mnt";

  if (hasil.chewingPerMenit >= 55) {
    // Normal → sesuai "Kunyahan Normal & Aktif" di Y0 array
    hasil.intensity      = "Sedang";
    hasil.status         = "Kunyahan Normal & Aktif";
    hasil.ruminalHealth  = "Optimal";
    hasil.feedType       = "Rumput segar + konsentrat seimbang";
    hasil.recommendation = "1.0 Kg dedak pada pakan sore";
    hasil.feedBoost      = "+8%";
    hasil.methaneLevel   = 110;
    hasil.targetMethane  = "110g \u2192 100g/hari";
    hasil.metanePotential= "Kategori Normal";
  } else if (hasil.chewingPerMenit >= CHEWING_WARNING) {
    // Sedang — sapi butuh perhatian
    hasil.intensity      = "Tinggi";
    hasil.status         = "Kunyahan Sedang & Moderat";
    hasil.ruminalHealth  = "Perhatian";
    hasil.feedType       = "Campuran jerami dan konsentrat";
    hasil.recommendation = "1.5 Kg konsentrat pagi + evaluasi pakan";
    hasil.feedBoost      = "+12%";
    hasil.methaneLevel   = 130;
    hasil.targetMethane  = "130g \u2192 115g/hari";
    hasil.metanePotential= "Kategori Sedang";
  } else {
    // Rendah — WARNING, perlu tindakan
    hasil.intensity      = "Tinggi";
    hasil.status         = "Kunyahan Lambat & Tidak Konsisten";
    hasil.ruminalHealth  = "Buruk";
    hasil.feedType       = "Jerami kering dominan, kurang konsentrat";
    hasil.recommendation = "2.0 Kg konsentrat pagi + tambah mineral";
    hasil.feedBoost      = "+18%";
    hasil.methaneLevel   = 140;
    hasil.targetMethane  = "140g \u2192 120g/hari";
    hasil.metanePotential= "Kategori Tinggi";
  }

  return hasil;
}

// ============================================================
//  HITUNG HEALTH SCORE (0-100)
//  Sesuai field "health" di G0 array di web: 95, 88, 82, 92, 96
// ============================================================
int hitungHealthScore(float suhu, int chewing) {
  int score = 100;

  // Penalti suhu
  if (suhu > SUHU_MAX)         score -= (int)((suhu - SUHU_MAX) * 15);
  else if (suhu < SUHU_MIN)    score -= (int)((SUHU_MIN - suhu) * 10);

  // Penalti kunyahan
  if (chewing < CHEWING_WARNING)     score -= 20;
  else if (chewing < CHEWING_NORMAL) score -= 10;

  return max(0, min(100, score));
}

// ============================================================
//  STATUS STRING
//  Sesuai field "status" di web: "normal" atau "warning"
// ============================================================
String tentukanStatus(float suhu, int chewing) {
  if (suhu > SUHU_MAX || suhu < SUHU_MIN || chewing < CHEWING_WARNING) {
    return "warning";
  }
  return "normal";
}

// ============================================================
//  STATUS SINYAL BLE → RSSI STRING
//  Sesuai Mne array di web: "Sangat Kuat", "Kuat", "Sedang"
// ============================================================
String rssiToStatus(int rssi) {
  if (rssi > -50) return "Sangat Kuat";
  if (rssi > -65) return "Kuat";
  return "Sedang";
}

// ============================================================
//  DAPATKAN TIMESTAMP FORMAT "HH:MM"
//  Sesuai field "time" di DV() dashboard: "14:32", "14:28", dll.
// ============================================================
String getTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "00:00";
  }
  char buf[6];
  strftime(buf, sizeof(buf), "%H:%M", &timeinfo);
  return String(buf);
}

// ============================================================
//  KIRIM DATA KE SERVER
//
//  Satu payload JSON berisi SEMUA field yang dibutuhkan
//  oleh keempat halaman web sekaligus.
// ============================================================
void kirimData(SapiProfile* sapi, float suhu, RuminasiResult& rum) {

  int healthScore = hitungHealthScore(suhu, rum.chewingPerMenit);
  String statusStr = tentukanStatus(suhu, rum.chewingPerMenit);
  String waktu = getTimestamp();

  // Format suhu jadi string sesuai web: "37.2°C"
  char suhuStr[12];
  sprintf(suhuStr, "%.1f\xC2\xB0""C", suhu);  // UTF-8 untuk °

  // Format chewing sesuai web: "65x/menit"
  String chewingStr = String(rum.chewingPerMenit) + "x/menit";

  // Format durasi sesuai web: "3.5 detik"
  char durasiStr[20];
  sprintf(durasiStr, "%.1f detik", rum.durasiRataRata);

  // ---- Build JSON ----
  // Ukuran disesuaikan agar muat semua field
  StaticJsonDocument<1024> doc;

  // --- Field Dashboard (halaman /) ---
  doc["time"]    = waktu;         // "14:32"
  doc["id"]      = sapi->id;      // "ID-002"
  doc["name"]    = sapi->name;    // "SAPI LOKAL - ID-002"
  doc["temp"]    = suhuStr;       // "38.1°C"
  doc["chewing"] = chewingStr;    // "58x/menit"
  doc["status"]  = statusStr;     // "normal" / "warning"
  doc["gender"]  = sapi->gender;  // "Betina" / "Jantan"

  JsonObject age = doc.createNestedObject("age");
  age["year"]  = sapi->ageYear;
  age["month"] = sapi->ageMonth;
  age["day"]   = sapi->ageDay;

  // --- Field Medical/EWS (halaman /medical) ---
  doc["health"] = healthScore;    // 0-100

  // time-series suhu → untuk Kurva Suhu (Ane array)
  // server harus simpan ini ke DB dan kembalikan array 24 jam
  doc["tempValue"] = suhu;        // float, untuk chart

  // Durasi ruminasi → untuk Grafik Durasi (Tne array: hour/duration)
  doc["ruminationDuration"] = rum.durasiRataRata;

  JsonObject ruminasi = doc.createNestedObject("rumination");
  ruminasi["status"]         = rum.status;          // "Kunyahan Normal & Aktif"
  ruminasi["frequency"]      = rum.frequency;        // "58x/mnt"
  ruminasi["duration"]       = String(durasiStr);    // "3.5 detik"
  ruminasi["intensity"]      = rum.intensity;        // "Sedang"
  ruminasi["metanePotential"]= rum.metanePotential;  // "Kategori Normal"
  ruminasi["feedType"]       = rum.feedType;
  ruminasi["recommendation"] = rum.recommendation;
  ruminasi["targetMethane"]  = rum.targetMethane;    // "110g → 100g/hari"
  ruminasi["feedBoost"]      = rum.feedBoost;        // "+8%"
  ruminasi["ruminalHealth"]  = rum.ruminalHealth;    // "Optimal"

  // --- Field Eco-Nutrisi (halaman /eco-nutrition) ---
  doc["methaneLevel"] = rum.methaneLevel;            // 110 (gram/hari)

  // --- Field System Control (halaman /system-control) ---
  doc["mac"]      = sapi->mac;                       // "a4:c1:38:7f:2e:d1"
  doc["rssi"]     = lastRssi;                        // -45
  doc["rssiStatus"] = rssiToStatus(lastRssi);        // "Sangat Kuat"
  doc["position"] = sapi->relPosition;               // 0-100 untuk Live Tracker Rel

  // ---- Serialize & kirim ----
  String payload;
  serializeJson(doc, payload);

  Serial.println("[SERVER] Mengirim payload...");
  Serial.println(payload);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Tidak terhubung — mencoba reconnect...");
    connectWifi();
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  int httpCode = http.POST(payload);

  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[SERVER] OK (%d) — data %s diterima\n", httpCode, sapi->id.c_str());
  } else {
    Serial.printf("[SERVER] GAGAL: HTTP %d\n", httpCode);
    Serial.println("[SERVER] Response: " + http.getString());
  }

  http.end();
}

// ============================================================
//  LOOP UTAMA
// ============================================================
void loop() {
  Serial.println("\n[LOOP] Scanning BLE...");

  SapiProfile* sapi = scanBLE();

  if (sapi != nullptr) {
    Serial.printf("[LOOP] Sapi ditemukan: %s\n", sapi->id.c_str());

    // Beri waktu 500ms agar sapi stabil di depan sensor
    delay(500);

    // 1. Baca suhu (tidak blocking, cepat)
    float suhu = bacaSuhu();

    // 2. Rekam ruminasi 10 detik
    RuminasiResult rum = bacaRuminasi();

    // 3. Kirim ke server
    kirimData(sapi, suhu, rum);

    // 4. Jeda sebelum scan berikutnya
    //    (hindari double-scan sapi yang sama)
    delay(8000);

  } else {
    Serial.println("[LOOP] Tidak ada sapi terdeteksi.");
    delay(2000);
  }
}
