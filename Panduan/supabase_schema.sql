-- ================================================================
-- RUMISYNC IoT — SQL SCHEMA SUPABASE
-- Jalankan script ini di Supabase SQL Editor
-- ================================================================

-- ─── Tabel 1: cattle_inventory (data master sapi) ────────────
-- Ini adalah tabel utama yang di-load dan di-subscribe oleh frontend Vercel
CREATE TABLE IF NOT EXISTS public.cattle_inventory (
  id              TEXT PRIMARY KEY,           -- Format: "ID-001", "ID-002", dll.
  name            TEXT NOT NULL DEFAULT '',
  breed           TEXT DEFAULT 'Brahman Cross',
  gender          TEXT DEFAULT 'Betina',      -- "Jantan" atau "Betina"
  date_of_birth   DATE,
  age_years       INTEGER DEFAULT 0,
  age_months      INTEGER DEFAULT 0,
  
  -- Data sensor terkini (diupdate setiap kali hardware kirim data)
  current_temp    NUMERIC(5, 2) DEFAULT 38.5,
  current_chewing INTEGER DEFAULT 60,
  battery         INTEGER DEFAULT 100,
  health_score    INTEGER DEFAULT 95,
  health_status   TEXT DEFAULT 'Aman',        -- "Aman" atau "Sakit"
  methane_level   INTEGER DEFAULT 110,
  
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabel 2: sensor_data (histori data sensor) ──────────────
-- Setiap kali hardware kirim data, record baru ditambahkan di sini
-- Frontend subscribe ke tabel ini untuk update real-time
CREATE TABLE IF NOT EXISTS public.sensor_data (
  id              BIGSERIAL PRIMARY KEY,
  cattle_id       TEXT NOT NULL REFERENCES public.cattle_inventory(id) ON DELETE CASCADE,
  temperature     NUMERIC(5, 2) NOT NULL,
  chewing_rate    INTEGER NOT NULL,
  battery_level   INTEGER,
  status          TEXT DEFAULT 'normal',      -- "normal" atau "danger"
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Tabel 3: notifications (alert anomali) ──────────────────
-- Diisi oleh mqtt-backend (Railway) ketika anomali terdeteksi
CREATE TABLE IF NOT EXISTS public.notifications (
  id              BIGSERIAL PRIMARY KEY,
  cattle_id       TEXT NOT NULL,
  message         TEXT NOT NULL,
  type            TEXT DEFAULT 'warning',     -- "warning", "danger", "info"
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEX untuk performa query
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_sensor_data_cattle_id ON public.sensor_data(cattle_id);
CREATE INDEX IF NOT EXISTS idx_sensor_data_recorded_at ON public.sensor_data(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_cattle_id ON public.notifications(cattle_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);

-- ================================================================
-- ROW LEVEL SECURITY (RLS)
-- ================================================================
-- Enable RLS
ALTER TABLE public.cattle_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: frontend (anon key) bisa READ semua data
CREATE POLICY "allow_public_read_cattle_inventory"
  ON public.cattle_inventory FOR SELECT
  USING (true);

CREATE POLICY "allow_public_read_sensor_data"
  ON public.sensor_data FOR SELECT
  USING (true);

CREATE POLICY "allow_public_read_notifications"
  ON public.notifications FOR SELECT
  USING (true);

-- Policy: service_role (backend Railway) bisa INSERT/UPDATE/DELETE
-- Catatan: service_role otomatis bypass RLS, tapi tambahkan ini untuk kejelasan
CREATE POLICY "allow_service_role_write_cattle_inventory"
  ON public.cattle_inventory FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_service_role_write_sensor_data"
  ON public.sensor_data FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_service_role_write_notifications"
  ON public.notifications FOR ALL
  USING (true)
  WITH CHECK (true);

-- ================================================================
-- ENABLE REALTIME PUBLICATION
-- Pastikan tabel-tabel ini masuk ke Realtime publication
-- ================================================================
-- Jalankan di Supabase SQL Editor:
ALTER PUBLICATION supabase_realtime ADD TABLE public.cattle_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_data;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ================================================================
-- DATA CONTOH (Opsional - untuk testing tanpa hardware)
-- ================================================================
INSERT INTO public.cattle_inventory (id, name, breed, gender, age_years, age_months, current_temp, current_chewing, battery, health_score, health_status)
VALUES
  ('ID-001', 'Sapi Lokal - 001', 'Brahman Cross', 'Betina', 3, 5, 38.5, 65, 87, 95, 'Aman'),
  ('ID-002', 'Sapi Lokal - 002', 'Limosin',       'Jantan', 2, 3, 39.2, 52, 72, 82, 'Aman'),
  ('ID-003', 'Sapi Lokal - 003', 'Simental',      'Betina', 4, 1, 39.8, 28, 60, 65, 'Sakit')
ON CONFLICT (id) DO NOTHING;
