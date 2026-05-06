/**
 * useRealtimeCattle.ts
 * 
 * ⚠️  DEPRECATED - Hook ini tidak lagi digunakan secara langsung.
 * 
 * Semua logika realtime telah dipindahkan ke CattleContext.tsx
 * yang mengelola 3 channel Supabase Realtime:
 *  1. cattle_inventory   → sinkronisasi data master sapi
 *  2. sensor_data        → update langsung dari hardware ESP32
 *  3. notifications      → alert anomali dari mqtt-backend (Railway)
 * 
 * File ini dipertahankan sebagai referensi arsitektur.
 */

export {};
