import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
export interface CattleData {
  id: string;
  name: string;
  breed: string;
  temp: string;
  chewing: string;
  battery: number;
  status: "normal" | "warning";
  health: number;
  age: { year: number; month: number; day: number };
  gender: "Jantan" | "Betina";
  methaneLevel: number;
  lastUpdated: string | null;
  rumination: {
    status: string;
    frequency: string;
    duration: string;
    intensity: string;
    metanePotential: string;
    feedType: string;
    recommendation: string;
    targetMethane: string;
    feedBoost: string;
    ruminalHealth: string;
  };
}

export interface AppNotification {
  id: number;
  type: "warning" | "info" | "success";
  message: string;
  time: string;
  cattleId?: string;
  isRead: boolean;
}

// ============================================================
// HELPER: Map baris Supabase cattle_inventory → CattleData
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInventoryToCattle(row: any): CattleData {
  const temp = parseFloat(row.current_temp ?? 38.5);
  const chewing = row.current_chewing ?? 60;
  const battery = row.battery ?? 100;
  const health = row.health_score ?? 95;
  const isAnomaly = temp >= 39.5 || chewing < 30;
  const isWarning = temp >= 39.1 || chewing < 50;

  // Derive rumination status from sensor values
  let ruminationStatus = 'Normal Terkendali';
  let feedType = 'Rumput Segar';
  let recommendation = 'Pakan cukup optimal. Pertahankan.';
  let intensity = 'Sedang';
  let metanePotential = 'Level Normal';
  let ruminalHealth = 'Sangat Baik';

  if (isAnomaly) {
    ruminationStatus = 'Penurunan Drastis';
    feedType = 'Jerami Kering';
    recommendation = 'Tingkatkan pakan bernutrisi tinggi segera.';
    intensity = 'Tinggi';
    metanePotential = 'Tinggi';
    ruminalHealth = 'Perlu Pemeriksaan';
  } else if (isWarning) {
    ruminationStatus = 'Kunyahan Lambat';
    intensity = 'Tinggi';
    metanePotential = 'Sedang';
    ruminalHealth = 'Perlu Perhatian';
  }

  // Parse age from date_of_birth or age fields
  let age = { year: 2, month: 0, day: 0 };
  if (row.date_of_birth) {
    const dob = new Date(row.date_of_birth);
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    let days = now.getDate() - dob.getDate();
    if (days < 0) { months--; days += 30; }
    if (months < 0) { years--; months += 12; }
    age = { year: Math.max(0, years), month: Math.max(0, months), day: Math.max(0, days) };
  } else if (row.age_years != null) {
    age = { year: row.age_years ?? 0, month: row.age_months ?? 0, day: 0 };
  }

  return {
    id: row.id,
    name: row.name ?? `Sapi ${row.id}`,
    breed: row.breed ?? 'Brahman Cross',
    temp: temp.toFixed(1),
    chewing: `${chewing}x/menit`,
    battery,
    status: isAnomaly || isWarning ? 'warning' : 'normal',
    health: Math.min(100, Math.max(0, health)),
    age,
    gender: (row.gender === 'Jantan' || row.gender === 'Betina') ? row.gender : 'Betina',
    methaneLevel: row.methane_level ?? 110,
    lastUpdated: row.last_updated ?? null,
    rumination: {
      status: ruminationStatus,
      frequency: `${chewing}x/mnt`,
      duration: `${(3 + Math.random() * 2).toFixed(1)} detik`,
      intensity,
      metanePotential,
      feedType,
      recommendation,
      targetMethane: '110g/hari',
      feedBoost: '+5%',
      ruminalHealth,
    },
  };
}

// ============================================================
// CONTEXT
// ============================================================
interface CattleContextType {
  cattleData: CattleData[];
  selectedCattleId: string;
  setSelectedCattleId: (id: string) => void;
  selectedCattle: CattleData | null;
  addCattle: (newCow: CattleData) => void;
  updateCattle: (id: string, updatedCow: Partial<CattleData>) => void;
  deleteCattle: (id: string) => void;
  notifications: AppNotification[];
  markNotificationAsRead: (id: number) => void;
  addNotification: (notif: Omit<AppNotification, 'id' | 'isRead'>) => void;
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'error';
}

const CattleContext = createContext<CattleContextType | undefined>(undefined);

const LS_NOTIF_KEY = 'rumisync_notif_v1';

function loadNotifFromStorage(): AppNotification[] {
  // Tidak load dari localStorage — notifikasi hanya dari Supabase realtime
  return [];
}

// ============================================================
// PROVIDER
// ============================================================
export function CattleProvider({ children }: { children: ReactNode }) {
  const [cattleData, setCattleData] = useState<CattleData[]>([]);
  const [selectedCattleId, setSelectedCattleId] = useState<string>('');
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotifFromStorage());
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Persist cattle data ke localStorage
  useEffect(() => {
    // Tidak persist cattle — selalu fresh dari Supabase
  }, []);

  // ─── 1. Load initial data from Supabase ─────────────────
  useEffect(() => {
    async function fetchInitialData() {
      setIsLoading(true);
      setConnectionStatus('connecting');

      const { data, error } = await supabase
        .from('cattle_inventory')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        console.error('❌ Gagal load data dari Supabase:', error.message);
        setConnectionStatus('error');
        toast.error('Gagal memuat data sapi', { description: 'Periksa koneksi dan konfigurasi Supabase.' });
      } else if (data && data.length > 0) {
        const mapped = data.map(mapInventoryToCattle);
        setCattleData(mapped);
        setSelectedCattleId(mapped[0].id);
        setConnectionStatus('connected');
        console.log(`✅ Berhasil load ${mapped.length} sapi dari Supabase.`);
      } else {
        // Table exists but empty
        setCattleData([]);
        setConnectionStatus('connected');
        console.warn('⚠️ Tabel cattle_inventory kosong.');
      }

      setIsLoading(false);
    }

    fetchInitialData();
  }, []);

  // ─── 2. Realtime: cattle_inventory (status update langsung) ───
  useEffect(() => {
    const channel = supabase
      .channel('cattle_inventory_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cattle_inventory' },
        (payload) => {
          console.log('🔄 Perubahan cattle_inventory:', payload.eventType, payload.new);

          if (payload.eventType === 'INSERT' && payload.new) {
            const newCow = mapInventoryToCattle(payload.new);
            setCattleData(prev => {
              // Hindari duplikat
              if (prev.some(c => c.id === newCow.id)) return prev;
              return [...prev, newCow];
            });
            toast.success(`Sapi baru terdaftar: ${newCow.id}`, { description: newCow.name });
          }

          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedCow = mapInventoryToCattle(payload.new);
            setCattleData(prev =>
              prev.map(c => c.id === updatedCow.id ? updatedCow : c)
            );
          }

          if (payload.eventType === 'DELETE' && payload.old) {
            setCattleData(prev => prev.filter(c => c.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Realtime cattle_inventory aktif');
          setConnectionStatus('connected');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 3. Realtime: sensor_data (data mentah dari hardware) ───
  useEffect(() => {
    const channel = supabase
      .channel('sensor_data_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sensor_data' },
        (payload) => {
          const d = payload.new as {
            cattle_id: string;
            temperature: number;
            chewing_rate: number;
            battery_level: number;
            status: string;
          };

          console.log('📥 Data sensor baru:', d);

          // Update cattle state secara optimis (tanpa menunggu cattle_inventory update)
          setCattleData(prev =>
            prev.map(c => {
              if (c.id !== d.cattle_id) return c;

              const temp = d.temperature;
              const chewing = d.chewing_rate;
              const isAnomaly = temp >= 39.5 || chewing < 30;
              const isWarning = temp >= 39.1 || chewing < 50;

              return {
                ...c,
                temp: temp.toFixed(1),
                chewing: `${chewing}x/menit`,
                battery: d.battery_level,
                status: isAnomaly || isWarning ? 'warning' : 'normal',
                lastUpdated: new Date().toISOString(),
                rumination: {
                  ...c.rumination,
                  frequency: `${chewing}x/mnt`,
                },
              };
            })
          );
        }
      )
      .subscribe(() => {
        console.log('📡 Realtime sensor_data aktif');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 4. Realtime: notifications dari backend ────────────
  useEffect(() => {
    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notif = payload.new as {
            id: number;
            cattle_id: string;
            message: string;
            type: string;
            created_at: string;
          };

          console.log('🔔 Notifikasi baru:', notif);

          const newAppNotif: AppNotification = {
            id: notif.id ?? Date.now(),
            type: notif.type === 'warning' || notif.type === 'danger' ? 'warning' : 'info',
            message: `${notif.cattle_id}: ${notif.message}`,
            time: 'Baru saja',
            cattleId: notif.cattle_id,
            isRead: false,
          };

          setNotifications(prev => [newAppNotif, ...prev]);

          // Tampilkan toast
          if (notif.type === 'warning' || notif.type === 'danger') {
            toast.error(`⚠️ Peringatan: ${notif.cattle_id}`, {
              description: notif.message,
              duration: 8000,
            });
          }
        }
      )
      .subscribe(() => {
        console.log('📡 Realtime notifications aktif');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── CRUD operations ────────────────────────────────────
  const addCattle = useCallback((newCow: CattleData) => {
    setCattleData(prev => [newCow, ...prev]);
  }, []);

  const updateCattle = useCallback((id: string, updatedData: Partial<CattleData>) => {
    setCattleData(prev => prev.map(c => c.id === id ? { ...c, ...updatedData } : c));
  }, []);

  const deleteCattle = useCallback((id: string) => {
    setCattleData(prev => prev.filter(c => c.id !== id));
  }, []);

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'isRead'>) => {
    const newNotif: AppNotification = { ...notif, id: Date.now(), isRead: false };
    setNotifications(prev => [newNotif, ...prev]);
  }, []);

  const markNotificationAsRead = useCallback((id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }, []);

  const selectedCattle = cattleData.find(c => c.id === selectedCattleId) ?? cattleData[0] ?? null;

  return (
    <CattleContext.Provider value={{
      cattleData,
      selectedCattleId,
      setSelectedCattleId,
      selectedCattle,
      addCattle,
      updateCattle,
      deleteCattle,
      notifications,
      markNotificationAsRead,
      addNotification,
      isLoading,
      connectionStatus,
    }}>
      {children}
    </CattleContext.Provider>
  );
}

export function useCattle() {
  const context = useContext(CattleContext);
  if (context === undefined) {
    throw new Error('useCattle must be used within a CattleProvider');
  }
  return context;
}
