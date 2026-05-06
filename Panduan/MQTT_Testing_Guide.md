# 🧪 Panduan Testing MQTT — Tanpa Hardware (Software Only)

> Prasyarat: Step 1–4 setup sudah selesai (Supabase schema, Railway backend jalan).

---

## Software yang Dibutuhkan

Pilih **salah satu** MQTT client GUI:
- **MQTTX** (Rekomendasi) → https://mqttx.app/
- **MQTT Explorer** → https://mqtt-explorer.com/

---

## Konfigurasi Koneksi di MQTTX

| Field | Value |
|-------|-------|
| Host | `broker.hivemq.com` |
| Port | `1883` |
| Protocol | `mqtt://` |
| Client ID | `rumisync-tester-01` |
| Username | _(kosong)_ |
| Password | _(kosong)_ |

Klik **Connect**.

---

## Format Topik & Payload

**Topik:** `rumisync/cattle/<CATTLE_ID>`  
**Contoh:** `rumisync/cattle/ID-001`

**Payload (JSON):**
```json
{
  "temp": 38.5,
  "chewing": 65,
  "battery": 87
}
```

> Pastikan ID yang dipakai **sudah ada di tabel `cattle_inventory` Supabase**.  
> Gunakan ID dari data contoh yang sudah diinsert (`ID-001`, `ID-002`, `ID-003`).

---

## Skenario Testing Lengkap

### TEST 1 — Status Normal (Sapi Sehat)
**Topik:** `rumisync/cattle/ID-001`
```json
{ "temp": 38.5, "chewing": 65, "battery": 87 }
```
**Expected di Vercel:**
- Dashboard: ID-001 → badge `Normal Terkendali` (hijau)
- Medical: Suhu `38.5°C`, kurva suhu di bawah garis 39.5°C
- EcoNutrition: Rel 1 → ID-001 tercantum dengan data terkini

---

### TEST 2 — Demam Tinggi (Anomali Suhu)
**Topik:** `rumisync/cattle/ID-001`
```json
{ "temp": 40.2, "chewing": 58, "battery": 85 }
```
**Expected di Vercel:**
- Dashboard: badge berubah ke `Indikasi Sakit` (merah)
- **Toast notifikasi merah muncul otomatis** → "Suhu tinggi terdeteksi (40.2°C)..."
- Bell icon di header → angka notifikasi bertambah
- Medical: Kurva suhu melewati garis merah 39.5°C

---

### TEST 3 — Kunyahan Rendah (Anomali Ruminasi)
**Topik:** `rumisync/cattle/ID-002`
```json
{ "temp": 38.8, "chewing": 22, "battery": 72 }
```
**Expected di Vercel:**
- Dashboard: ID-002 → badge `Indikasi Sakit`
- **Toast:** "Tingkat kunyahan rendah (22x/mnt). Indikasi gangguan pencernaan."
- Medical → Grafik Ruminasi: bar di bawah garis merah 60x/mnt

---

### TEST 4 — Baterai Rendah
**Topik:** `rumisync/cattle/ID-003`
```json
{ "temp": 38.3, "chewing": 60, "battery": 8 }
```
**Expected di Vercel:**
- Layout → sidebar bawah: BatteryIndicator berubah merah (<10%)
- Data tetap masuk normal ke Supabase

---

### TEST 5 — Update Berturut-turut (Simulate Streaming)
Kirim 3 payload ke topik yang sama dengan jeda 5 detik:

**Payload 1:**
```json
{ "temp": 38.2, "chewing": 68, "battery": 90 }
```
**Payload 2 (5 detik kemudian):**
```json
{ "temp": 38.9, "chewing": 55, "battery": 89 }
```
**Payload 3 (5 detik kemudian):**
```json
{ "temp": 39.6, "chewing": 42, "battery": 88 }
```
**Expected:** Angka suhu di Dashboard berubah secara live tanpa refresh halaman.

---

### TEST 6 — Sapi Baru (Auto-Create)
**Topik:** `rumisync/cattle/ID-010`  
*(ID-010 belum ada di tabel)*
```json
{ "temp": 38.7, "chewing": 62, "battery": 95 }
```
**Expected:**
- Railway backend auto-insert `ID-010` ke `cattle_inventory`
- Dashboard: sapi baru muncul otomatis (via Realtime INSERT channel)
- Toast: "Sapi baru terdaftar: ID-010"

---

### TEST 7 — Multiple Sapi Sekaligus
Kirim ke 3 topik berbeda dalam waktu bersamaan:

```
rumisync/cattle/ID-001  →  { "temp": 38.4, "chewing": 70, "battery": 91 }
rumisync/cattle/ID-002  →  { "temp": 39.7, "chewing": 25, "battery": 65 }
rumisync/cattle/ID-003  →  { "temp": 38.1, "chewing": 63, "battery": 80 }
```
**Expected:** 3 baris di Dashboard diupdate secara bersamaan. Counter "Sakit" naik.

---

## Cara Kirim di MQTTX

1. Klik **New Publish**
2. Isi **Topic** dan **Payload** sesuai skenario di atas
3. Set **QoS: 0**, **Retain: OFF**
4. Klik tombol **Publish** (ikon kirim)

---

## Verifikasi di Supabase (Opsional)

Setelah publish, cek di **Supabase Dashboard → Table Editor**:

| Tabel | Yang Harus Ada |
|-------|---------------|
| `sensor_data` | Baris baru dengan timestamp terkini |
| `cattle_inventory` | `current_temp` & `current_chewing` terupdate |
| `notifications` | Baris baru (hanya jika ada anomali) |

---

## Cek Log Railway Backend

Di **Railway Dashboard → Deployments → Logs**, setiap publish berhasil akan menampilkan:
```
📥 Data baru dari ID-001: { temp: 38.5, chewing: 65, battery: 87 }
✅ sensor_data berhasil disimpan.
✅ cattle_inventory [ID-001] diperbarui → realtime update dikirim ke Vercel.
```

---

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| Data tidak masuk ke Supabase | Cek log Railway — pastikan `SUPABASE_SERVICE_ROLE_KEY` benar |
| Data masuk DB tapi UI tidak update | Pastikan Realtime diaktifkan di Supabase (`ALTER PUBLICATION...`) |
| Toast tidak muncul | Buka Console browser, cek apakah `VITE_SUPABASE_ANON_KEY` terload |
| Topik diterima tapi tidak diproses | Pastikan format JSON valid (gunakan jsonlint.com) |
