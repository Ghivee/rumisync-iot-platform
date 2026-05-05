# RUMI-SYNC — Panduan Integrasi Hardware ↔ Software
## Versi Prototipe 1.0

---

## RINGKASAN ARSITEKTUR

```
[iTag BLE] ──BLE──► [ESP32]
[MLX90614] ──I2C──► [ESP32] ──WiFi HTTP POST──► [server.js] ──GET──► [Web App]
[KY-038]   ──ADC──► [ESP32]
```

Setiap kali sapi terdeteksi, ESP32:
1. Baca suhu dari MLX90614
2. Rekam kunyahan dari KY-038 selama 10 detik
3. Kirim 1 JSON payload ke server.js
4. Server simpan ke SQLite
5. Web app ambil data via GET endpoint

---

## BAGIAN 1 — SETUP SERVER (server.js)

### Install dependensi
```bash
npm init -y
npm install express cors better-sqlite3
```

### Jalankan server
```bash
node server.js
# Output: [RUMI-SYNC SERVER] Berjalan di port 3000
```

### Untuk testing dari laptop ke ESP32 (jaringan lokal)
- Pastikan laptop dan ESP32 di WiFi yang sama
- Cari IP laptop: `ipconfig` (Windows) atau `ifconfig` (Mac/Linux)
- Ganti SERVER_URL di firmware: `"http://192.168.1.XXX:3000/api/data"`

### Untuk production (sapi sudah banyak)
- Deploy ke VPS (Niagahoster, DigitalOcean, Railway.app)
- Atau gunakan ngrok untuk expose localhost: `ngrok http 3000`

---

## BAGIAN 2 — SETUP FIRMWARE (rumisync_firmware.ino)

### Library yang harus diinstall di Arduino IDE
Buka Tools → Manage Libraries → cari dan install:
- `Adafruit MLX90614 Library` by Adafruit
- `ArduinoJson` by Benoit Blanchon (versi 6.x)
- `ESP32 BLE Arduino` (sudah include di board ESP32)

### Board setup
- Tools → Board → ESP32 Arduino → ESP32 Dev Module
- Upload Speed: 115200
- Flash Size: 4MB

### Yang WAJIB diubah sebelum upload
```cpp
// Baris 33-34:
const char* WIFI_SSID = "NamaWiFiKandang";   // ← ganti
const char* WIFI_PASS = "PasswordWiFi";       // ← ganti

// Baris 37:
const char* SERVER_URL = "http://192.168.1.100:3000/api/data"; // ← ganti IP

// Baris 59-68: Ganti MAC address dengan MAC iTag fisik kamu
// Cara cari MAC iTag: scan BLE dengan app "nRF Connect" di HP
// MAC terlihat di list device yang ditemukan
SapiProfile SAPI_DB[] = {
  {"xx:xx:xx:xx:xx:xx", "ID-002", "SAPI LOKAL - ID-002", "Betina", 3, 5, 12, 15},
  // dst...
};
```

### Cara cari MAC address iTag fisik
1. Install app "nRF Connect for Mobile" (gratis di Play Store / App Store)
2. Buka app → tab SCANNER → tekan SCAN
3. Tekan tombol di iTag agar muncul di list
4. Catat alamat MAC yang muncul (format: XX:XX:XX:XX:XX:XX)
5. Masukkan ke SAPI_DB[] dalam firmware (lowercase)

---

## BAGIAN 3 — MODIFIKASI WEB APP

Web app kamu saat ini menggunakan data hardcoded (mock data).
Ubah setiap halaman untuk fetch dari server. Ikuti patch di bawah ini.

### 3A — Halaman Dashboard (/)
Cari di source code kamu komponen yang berisi array seperti:
```js
const e = [{time:"14:32", id:"ID-018", temp:"37.2°C", ...}]
```

Ubah menjadi:
```js
const [scanData, setScanData] = React.useState([]);
const [summary, setSummary] = React.useState({totalSapi: 0, warningCount: 0});

React.useEffect(() => {
  fetch('http://192.168.1.XXX:3000/api/dashboard')
    .then(r => r.json())
    .then(data => {
      setScanData(data.scanList);
      setSummary({ totalSapi: data.totalSapi, warningCount: data.warningCount });
    })
    .catch(err => console.error('Dashboard fetch error:', err));

  // Auto-refresh setiap 15 detik
  const interval = setInterval(() => {
    fetch('http://192.168.1.XXX:3000/api/dashboard')
      .then(r => r.json())
      .then(data => {
        setScanData(data.scanList);
        setSummary({ totalSapi: data.totalSapi, warningCount: data.warningCount });
      });
  }, 15000);

  return () => clearInterval(interval);
}, []);
```

Ganti `e` (array hardcoded) dengan `scanData` di seluruh render.

### 3B — Halaman Medical (/medical)
Cari array G0, Ane, Tne, Y0 (data sapi, kurva suhu, grafik ruminasi):
```js
// Ganti G0 (daftar sapi dropdown)
const [cattleList, setCattleList] = React.useState([]);
React.useEffect(() => {
  fetch('http://192.168.1.XXX:3000/api/cattle-list')
    .then(r => r.json())
    .then(data => setCattleList(data));
}, []);

// Ganti Ane, Tne, Y0 (data per sapi yang dipilih)
const [cowDetail, setCowDetail] = React.useState(null);
const loadCowDetail = (cowId) => {
  fetch(`http://192.168.1.XXX:3000/api/medical/${cowId}`)
    .then(r => r.json())
    .then(data => setCowDetail(data));
};
```

Kemudian:
- Ganti `G0` dengan `cattleList`
- Ganti `Ane` dengan `cowDetail?.tempSeries || []`
- Ganti `Tne` dengan `cowDetail?.ruminationSeries || []`
- Ganti data ruminasi di panel kanan dengan `cowDetail?.rumination`

### 3C — Halaman Eco-Nutrisi (/eco-nutrition)
Cari array Y0 (data methane per sapi):
```js
const [ecoData, setEcoData] = React.useState(null);
const loadEco = (cowId) => {
  fetch(`http://192.168.1.XXX:3000/api/eco/${cowId}`)
    .then(r => r.json())
    .then(data => setEcoData(data));
};
```

Ganti `e.methaneLevel` dengan `ecoData?.methaneLevel`
Ganti `e.rumination.*` dengan `ecoData?.rumination.*`

### 3D — Halaman System Control (/system-control)
Cari array Mne (BLE devices) dan Ul (posisi rel):
```js
const [systemData, setSystemData] = React.useState({
  bleDevices: [], relPositions: [], eventLog: []
});

React.useEffect(() => {
  const refresh = () => {
    fetch('http://192.168.1.XXX:3000/api/system')
      .then(r => r.json())
      .then(data => setSystemData(data));
  };
  refresh();
  const interval = setInterval(refresh, 10000); // refresh tiap 10 detik
  return () => clearInterval(interval);
}, []);
```

Ganti `Mne` dengan `systemData.bleDevices`
Ganti `Ul` dengan `systemData.relPositions`
Ganti `kne` dengan `systemData.eventLog`

### Tips: Buat file config terpusat
Buat file `src/config.js`:
```js
// Ganti IP ini jika server pindah
export const API_BASE = 'http://192.168.1.XXX:3000';

export const API = {
  dashboard:   `${API_BASE}/api/dashboard`,
  cattleList:  `${API_BASE}/api/cattle-list`,
  medical:     (id) => `${API_BASE}/api/medical/${id}`,
  eco:         (id) => `${API_BASE}/api/eco/${id}`,
  system:      `${API_BASE}/api/system`,
};
```

---

## BAGIAN 4 — URUTAN PENGUJIAN (dari mudah ke sulit)

### Langkah 1: Uji sensor di meja (tanpa sapi, tanpa WiFi)
Upload firmware → buka Serial Monitor (115200 baud)
- Arahkan MLX90614 ke punggung tangan → harus terbaca 33–36°C
- Tepuk tangan dekat KY-038 → nilai ADC di Serial Monitor harus naik
- Kalau sensor tidak terdeteksi: cek kabel SDA/SCL tidak tertukar

### Langkah 2: Uji koneksi WiFi + server
- Jalankan server.js di laptop
- Upload firmware dengan WIFI_SSID dan SERVER_URL yang benar
- Serial Monitor harus print: "[WiFi] Terhubung: 192.168.x.x"
- Untuk bypass BLE sementara, tambahkan di loop():
  ```cpp
  // TEST MODE: hardcode sapi pertama
  SapiProfile* sapi = &SAPI_DB[0];
  float suhu = bacaSuhu();
  RuminasiResult rum = bacaRuminasi();
  kirimData(sapi, suhu, rum);
  delay(30000);
  ```
- Cek server.js → harus print: "[OK] Data ID-002 @ HH:MM"
- Buka browser: `http://localhost:3000/api/dashboard` → harus ada data

### Langkah 3: Uji BLE iTag
- Hapus TEST MODE tadi
- Nyalakan iTag, pastikan MAC address sudah masuk SAPI_DB
- Serial Monitor harus print: "[BLE] Sapi terdeteksi: ID-002"
- Kalau tidak terdeteksi: pastikan MAC lowercase dan format benar

### Langkah 4: Uji integrasi web app
- Buka web app di browser
- Sambungkan ke server lokal (pastikan CORS sudah aktif di server.js)
- Dashboard harus menampilkan data scan real dari sapi
- Cek setiap halaman: Medical, Eco-Nutrisi, System Control

### Langkah 5: Uji di kandang
- Pasang casing di pintu kandang
- Arahkan sensor ke area kepala sapi (jarak 5–20cm)
- Verifikasi data masuk ke dashboard realtime
- Cek notifikasi muncul saat suhu di luar batas (test: hangatkan sensor dengan tangan)

---

## BAGIAN 5 — TROUBLESHOOTING

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|----------------------|--------|
| MLX90614 tidak terdeteksi | Wiring SDA/SCL terbalik | Swap GPIO 21 ↔ 22 |
| Suhu terbaca 0 atau -273 | Kabel longgar | Cek soldiran / jumper |
| KY-038 tidak sensitif | Threshold terlalu tinggi | Turunkan MIC_ADC_THRESHOLD ke 500 |
| BLE tidak detect iTag | MAC salah | Pakai nRF Connect untuk verifikasi |
| HTTP gagal (error -1) | IP server salah / beda jaringan | Pastikan ESP32 & laptop 1 WiFi |
| Data tidak muncul di web | CORS error | Pastikan `app.use(cors())` di server.js |
| Ruminasi selalu 0 | Mic terlalu jauh / PTFE terlalu tebal | Kurangi lapisan PTFE, dekatkan mic |

---

## BAGIAN 6 — KALIBRASI SENSOR SUHU

Sapi sehat: suhu tubuh 38.0–39.5°C (diukur rektal).
MLX90614 mengukur dari jarak jauh (inframerah) sehingga ada offset.

Cara kalibrasi:
1. Ukur suhu sapi dengan termometer rektal → catat sebagai suhu_referensi
2. Baca nilai MLX90614 dari jarak 10cm ke area mata → catat sebagai suhu_sensor
3. Hitung offset = suhu_referensi - suhu_sensor
4. Tambahkan di firmware:
   ```cpp
   float bacaSuhu() {
     float OFFSET_KALIBRASI = 1.5; // ganti dengan offset hasil pengukuranmu
     return mlx.readObjectTempC() + OFFSET_KALIBRASI;
   }
   ```

Lakukan kalibrasi minimal 3 sapi, ambil rata-rata offset.

---

## RINGKASAN FIELD MAPPING (Firmware → Database → Web App)

| Field ESP32 JSON    | Tabel DB             | Halaman Web         | Komponen       |
|---------------------|----------------------|---------------------|----------------|
| id                  | sapi.id              | Dashboard, Medical  | Tabel scan, G0 |
| time                | scan_log.time        | Dashboard           | DV() table     |
| temp                | scan_log.temp        | Dashboard           | DV() table     |
| chewing             | scan_log.chewing     | Dashboard           | DV() table     |
| status              | scan_log.status      | Dashboard, Medical  | Badge warna    |
| health              | scan_log.health      | Medical             | G0 array       |
| tempValue           | temp_timeseries      | Medical             | Kurva Suhu     |
| ruminationDuration  | scan_log             | Medical             | Grafik Durasi  |
| rumination.status   | rumination_detail    | Medical, Eco        | Panel detail   |
| rumination.frequency| rumination_detail    | Medical, Eco        | Panel detail   |
| rumination.intensity| rumination_detail    | Eco-Nutrisi         | Y0 array       |
| methaneLevel        | rumination_detail    | Eco-Nutrisi         | Y0 array       |
| mac                 | ble_status.mac       | System Control      | Mne array      |
| rssi                | ble_status.rssi      | System Control      | Mne array      |
| position            | ble_status.position  | System Control      | Live Tracker   |
