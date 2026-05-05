# RUMI-SYNC — Panduan Integrasi (MQTT + Supabase + Vercel)

Sesuai permintaan Anda, arsitektur ini dirancang menggunakan **protokol MQTT** yang sangat hemat daya untuk perangkat IoT seperti ESP32. Panduan ini dibuat super mudah untuk dipahami.

## 1. STRUKTUR SISTEM (Bagaimana cara kerjanya?)

Karena protokol MQTT membutuhkan koneksi "Stanby 24 Jam" (*always-on*), sistem ini dibagi menjadi 2 bagian tempat deployment:

```text
1. [ESP32] ──(Publish MQTT)──► [MQTT Broker (Misal: HiveMQ)] 
                                        │
                                   (Subscribe)
                                        ▼
2.                            [Backend Node.js MQTT] ──(Simpan)──► [Supabase DB]
   (Bisa di-run di Laptop,                                                │
    Render.com, atau Railway)                                             │
                                                                 (Update Realtime)
                                                                          ▼
3.                                                             [Web React di Vercel]
```
- **Vercel**: Menjalankan antarmuka visual/Web Anda.
- **Backend Node.js**: Folder `mqtt-backend` di dalam proyek ini. Tugasnya menjaga gerbang agar data MQTT yang masuk langsung dikonversi menjadi data untuk Database Supabase Anda.

---

## 2. CARA SETUP DATABASE (Supabase)

1. Buka website **[Supabase](https://supabase.com/)** dan buat project baru gratis.
2. Di dashboard, buka menu **SQL Editor**.
3. Buka file `Panduan/SUPABASE_SETUP.sql` di komputer Anda, *copy* semua teksnya, lalu *paste* ke SQL Editor Supabase dan tekan tombol **RUN**.
4. Cari `URL` dan `anon key` Supabase Anda di menu **Project Settings -> API**. Copy kedua kode ini.

---

## 3. CARA SETUP APLIKASI WEB (Vercel)

1. Buka dashboard Vercel proyek Anda.
2. Ke menu **Settings** -> **Environment Variables**.
3. Tambahkan 2 kunci dari Supabase:
   - Key: `VITE_SUPABASE_URL` | Value: `(paste URL dari Supabase)`
   - Key: `VITE_SUPABASE_ANON_KEY` | Value: `(paste anon key dari Supabase)`
4. **Redeploy** aplikasi Anda. Website Anda sekarang sudah terhubung dengan Supabase dan siap menerima perintah Realtime!

---

## 4. CARA MENJALANKAN BACKEND MQTT (Penting!)

Backend ini (folder `mqtt-backend`) bertugas "mendengarkan" sinyal dari MQTT dan menyimpannya. Karena Vercel hanya untuk web, backend ini harus dijalankan terpisah.

**Cara Menjalankan di Laptop Anda (Untuk Testing):**
1. Buka terminal/CMD, masuk ke folder backend: `cd mqtt-backend`
2. Install keperluan: `npm install`
3. Buat file bernama `.env` (atau *rename* dari `.env.example`) dan isi dengan kunci Supabase Anda.
   ```env
   MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
   SUPABASE_URL=https://(URL-ANDA).supabase.co
   SUPABASE_ANON_KEY=(ANON-KEY-ANDA)
   ```
4. Jalankan: `npm start`. Anda akan melihat tulisan "Mendengarkan topik MQTT...". Biarkan layar hitam ini tetap menyala.

*(Catatan: Jika nanti ingin online 24 jam untuk peternakan sesungguhnya, folder `mqtt-backend` ini tinggal di-upload ke layanan gratis seperti **Render.com** atau **Railway.app** yang mendukung aplikasi Node.js 24 Jam).*

---

## 5. CARA SETUP HARDWARE (Arduino IDE untuk ESP32)

Di file `.ino` (firmware) Anda, pastikan ESP32 menggunakan protokol MQTT dengan mengarahkan koneksinya ke broker publik seperti HiveMQ.

Format MQTT yang harus dikirim (Publish) oleh ESP32:
- **Topik**: `rumisync/cattle/ID-001` *(Ganti ID-001 sesuai kode sapi di iTag)*
- **Pesan (Payload)**: JSON format seperti ini:
```json
{
  "temp": 39.6,
  "chewing": 45,
  "battery": 80
}
```

### Apa yang terjadi saat ESP32 mengirim data?
1. ESP32 meneriakkan data ke HiveMQ.
2. Layar hitam (Backend Node.js) Anda langsung menangkap data tersebut dalam 0.1 detik.
3. Backend mengecek: *"Wah, suhunya 39.6°C, ini di atas 39.5°C, berarti sapi demam!"*
4. Backend memberi laporan ke Supabase.
5. Dan **BAM!** Website Vercel yang sedang Anda buka di HP akan langsung berkedip memunculkan Peringatan Merah secara Real-time tanpa perlu Anda memencet apapun!
