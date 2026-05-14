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
  rssi: number | null;
  status: "normal" | "warning";
  health: number; // skor kesehatan global 0-100
  age: { year: number; month: number; day: number };
  gender: "Jantan" | "Betina";
  lastUpdated: string | null;
}

export interface AppNotification {
  id: number;
  type: "warning" | "info" | "success";
  message: string;
  time: string;
  cattleId?: string;
  isRead: boolean;
}

export interface RelConfig {
  id: number;
  rel_number: number;
  cattle_count: number;
  label: string;
}

// ============================================================
// HELPER: Map baris Supabase cattle_inventory → CattleData
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInventoryToCattle(row: any): CattleData {
  const temp = parseFloat(row.current_temp ?? 0);
  const chewing = row.current_chewing ?? 0;
  const healthScore = row.health_score ?? 100;
  const isAnomaly = healthScore < 60;
  const isWarning = healthScore < 80;

  // Parse age from fields
  let age = { year: 0, month: 0, day: 0 };
  if (row.date_of_birth) {
    const dob = new Date(row.date_of_birth);
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    let days = now.getDate() - dob.getDate();
    if (days < 0) { months--; days += 30; }
    if (months < 0) { years--; months += 12; }
    age = { year: Math.max(0, years), month: Math.max(0, months), day: Math.max(0, days) };
  } else if (row.age_year != null) {
    age = { year: row.age_year ?? 0, month: row.age_month ?? 0, day: row.age_day ?? 0 };
  }

  return {
    id: row.id,
    name: row.name ?? `Sapi ${row.id}`,
    breed: row.breed ?? 'Brahman Cross',
    temp: temp.toFixed(1),
    chewing: `${chewing}x/menit`,
    rssi: row.current_rssi ?? null,
    status: isAnomaly || isWarning ? 'warning' : 'normal',
    health: Math.min(100, Math.max(0, healthScore)),
    age,
    gender: (row.gender === 'Jantan' || row.gender === 'Betina') ? row.gender : 'Betina',
    lastUpdated: row.last_updated ?? null,
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
  espBattery: number;
  relConfigs: RelConfig[];
  updateRelConfig: (relNumber: number, cattleCount: number) => void;
  addRelConfig: (cattleCount: number) => void;
  deleteRelConfig: (relNumber: number) => void;
}

const CattleContext = createContext<CattleContextType | undefined>(undefined);

// ============================================================
// PROVIDER
// ============================================================
export function CattleProvider({ children }: { children: ReactNode }) {
  const [cattleData, setCattleData] = useState<CattleData[]>([]);
  const [selectedCattleId, setSelectedCattleId] = useState<string>('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [espBattery, setEspBattery] = useState(100);
  const [relConfigs, setRelConfigs] = useState<RelConfig[]>([]);

  // ─── 1. Load initial data ─────────────────────────────────
  useEffect(() => {
    async function fetchInitialData() {
      setIsLoading(true);
      setConnectionStatus('connecting');

      // Load cattle
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
      } else {
        setCattleData([]);
        setConnectionStatus('connected');
      }

      // Load ESP battery
      const { data: espData } = await supabase.from('esp_status').select('battery').eq('id', 'main').single();
      if (espData) setEspBattery(espData.battery ?? 100);

      // Load rel configs
      const { data: relData } = await supabase.from('rel_config').select('*').order('rel_number', { ascending: true });
      if (relData) setRelConfigs(relData);

      setIsLoading(false);
    }

    fetchInitialData();
  }, []);

  // ─── 2. Realtime: cattle_inventory ────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('cattle_inventory_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cattle_inventory' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const newCow = mapInventoryToCattle(payload.new);
          setCattleData(prev => {
            if (prev.some(c => c.id === newCow.id)) return prev;
            return [...prev, newCow];
          });
          toast.success(`Sapi baru terdaftar: ${newCow.id}`, { description: newCow.name });
        }
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updatedCow = mapInventoryToCattle(payload.new);
          setCattleData(prev => prev.map(c => c.id === updatedCow.id ? updatedCow : c));
        }
        if (payload.eventType === 'DELETE' && payload.old) {
          setCattleData(prev => prev.filter(c => c.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 3. Realtime: sensor_data ─────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('sensor_data_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, (payload) => {
        const d = payload.new as {
          cattle_id: string;
          temperature: number;
          chewing_rate: number;
          rssi: number | null;
          status: string;
        };

        setCattleData(prev =>
          prev.map(c => {
            if (c.id !== d.cattle_id) return c;
            const temp = d.temperature;
            const chewing = d.chewing_rate;
            return {
              ...c,
              temp: temp.toFixed(1),
              chewing: `${chewing}x/menit`,
              rssi: d.rssi ?? c.rssi,
              lastUpdated: new Date().toISOString(),
            };
          })
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 4. Realtime: notifications ───────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('notifications_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const notif = payload.new as {
          id: number;
          cattle_id: string;
          message: string;
          type: string;
          created_at: string;
        };

        const newAppNotif: AppNotification = {
          id: notif.id ?? Date.now(),
          type: notif.type === 'warning' || notif.type === 'danger' ? 'warning' : 'info',
          message: `${notif.cattle_id}: ${notif.message}`,
          time: 'Baru saja',
          cattleId: notif.cattle_id,
          isRead: false,
        };

        setNotifications(prev => [newAppNotif, ...prev]);

        if (notif.type === 'warning' || notif.type === 'danger') {
          toast.error(`⚠️ Peringatan: ${notif.cattle_id}`, {
            description: notif.message,
            duration: 8000,
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 5. Realtime: ESP battery ─────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('esp_battery_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'esp_status' }, (payload) => {
        if (payload.new && (payload.new as any).battery != null) {
          setEspBattery((payload.new as any).battery);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── 6. Realtime: rel_config ──────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('rel_config_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rel_config' }, () => {
        // Reload all configs on any change
        supabase.from('rel_config').select('*').order('rel_number', { ascending: true })
          .then(({ data }) => { if (data) setRelConfigs(data); });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── CRUD operations ─────────────────────────────────────
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

  const updateRelConfig = useCallback(async (relNumber: number, cattleCount: number) => {
    const { error } = await supabase
      .from('rel_config')
      .update({ cattle_count: cattleCount })
      .eq('rel_number', relNumber);
    if (error) {
      toast.error('Gagal update konfigurasi Rel');
    } else {
      setRelConfigs(prev => prev.map(r => r.rel_number === relNumber ? { ...r, cattle_count: cattleCount } : r));
      toast.success(`Rel ${relNumber} diatur ke ${cattleCount} sapi`);
    }
  }, []);

  const addRelConfig = useCallback(async (cattleCount: number) => {
    const nextRelNumber = relConfigs.length > 0 ? Math.max(...relConfigs.map(r => r.rel_number)) + 1 : 1;
    const newRel = {
      rel_number: nextRelNumber,
      cattle_count: cattleCount,
      label: `Rel ${nextRelNumber}`
    };
    const { data, error } = await supabase.from('rel_config').insert([newRel]).select().single();
    if (error) {
      toast.error('Gagal menambah Rel');
    } else if (data) {
      setRelConfigs(prev => [...prev, data].sort((a, b) => a.rel_number - b.rel_number));
      toast.success(`Rel ${nextRelNumber} berhasil ditambahkan`);
    }
  }, [relConfigs]);

  const deleteRelConfig = useCallback(async (relNumber: number) => {
    const { error } = await supabase.from('rel_config').delete().eq('rel_number', relNumber);
    if (error) {
      toast.error('Gagal menghapus Rel');
    } else {
      setRelConfigs(prev => prev.filter(r => r.rel_number !== relNumber));
      toast.success(`Rel ${relNumber} berhasil dihapus`);
    }
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
      espBattery,
      relConfigs,
      updateRelConfig,
      addRelConfig,
      deleteRelConfig,
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
