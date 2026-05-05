# RUMI-SYNC — Panduan Integrasi (Versi Super Mudah untuk Vercel & Supabase)

Panduan ini dibuat khusus agar **SANGAT MUDAH** dipahami oleh pemula. Sistem ini didesain agar tidak perlu menyewa VPS tambahan. Semuanya di-*hosting* otomatis dan gratis menggunakan **Vercel** dan **Supabase**.

## 1. STRUKTUR SISTEM (Bagaimana cara kerjanya?)

```text
[Hardware ESP32] ──(Kirim Data via Internet)──► [Vercel API] ──(Simpan Data)──► [Supabase DB]
                                                                                      │
                                                                       (Update Layar Otomatis)
                                                                                      ▼
                                                                                [Web React Anda]
```

Tidak perlu pusing memikirkan server, karena **Vercel** akan secara otomatis membaca folder `api/ingest.js` yang baru saja dibuat dan menjadikannya sebuah *Endpoint URL* yang siap menerima data siang dan malam!

---

## 2. CARA SETUP DATABASE (Supabase)

1. Buka website **[Supabase](https://supabase.com/)** dan buat project baru secara gratis.
2. Di dashboard Supabase, buka menu **SQL Editor**.
3. Buka file `Panduan/SUPABASE_SETUP.sql` yang ada di proyek ini, *copy* semua teks di dalamnya.
4. *Paste* teks tersebut ke dalam SQL Editor Supabase, lalu tekan tombol **RUN**.
   *(Selesai! Database Anda sekarang sudah memiliki struktur tabel yang dibutuhkan untuk menyimpan data suhu, kunyahan, dan notifikasi).*
5. Buka menu **Project Settings** -> **API**. Cari tulisan `URL` dan `anon key`. Copy kedua kode ini.

---

## 3. CARA MENGHUBUNGKAN APLIKASI WEB (Vercel) KE DATABASE

1. Buka dashboard Vercel, masuk ke proyek **Rumysinc-testing**.
2. Masuk ke tab **Settings** -> **Environment Variables**.
3. Tambahkan 2 kunci baru dari Supabase tadi:
   - Key: `VITE_SUPABASE_URL` | Value: `(paste URL dari Supabase)`
   - Key: `VITE_SUPABASE_ANON_KEY` | Value: `(paste anon key dari Supabase)`
4. Klik **Save**, lalu buka tab Deployments dan klik **Redeploy** agar aplikasi web bisa membaca database.

---

## 4. CARA SETUP HARDWARE (Arduino IDE untuk ESP32)

Kabar baiknya! Firmware ESP32 lama Anda sudah mendukung sistem HTTP POST. Anda hanya perlu **mengubah 1 baris kode** pada firmware Arduino/ESP32 Anda.

Cari bagian `SERVER_URL` di file `.ino` (firmware) Anda, dan ubah menjadi seperti ini:

```cpp
// UBAH BARIS INI KE ALAMAT VERCEL ANDA
const char* SERVER_URL = "https://rumysinc-testing.vercel.app/api/ingest";
```

Format data yang dikirimkan oleh ESP32 (dalam bentuk JSON) harus dipastikan persis seperti ini:
```json
{
  "id": "ID-001",
  "temp": 39.6,
  "chewing": 45,
  "battery": 80
}
```

### Apa yang terjadi saat ESP32 mengirim data?
Saat ESP32 menembakkan data tersebut ke `https://rumysinc-testing.vercel.app/api/ingest`, sistem Vercel akan otomatis:
1. Mengecek apakah suhu di atas 39.5°C atau kunyahan di bawah 30.
2. Jika iya, Vercel akan menyalakan *alarm* bahaya di database.
3. Aplikasi web Anda yang sedang terbuka di HP/Laptop akan langsung memunculkan peringatan "Toast Notification" (warna merah) secara *real-time* tanpa perlu Anda *refresh* halamannya!
