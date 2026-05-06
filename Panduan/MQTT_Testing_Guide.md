# 🧪 MQTT Testing Guide — RumiSync (Tanpa Hardware)

> **Prasyarat:** Railway backend running, Supabase schema sudah dijalankan, Vercel sudah deploy terbaru.

---

## Setup MQTTX

**Download:** https://mqttx.app/

**Konfigurasi koneksi baru:**
| Field | Value |
|-------|-------|
| Host | `broker.hivemq.com` |
| Port | `1883` |
| Client ID | `rumisync-tester` |
| Username | _(kosong)_ |
| Password | _(kosong)_ |

Klik **Connect** → status hijau = siap kirim.

---

## Format Payload

**Topik:** `rumisync/cattle/<ID>`  
**Payload:** JSON dengan field berikut

| Field | Tipe | Keterangan |
|-------|------|-----------|
| `temp` | float | Suhu tubuh °C (normal: 38.0–39.5) |
| `chewing` | int | Kunyahan per menit (normal: ≥60) |
| `battery` | int | Level baterai % (0–100) |

```json
{ "temp": 38.5, "chewing": 65, "battery": 87 }
```

> ⚠️ ID yang dipakai harus sesuai yang ada atau akan **auto-dibuat** di `cattle_inventory`.

---

## Skenario Testing

### TEST 1 — Sapi Normal (Status: Aman)
```
Topik  : rumisync/cattle/ID-001
Payload: { "temp": 38.5, "chewing": 65, "battery": 90 }
```
**Cek di Vercel:**
- ✅ Dashboard → ID-001 badge **"Normal Terkendali"** (hijau)
- ✅ Grafik Suhu (Medical) → titik baru muncul di waktu sekarang
- ✅ Grafik Ruminasi → bar baru muncul

---

### TEST 2 — Demam Tinggi (Anomali Suhu)
```
Topik  : rumisync/cattle/ID-001
Payload: { "temp": 40.2, "chewing": 58, "battery": 85 }
```
**Cek di Vercel:**
- ✅ Dashboard → badge berubah **"Indikasi Sakit"** (merah)
- ✅ Bell notifikasi → angka bertambah
- ✅ **Toast merah muncul otomatis:** "Suhu tinggi terdeteksi (40.2°C)..."
- ✅ Medical → grafik suhu melewati garis merah 39.5°C
- ✅ Supabase `notifications` → baris baru dengan type `warning`

---

### TEST 3 — Kunyahan Rendah (Anomali Ruminasi)
```
Topik  : rumisync/cattle/ID-002
Payload: { "temp": 38.8, "chewing": 22, "battery": 72 }
```
**Cek di Vercel:**
- ✅ Dashboard → ID-002 badge **"Indikasi Sakit"**
- ✅ Toast: "Tingkat kunyahan rendah (22x/mnt)..."
- ✅ Medical → grafik ruminasi bar di bawah garis merah 60x/mnt
- ✅ Panel identitas → Laju Ruminasi: 22x/menit

---

### TEST 4 — Baterai Kritis
```
Topik  : rumisync/cattle/ID-003
Payload: { "temp": 38.3, "chewing": 63, "battery": 7 }
```
**Cek di Vercel:**
- ✅ Layout sidebar → BatteryIndicator **merah** (<10%)
- ✅ Medical → panel "Baterai Sensor: 7%" merah
- ✅ Dashboard → status tetap Normal (suhu & kunyahan normal)

---

### TEST 5 — Streaming Berturut-turut (Simulate Live Data)
Kirim 4 payload ke topik sama dengan jeda **10 detik** tiap pesan:

```json
Payload 1: { "temp": 38.1, "chewing": 70, "battery": 95 }
Payload 2: { "temp": 38.6, "chewing": 62, "battery": 94 }
Payload 3: { "temp": 39.2, "chewing": 50, "battery": 93 }
Payload 4: { "temp": 39.8, "chewing": 35, "battery": 92 }
```

**Topik:** `rumisync/cattle/ID-001`

**Cek di Vercel:**
- ✅ Setiap 10 detik → angka suhu di Dashboard berubah **tanpa refresh**
- ✅ Grafik suhu Medical → titik baru ditambahkan satu per satu
- ✅ Pada payload 4 → anomali terdeteksi, toast muncul

---

### TEST 6 — Sapi Baru Auto-Daftar
```
Topik  : rumisync/cattle/ID-099
Payload: { "temp": 38.7, "chewing": 62, "battery": 95 }
```
*(ID-099 belum ada di Supabase)*

**Cek di Vercel:**
- ✅ Dashboard → sapi baru **"Sapi ID-099"** muncul otomatis
- ✅ Toast hijau: "Sapi baru terdaftar: ID-099"
- ✅ Supabase `cattle_inventory` → baris baru dengan id `ID-099`

---

### TEST 7 — Multiple Sapi Bersamaan
Kirim 3 pesan sekaligus ke topik berbeda:

```
rumisync/cattle/ID-001 → { "temp": 38.4, "chewing": 70, "battery": 91 }
rumisync/cattle/ID-002 → { "temp": 39.9, "chewing": 25, "battery": 65 }
rumisync/cattle/ID-003 → { "temp": 38.1, "chewing": 63, "battery": 80 }
```

**Cek di Vercel:**
- ✅ 3 baris di Dashboard update hampir bersamaan
- ✅ Counter "Sakit" naik (ID-002 anomali suhu + kunyahan)
- ✅ 2 toast anomali dari ID-002

---

### TEST 8 — Sapi Pulih (Normal Kembali)
*Setelah TEST 2 (ID-001 demam), kirim data normal:*
```
Topik  : rumisync/cattle/ID-001
Payload: { "temp": 38.4, "chewing": 66, "battery": 84 }
```
**Cek di Vercel:**
- ✅ Dashboard → badge ID-001 kembali **"Normal Terkendali"**
- ✅ Grafik suhu → titik baru di bawah garis merah

---

## Verifikasi Supabase

Setelah setiap test, cek di **Supabase → Table Editor**:

| Tabel | Yang Diverifikasi |
|-------|-------------------|
| `cattle_inventory` | `current_temp`, `current_chewing`, `battery`, `last_updated` terupdate |
| `sensor_data` | Baris baru dengan timestamp waktu kirim |
| `notifications` | Baris baru hanya jika ada anomali |

---

## Cek Log Railway

Di **Railway → Deployment → Logs**, setiap publish sukses:
```
📥 Data baru dari ID-001: { temp: 38.5, chewing: 65, battery: 90 }
✅ cattle_inventory [ID-001] upsert → realtime dikirim ke Vercel.
✅ sensor_data disimpan.
```

Jika anomali:
```
🚨 ANOMALI: Suhu tinggi terdeteksi (40.2°C). Indikasi demam/infeksi!
✅ Notifikasi anomali disimpan.
```

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `FK constraint error` di log | Urutan insert salah | Sudah diperbaiki — deploy ulang Railway |
| Grafik tidak muncul | Tabel `sensor_data` kosong | Kirim setidaknya 1 MQTT message |
| Toast tidak muncul | Realtime tidak aktif | Jalankan `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` |
| Badge tidak update | `VITE_SUPABASE_ANON_KEY` salah | Cek env vars di Vercel Dashboard |
| Sapi tidak muncul di Dashboard | `cattle_inventory` kosong | Kirim MQTT → auto-create |
