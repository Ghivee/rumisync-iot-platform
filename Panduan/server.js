// ============================================================
//  RUMI-SYNC SERVER — Node.js + Express
//  Menerima POST dari ESP32 dan menyimpannya ke database
//  agar bisa diambil oleh web app RumiSync
//
//  Install: npm install express cors better-sqlite3
//  Jalankan: node server.js
// ============================================================

const express = require('express');
const cors    = require('cors');
const Database = require('better-sqlite3');

const app = express();
const db  = new Database('rumisync.db');

app.use(cors());
app.use(express.json());

// ============================================================
//  INISIALISASI DATABASE
//  Struktur tabel mengikuti PERSIS field yang dibaca web app
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS sapi (
    id        TEXT PRIMARY KEY,
    name      TEXT,
    gender    TEXT,
    age_year  INTEGER,
    age_month INTEGER,
    age_day   INTEGER,
    mac       TEXT,
    rel_position INTEGER
  );

  -- Tabel scan per kunjungan sapi (untuk tabel di Dashboard DV())
  CREATE TABLE IF NOT EXISTS scan_log (
    scan_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    cow_id     TEXT,
    time       TEXT,      -- "14:32"  → field 'time' di DV()
    temp       TEXT,      -- "38.1°C" → field 'temp' di DV()
    chewing    TEXT,      -- "58x/menit" → field 'chewing'
    status     TEXT,      -- "normal" / "warning"
    health     INTEGER,   -- 0-100 → field 'health' di G0
    temp_value REAL,      -- float → untuk Kurva Suhu (Ane)
    rumination_duration REAL,  -- float → untuk Grafik Durasi (Tne)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabel ruminasi detail (untuk Medical EWS dan Eco-Nutrisi)
  CREATE TABLE IF NOT EXISTS rumination_detail (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    cow_id       TEXT,
    scan_id      INTEGER,
    status       TEXT,      -- "Kunyahan Normal & Aktif"
    frequency    TEXT,      -- "58x/mnt"
    duration     TEXT,      -- "3.5 detik"
    intensity    TEXT,      -- "Sedang"
    metane_potential TEXT,
    feed_type    TEXT,
    recommendation TEXT,
    target_methane TEXT,
    feed_boost   TEXT,
    ruminal_health TEXT,
    methane_level INTEGER,  -- gram/hari
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabel BLE/System (untuk halaman /system-control)
  CREATE TABLE IF NOT EXISTS ble_status (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cow_id     TEXT,
    mac        TEXT,
    rssi       INTEGER,
    rssi_status TEXT,      -- "Sangat Kuat" / "Kuat" / "Sedang"
    position   INTEGER,    -- 0-100 untuk Live Tracker Rel
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Time-series suhu per 2 jam (untuk Kurva Suhu 24 jam)
  CREATE TABLE IF NOT EXISTS temp_timeseries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cow_id     TEXT,
    time_slot  TEXT,       -- "00:00", "02:00", dst.
    temp_avg   REAL,
    date       TEXT,       -- YYYY-MM-DD
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ============================================================
//  POST /api/data — Endpoint utama dari ESP32
// ============================================================
app.post('/api/data', (req, res) => {
  const d = req.body;

  if (!d.id || !d.mac) {
    return res.status(400).json({ error: 'id dan mac wajib ada' });
  }

  try {
    // 1. Upsert profil sapi
    db.prepare(`
      INSERT INTO sapi (id, name, gender, age_year, age_month, age_day, mac, rel_position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, gender=excluded.gender,
        mac=excluded.mac, rel_position=excluded.rel_position
    `).run(
      d.id, d.name, d.gender,
      d.age?.year || 0, d.age?.month || 0, d.age?.day || 0,
      d.mac, d.position || 50
    );

    // 2. Simpan scan log
    const scanInsert = db.prepare(`
      INSERT INTO scan_log
        (cow_id, time, temp, chewing, status, health, temp_value, rumination_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.id, d.time, d.temp, d.chewing,
      d.status, d.health, d.tempValue, d.ruminationDuration
    );

    const scanId = scanInsert.lastInsertRowid;

    // 3. Simpan detail ruminasi
    if (d.rumination) {
      db.prepare(`
        INSERT INTO rumination_detail
          (cow_id, scan_id, status, frequency, duration, intensity,
           metane_potential, feed_type, recommendation, target_methane,
           feed_boost, ruminal_health, methane_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        d.id, scanId,
        d.rumination.status, d.rumination.frequency, d.rumination.duration,
        d.rumination.intensity, d.rumination.metanePotential,
        d.rumination.feedType, d.rumination.recommendation,
        d.rumination.targetMethane, d.rumination.feedBoost,
        d.rumination.ruminalHealth, d.methaneLevel
      );
    }

    // 4. Simpan BLE status
    db.prepare(`
      INSERT INTO ble_status (cow_id, mac, rssi, rssi_status, position)
      VALUES (?, ?, ?, ?, ?)
    `).run(d.id, d.mac, d.rssi, d.rssiStatus, d.position || 50);

    // 5. Simpan ke time-series suhu
    //    Kelompokkan ke slot 2 jam terdekat
    const hour = parseInt((d.time || '00:00').split(':')[0]);
    const slot = String(Math.floor(hour / 2) * 2).padStart(2, '0') + ':00';
    const today = new Date().toISOString().split('T')[0];

    const existing = db.prepare(
      `SELECT id FROM temp_timeseries WHERE cow_id=? AND time_slot=? AND date=?`
    ).get(d.id, slot, today);

    if (existing) {
      // Update rata-rata (moving average sederhana)
      db.prepare(
        `UPDATE temp_timeseries SET temp_avg=(temp_avg+?)/2 WHERE id=?`
      ).run(d.tempValue, existing.id);
    } else {
      db.prepare(
        `INSERT INTO temp_timeseries (cow_id, time_slot, temp_avg, date) VALUES (?, ?, ?, ?)`
      ).run(d.id, slot, d.tempValue, today);
    }

    console.log(`[OK] Data ${d.id} @ ${d.time} — suhu: ${d.temp}, kunyahan: ${d.chewing}, status: ${d.status}`);
    res.json({ success: true, scan_id: scanId });

  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  GET /api/dashboard — Data untuk halaman Dashboard (/)
//  Mengembalikan format PERSIS seperti array di DV() function
// ============================================================
app.get('/api/dashboard', (req, res) => {
  // 8 scan terakhir, format persis DV() di web
  const rows = db.prepare(`
    SELECT s.cow_id as id, s.time, s.temp, s.chewing, s.status,
           sp.gender, sp.age_year, sp.age_month, sp.age_day
    FROM scan_log s
    JOIN sapi sp ON s.cow_id = sp.id
    ORDER BY s.created_at DESC LIMIT 8
  `).all();

  const result = rows.map(r => ({
    time:   r.time,
    id:     r.id,
    temp:   r.temp,
    chewing:r.chewing,
    status: r.status,
    gender: r.gender,
    age: { year: r.age_year, month: r.age_month, day: r.age_day }
  }));

  // Summary cards (18 aman, 2 warning)
  const total = db.prepare(`SELECT COUNT(DISTINCT cow_id) as n FROM sapi`).get().n;
  const warning = db.prepare(
    `SELECT COUNT(DISTINCT cow_id) as n FROM scan_log WHERE status='warning' AND created_at > datetime('now','-1 hour')`
  ).get().n;

  res.json({ scanList: result, totalSapi: total, warningCount: warning });
});

// ============================================================
//  GET /api/medical/:cowId — Data untuk halaman /medical
//  Mengembalikan format PERSIS seperti G0 + Ane + Tne di web
// ============================================================
app.get('/api/medical/:cowId', (req, res) => {
  const cowId = req.params.cowId;

  // Profil sapi (G0 array format)
  const sapi = db.prepare(`SELECT * FROM sapi WHERE id=?`).get(cowId);
  if (!sapi) return res.status(404).json({ error: 'Sapi tidak ditemukan' });

  // Ambil scan terbaru untuk health dan status
  const latest = db.prepare(
    `SELECT * FROM scan_log WHERE cow_id=? ORDER BY created_at DESC LIMIT 1`
  ).get(cowId);

  // Ambil detail ruminasi terbaru (untuk panel medical)
  const rum = db.prepare(
    `SELECT * FROM rumination_detail WHERE cow_id=? ORDER BY created_at DESC LIMIT 1`
  ).get(cowId);

  // Time-series suhu hari ini (format Ane: [{time, temp}])
  const today = new Date().toISOString().split('T')[0];
  const tempSeries = db.prepare(
    `SELECT time_slot as time, ROUND(temp_avg,1) as temp
     FROM temp_timeseries WHERE cow_id=? AND date=?
     ORDER BY time_slot`
  ).all(cowId, today);

  // Time-series ruminasi (format Tne: [{hour, duration}])
  const rumSeries = db.prepare(
    `SELECT substr(time,1,2)||'-'||(substr(time,1,2)+2) as hour,
            ROUND(AVG(rumination_duration),0) as duration
     FROM scan_log WHERE cow_id=? AND date(created_at)=?
     GROUP BY substr(time,1,2)
     ORDER BY time`
  ).all(cowId, today);

  res.json({
    // Format G0 (cattle list)
    id:     sapi.id,
    name:   sapi.name,
    health: latest?.health || 95,
    status: latest?.status || 'normal',
    age:    { year: sapi.age_year, month: sapi.age_month, day: sapi.age_day },
    gender: sapi.gender,

    // Format Ane (Kurva Suhu)
    tempSeries: tempSeries.length > 0 ? tempSeries : [
      {time:"00:00",temp:37.5},{time:"06:00",temp:37.8},{time:"12:00",temp:38.5},{time:"18:00",temp:39.0}
    ],

    // Format Tne (Grafik Durasi Ruminasi)
    ruminationSeries: rumSeries.length > 0 ? rumSeries : [
      {hour:"00-02",duration:65},{hour:"06-08",duration:60},{hour:"12-14",duration:52},{hour:"18-20",duration:45}
    ],

    // Detail ruminasi (Y0 array format)
    rumination: rum ? {
      status:         rum.status,
      frequency:      rum.frequency,
      duration:       rum.duration,
      intensity:      rum.intensity,
      metanePotential:rum.metane_potential,
      feedType:       rum.feed_type,
      recommendation: rum.recommendation,
      targetMethane:  rum.target_methane,
      feedBoost:      rum.feed_boost,
      ruminalHealth:  rum.ruminal_health
    } : null
  });
});

// ============================================================
//  GET /api/eco/:cowId — Data untuk halaman /eco-nutrition
//  Format Y0 array: {id, methaneLevel, rumination:{...}}
// ============================================================
app.get('/api/eco/:cowId', (req, res) => {
  const cowId = req.params.cowId;

  const rum = db.prepare(
    `SELECT * FROM rumination_detail WHERE cow_id=? ORDER BY created_at DESC LIMIT 1`
  ).get(cowId);

  const sapi = db.prepare(`SELECT * FROM sapi WHERE id=?`).get(cowId);
  if (!sapi) return res.status(404).json({ error: 'Sapi tidak ditemukan' });

  res.json({
    id:          sapi.id,
    name:        sapi.name,
    methaneLevel: rum?.methane_level || 110,
    rumination: rum ? {
      status:         rum.status,
      frequency:      rum.frequency,
      duration:       rum.duration,
      intensity:      rum.intensity,
      metanePotential:rum.metane_potential,
      feedType:       rum.feed_type,
      recommendation: rum.recommendation,
      targetMethane:  rum.target_methane,
      feedBoost:      rum.feed_boost,
      ruminalHealth:  rum.ruminal_health
    } : null
  });
});

// ============================================================
//  GET /api/system — Data untuk halaman /system-control
//  Format Mne array: [{id, mac, rssi, status}]
//  Format Ul array : [{id, position}]
// ============================================================
app.get('/api/system', (req, res) => {
  // BLE scan terbaru per sapi (Mne format)
  const bleData = db.prepare(`
    SELECT cow_id as id, mac, rssi, rssi_status as status, position
    FROM ble_status
    WHERE id IN (
      SELECT MAX(id) FROM ble_status GROUP BY cow_id
    )
    ORDER BY rssi DESC
  `).all();

  // Posisi rel terbaru (Ul format)
  const relPositions = db.prepare(`
    SELECT cow_id as id, position
    FROM ble_status
    WHERE id IN (SELECT MAX(id) FROM ble_status GROUP BY cow_id)
    ORDER BY position
  `).all();

  // Event log (kne format)
  const eventLog = db.prepare(`
    SELECT datetime(created_at,'localtime') as date,
           'Scan selesai pada ' || cow_id as event,
           'scan' as type
    FROM scan_log ORDER BY created_at DESC LIMIT 6
  `).all();

  res.json({
    bleDevices:  bleData,
    relPositions: relPositions,
    eventLog:    eventLog
  });
});

// ============================================================
//  GET /api/cattle-list — Daftar semua sapi (G0 format)
// ============================================================
app.get('/api/cattle-list', (req, res) => {
  const list = db.prepare(`
    SELECT sp.id, sp.name, sp.gender,
           sp.age_year, sp.age_month, sp.age_day,
           sl.health, sl.status
    FROM sapi sp
    LEFT JOIN scan_log sl ON sl.cow_id = sp.id
    WHERE sl.created_at = (
      SELECT MAX(created_at) FROM scan_log WHERE cow_id = sp.id
    ) OR sl.created_at IS NULL
  `).all();

  const result = list.map(r => ({
    id:     r.id,
    name:   r.name,
    health: r.health || 95,
    status: r.status || 'normal',
    gender: r.gender,
    age:    { year: r.age_year, month: r.age_month, day: r.age_day }
  }));

  res.json(result);
});

// ============================================================
//  START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RUMI-SYNC SERVER] Berjalan di port ${PORT}`);
  console.log(`[RUMI-SYNC SERVER] Endpoint:`);
  console.log(`  POST /api/data         ← dari ESP32`);
  console.log(`  GET  /api/dashboard    → halaman /`);
  console.log(`  GET  /api/medical/:id  → halaman /medical`);
  console.log(`  GET  /api/eco/:id      → halaman /eco-nutrition`);
  console.log(`  GET  /api/system       → halaman /system-control`);
  console.log(`  GET  /api/cattle-list  → daftar semua sapi`);
});
