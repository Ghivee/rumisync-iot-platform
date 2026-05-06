import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Signal, RefreshCw, Zap, Radio, Bluetooth, Plus, QrCode, Settings, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCattle } from "../context/CattleContext";
import type { CattleData } from "../context/CattleContext";

// Generate RSSI & MAC secara deterministik dari ID sapi (untuk simulasi iTag BLE)
function deriveITagFromId(id: string) {
  const num = parseInt(id.replace(/\D/g, '')) || 1;
  const seed = num % 256;
  const rssi = -45 - (seed % 35); // range -45 ~ -79
  const status = rssi > -55 ? 'Sangat Kuat' : rssi > -65 ? 'Kuat' : 'Sedang';
  const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const mac = `${hex(seed)}:${hex((seed * 3) % 256)}:${hex((seed * 7) % 256)}:${hex((seed * 11) % 256)}:${hex((seed * 13) % 256)}:${hex((seed * 17) % 256)}`;
  return { id, mac, rssi, status };
}

const initialMaintenanceLogs = [
  { id: 1, date: "Hari ini 10:15", event: "Sensor ID-050 terputus dari jaringan", type: "error", resolvable: true },
  { id: 2, date: "2026-04-06 08:30", event: "RUMI-SYNC berhasil menyelesaikan scan pada ID-018", type: "scan", resolvable: false },
  { id: 3, date: "2026-04-06 19:45", event: "Sinyal iTag ID-008 hilang tiba-tiba", type: "error", resolvable: true },
  { id: 4, date: "2026-04-05 14:20", event: "Sinkronisasi data aktivitas 20 sapi selesai", type: "sync", resolvable: false },
  { id: 5, date: "2026-04-04 09:15", event: "Kalibrasi sensor rumination berhasil", type: "calibration", resolvable: false },
];

const cattleBreedsList = ["Brahman Cross", "Simental", "Limosin", "Ongole", "Bali", "Madura", "Holstein"];

export function SystemControl() {
  const [activeTab, setActiveTab] = useState("live-monitor");
  const [devicePosition, setDevicePosition] = useState(0);
  const [currentCattleIndex, setCurrentCattleIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);

  const { addCattle, cattleData } = useCattle();

  // iTagData dinamis dari cattleData Supabase
  const iTagData = useMemo(() => cattleData.map(c => deriveITagFromId(c.id)), [cattleData]);

  // Batches calculation
  const batches = useMemo(() => {
    // Sort array by numeral ID (e.g. ID-001 -> 1) to establish sequential sensor logic
    const sortedData = [...cattleData].sort((a, b) => {
      const numA = parseInt(a.id.replace(/\\D/g, '')) || 0;
      const numB = parseInt(b.id.replace(/\\D/g, '')) || 0;
      return numA - numB;
    });

    const arr = [];
    const size = 10;
    for (let i = 0; i < sortedData.length; i += size) {
      const slice = sortedData.slice(i, i + size);
      const firstId = slice[0].id;
      const lastId = slice[slice.length - 1].id;
      arr.push({ label: `${firstId} hingga ${lastId}`, startIndex: i, endIndex: i + size - 1, slice });
    }
    return arr;
  }, [cattleData]);

  // Auto-generate next ID by finding the highest existing numeric ID
  const generatedId = useMemo(() => {
    if (!cattleData || cattleData.length === 0) return 'ID-001';
    const maxNum = cattleData.reduce((max, c) => {
      const match = c.id.match(/\d+/);
      const num = match ? parseInt(match[0]) : 0;
      return num > max ? num : max;
    }, 0);
    return `ID-${String(maxNum + 1).padStart(3, '0')}`;
  }, [cattleData]);

  // Handle boundary state when cattleData changes (e.g. gets deleted)
  useEffect(() => {
    if (currentBatchIndex >= batches.length && batches.length > 0) {
      setCurrentBatchIndex(batches.length - 1);
    }
  }, [batches.length, currentBatchIndex]);

  const cattlePositions = useMemo(() => {
    if (batches.length === 0) return [];
    // Protect against out-of-bounds
    const activeBatch = batches[currentBatchIndex] || batches[0];
    return activeBatch.slice.map((c, i) => ({
      id: c.id,
      position: 5 + (i * (90 / Math.max(1, activeBatch.slice.length - 1)))
    }));
  }, [batches, currentBatchIndex]);

  const [newCattleName, setNewCattleName] = useState("");
  const [newCattleGender, setNewCattleGender] = useState<"Jantan" | "Betina">("Betina");
  const [newCattleBreed, setNewCattleBreed] = useState("Brahman Cross");
  const [newCattleAgeYear, setNewCattleAgeYear] = useState("");
  const [newCattleAgeMonth, setNewCattleAgeMonth] = useState("");
  const [newCattleAgeDay, setNewCattleAgeDay] = useState("");
  const [newRumiSyncSerial, setNewRumiSyncSerial] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  // Tab 1 Log State
  const [logs, setLogs] = useState(initialMaintenanceLogs);
  const [calibratingId, setCalibratingId] = useState<number | null>(null);

  useEffect(() => {
    if (cattlePositions.length === 0) return;

    const interval = setInterval(() => {
      setCurrentCattleIndex((prev) => {
        let next = prev + 1; // Always move right (sequential scan)

        if (next >= cattlePositions.length) {
          next = 0; // Reset scanner

          // Auto-sweep jump to next batch when reaching edge!
          setCurrentBatchIndex(prevBatch => (prevBatch + 1) % batches.length);
        }

        return next;
      });
    }, 2500); // Tweak speed if desired
    return () => clearInterval(interval);
  }, [cattlePositions.length, batches.length]);

  useEffect(() => {
    if (cattlePositions.length > 0 && currentCattleIndex < cattlePositions.length) {
      setDevicePosition(cattlePositions[currentCattleIndex].position);
    } else {
      // safe fallback if index is temporarily out of sync when batches array length switches
      setDevicePosition(0);
      setCurrentCattleIndex(0);
    }
  }, [currentCattleIndex, cattlePositions]);

  const getSignalColor = (rssi: number) => {
    if (rssi > -50) return "text-[#4c7766]";
    if (rssi > -65) return "text-[#d97706]";
    return "text-[#c25944]";
  };

  const getSignalBars = (rssi: number) => {
    if (rssi > -50) return 4;
    if (rssi > -60) return 3;
    if (rssi > -70) return 2;
    return 1;
  };

  const handleScanBluetooth = () => {
    setIsScanning(true);
    const toastId = toast.loading("Memindai iTag Bluetooth...", { style: { minHeight: '64px', fontSize: '16px' } });
    setTimeout(() => {
      setIsScanning(false);
      toast.dismiss(toastId);
      toast.success("Scan Selesai!", {
        description: "iTag terdeteksi. Silakan isi form pendaftaran.",
        style: { minHeight: '64px', fontSize: '16px' }
      });
    }, 2000);
  };

  const handleSaveCattle = () => {
    if (!newCattleName.trim() || !newCattleAgeYear || !newCattleAgeMonth || !newCattleAgeDay) {
      toast.error("Gagal Menyimpan", {
        description: "Semua kolom form Sapi (termasuk Hari) harus terisi dengan lengkap.",
        style: { minHeight: '56px' }
      });
      return;
    }

    if (cattleData.some(c => c.name.toLowerCase() === newCattleName.toLowerCase().trim())) {
      toast.error("Nama Sapi Duplikat", { description: "Nama tersebut sudah terpakai." }); return;
    }

    const yearParsed = parseInt(newCattleAgeYear) || 0;
    const monthParsed = parseInt(newCattleAgeMonth) || 0;
    const dayParsed = parseInt(newCattleAgeDay) || 0;

    if (yearParsed > 25) {
      toast.error("Validasi Umur Gagal", { description: "Tahun maksimal yang diizinkan adalah 25." }); return;
    }
    if (monthParsed > 12) {
      toast.error("Validasi Umur Gagal", { description: "Bulan tidak boleh lebih dari 12." }); return;
    }
    if (dayParsed > 30) {
      toast.error("Validasi Umur Gagal", { description: "Hari tidak boleh lebih dari 30." }); return;
    }

    // Push new cow to context
    const newCow: CattleData = {
      id: generatedId,
      name: newCattleName,
      breed: newCattleBreed,
      temp: "38.5",
      chewing: "60x/menit",
      battery: 100,
      status: "normal",
      health: 100,
      age: { year: yearParsed, month: monthParsed, day: dayParsed },
      gender: newCattleGender,
      methaneLevel: 110,
      lastUpdated: null,
      rumination: {
        status: "Kunyahan Normal & Aktif",
        frequency: "60x/mnt",
        duration: "3.5 detik",
        intensity: "Sedang",
        metanePotential: "Kategori Normal",
        feedType: "Rumput Segar",
        recommendation: "Pakan optimal, pertahankan racikan saat ini.",
        targetMethane: "100g → 90g/hari",
        feedBoost: "+5%",
        ruminalHealth: "Sangat Optimal"
      }
    };

    addCattle(newCow);

    toast.success("Sapi berhasil ditambahkan!", {
      description: `${generatedId} terdaftar di sistem pusat.`,
      style: { minHeight: '64px', fontSize: '16px' }
    });

    // Reset Form
    setNewCattleName("");
    setNewCattleAgeYear("");
    setNewCattleAgeMonth("");
    setNewCattleAgeDay("");
  };

  const handleAddRumiSync = () => {
    if (!newRumiSyncSerial.trim()) {
      toast.error("Serial Number / QR Code kosong", { style: { minHeight: '56px' } });
      return;
    }
    toast.success("Scanner RUMI-SYNC berhasil didaftarkan!", { style: { minHeight: '64px', fontSize: '16px' } });
    setNewRumiSyncSerial("");
  };

  const handleCalibrate = (logId: number) => {
    setCalibratingId(logId);
    setTimeout(() => {
      setLogs(prev => prev.map(l => l.id === logId ? { ...l, resolvable: false, event: `${l.event} (Terkalibrasi Kembali ⚡)` } : l));
      setCalibratingId(null);
      toast.success("Kalibrasi Berhasil, Jaringan Sinyal Pulih!");
    }, 1500);
  };

  return (
    <div className="p-3 sm:p-8 space-y-4 sm:space-y-8 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="text-center md:text-left flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4 mb-4 sm:mb-8">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#4c7766] rounded-xl flex items-center justify-center shadow-lg text-white shrink-0">
          <Settings className="w-5 h-5 sm:w-7 sm:h-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#2d3a33] mb-0.5 sm:mb-1">Kontrol Sistem</h1>
          <p className="text-xs sm:text-base text-[#6b7280]">Manajemen Hardware RUMI-SYNC & Sinkronisasi</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 sm:gap-4 bg-[#fcfbf9] rounded-xl sm:rounded-2xl shadow-sm border border-[#e2e8e4] p-1.5 sm:p-2 w-full md:w-fit mx-auto md:mx-0 justify-center">
        <button
          onClick={() => setActiveTab("live-monitor")}
          className={`flex-1 sm:flex-none px-4 py-3 sm:px-6 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all min-h-[48px] sm:min-h-[56px] text-xs sm:text-base ${activeTab === "live-monitor"
              ? "bg-[#4c7766] text-white shadow-md"
              : "text-[#6b7280] hover:bg-[#e2e8e4] hover:text-[#2d3a33]"
            }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Monitor Sistem</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("add-data")}
          className={`flex-1 sm:flex-none px-4 py-3 sm:px-6 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all min-h-[48px] sm:min-h-[56px] text-xs sm:text-base ${activeTab === "add-data"
              ? "bg-[#4c7766] text-white shadow-md"
              : "text-[#6b7280] hover:bg-[#e2e8e4] hover:text-[#2d3a33]"
            }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Tambah Data Sapi</span>
          </div>
        </button>
      </div>

      {/* TAB 1: Live Monitor */}
      {activeTab === "live-monitor" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 sm:space-y-8"
        >
          {/* Tracker Rel */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] p-4 sm:p-8"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-[#f4f5f2] rounded-xl sm:rounded-2xl flex items-center justify-center">
                  <Radio className="w-5 h-5 sm:w-7 sm:h-7 text-[#4c7766]" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-[#2d3a33]">Tracker Rel Aktif</h2>
                  <p className="text-[11px] sm:text-sm text-[#6b7280]">Posisi kamera dan scanner RUMI-SYNC berjalan</p>
                </div>
              </div>

              <div className="w-full sm:w-auto bg-[#f4f5f2] border-2 border-[#6b8e7b]/50 hover:border-[#4c7766] px-4 py-2 sm:px-5 sm:py-3 rounded-2xl shadow-sm relative group cursor-pointer transition-colors flex flex-col justify-center min-w-[220px]">
                <div className="text-[10px] sm:text-xs font-bold text-[#6b8e7b] mb-0.5">Fokus Analisis Area:</div>
                <select
                  value={currentBatchIndex}
                  onChange={(e) => {
                    setCurrentBatchIndex(parseInt(e.target.value));
                    setCurrentCattleIndex(0); // reset scanner position when jumping manually
                  }}
                  className="w-full bg-transparent font-semibold text-[#2d3a33] focus:outline-none cursor-pointer pr-8 text-sm sm:text-base appearance-none relative z-10"
                >
                  {batches.map((b, i) => (
                    <option key={i} value={i}>{b.label}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 transform -translate-y-[10%] pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-[#4c7766]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>

            <div className="bg-[#fcfbf9] border border-[#e2e8e4] rounded-xl sm:rounded-2xl p-4 sm:p-10">
              <div className="relative h-28 sm:h-48 my-4">
                <div className="absolute top-1/2 left-0 right-0 h-4 bg-[#e2e8e4] rounded-full transform -translate-y-1/2 shadow-inner">
                  <div className="absolute top-1 bottom-1 left-1 right-1 bg-[#f4f5f2] rounded-full"></div>
                </div>

                {cattlePositions.map((cattle, index) => (
                  <div
                    key={cattle.id}
                    className="absolute top-1/2 transform -translate-y-[120%] -translate-x-1/2"
                    style={{ left: `${cattle.position}%` }}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`text-2xl sm:text-4xl transition-transform ${currentCattleIndex === index ? 'scale-125 drop-shadow-md' : 'grayscale opacity-60'}`}>🐄</div>
                      <div className={`text-[8px] sm:text-xs mt-1 px-1.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap ${currentCattleIndex === index ? 'bg-[#4c7766] text-white' : 'bg-[#f4f5f2] text-[#6b7280] border border-[#e2e8e4]'}`}>
                        {cattle.id}
                      </div>
                    </div>
                  </div>
                ))}

                <motion.div
                  className="absolute top-1/2 transform translate-y-[20%] -translate-x-1/2 z-10"
                  animate={{ left: `${devicePosition}%` }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                >
                  <div className="flex flex-col items-center drop-shadow-lg">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-[#4c7766] border-2 sm:border-4 border-white rounded-lg sm:rounded-xl flex items-center justify-center text-white text-[10px] sm:text-xs rotate-45 relative overflow-hidden shadow-lg">
                      <div className="absolute -inset-2 bg-white/20 blur-sm rotate-45 translate-x-1 translate-y-1"></div>
                      <span className="-rotate-45 block">📡</span>
                    </div>
                    <div className="mt-1 sm:mt-2 px-2 py-0.5 sm:py-1 bg-[#2d3a33] text-white text-[9px] sm:text-[10px] font-bold rounded-md sm:rounded-lg shadow-md whitespace-nowrap">Scanner</div>
                  </div>
                </motion.div>
              </div>

              <div className="mt-6 sm:mt-8 text-center">
                <div className="inline-flex items-center gap-2 sm:gap-3 bg-[#e2e8e4] px-4 py-2 sm:py-3 rounded-full shadow-sm max-w-full overflow-hidden">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#4c7766] rounded-full animate-pulse shadow-[0_0_8px_rgba(76,119,102,0.8)] shrink-0"></div>
                  <span className="text-xs sm:text-sm font-semibold text-[#2d3a33] truncate">
                    Menganalisis: <span className="font-bold text-[#4c7766] bg-white px-2 py-0.5 rounded-md ml-1">{cattlePositions[currentCattleIndex]?.id || "..."}</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
            {/* RSSI Debugger */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col"
            >
              <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><Signal className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Sinyal (RSSI)</h3>
                    <p className="text-[11px] sm:text-sm text-[#6b7280]">Ping transmitor iTag</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto flex-1 pb-4">
                <table className="w-full text-xs sm:text-base">
                  <thead className="bg-[#f4f5f2] border-b border-[#e2e8e4]">
                    <tr>
                      <th className="px-5 py-3 sm:py-4 text-center text-[10px] sm:text-xs font-bold text-[#6b8e7b] uppercase">ID Sapi</th>
                      <th className="px-5 py-3 sm:py-4 text-center text-[10px] sm:text-xs font-bold text-[#6b8e7b] uppercase">Sinyal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f4f5f2]">
                    {iTagData.map((tag, index) => (
                      <motion.tr key={tag.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="hover:bg-[#fcfbf9]">
                        <td className="px-5 py-3 sm:py-4 font-bold text-[#2d3a33] text-center">{tag.id}</td>
                        <td className="px-5 py-3 sm:py-4">
                          <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <span className={`text-xs sm:text-sm font-bold w-6 sm:w-8 text-right ${getSignalColor(tag.rssi)}`}>{tag.rssi}</span>
                            <div className="flex items-end gap-[2px] sm:gap-1 h-3 sm:h-4">
                              {[1, 2, 3, 4].map((bar) => (
                                <div key={bar} className={`w-1 sm:w-1.5 rounded-sm ${bar <= getSignalBars(tag.rssi) ? getSignalColor(tag.rssi).replace('text-', 'bg-') : 'bg-[#e2e8e4]'}`} style={{ height: `${bar * 3.5}px` }}></div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Activity Logs with Resolvers */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col"
            >
              <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Log Sistem (Live)</h3>
                    <p className="text-[11px] sm:text-sm text-[#6b7280]">Insiden & Sinkronisasi</p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 flex-1 bg-white">
                <div className="space-y-3 sm:space-y-4 max-h-[300px] sm:max-h-[380px] overflow-y-auto pr-2">
                  {logs.map((log, index) => (
                    <div key={log.id} className={`flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-colors ${log.type === 'error' && log.resolvable ? 'bg-[#fff5f5] border-[#fca5a5]/30' : 'bg-[#fdfbf7] border-transparent hover:border-[#e2e8e4]'}`}>
                      <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center bg-white shadow-sm border border-[#e2e8e4]">
                        {log.type === "scan" && <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-[#4c7766]" />}
                        {log.type === "error" && <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-[#c25944]" />}
                        {log.type === "connection" && <Bluetooth className="w-4 h-4 sm:w-5 sm:h-5 text-[#6b8e7b]" />}
                        {log.type === "sync" && <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-[#d97706]" />}
                        {log.type === "calibration" && <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-[#4c7766]" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-[13px] sm:text-sm font-bold text-[#2d3a33] leading-tight">{log.event}</div>
                        <div className="text-[10px] sm:text-xs font-semibold text-[#6b8e7b] mt-1">{log.date}</div>
                        {log.type === "error" && log.resolvable && (
                          <button
                            onClick={() => handleCalibrate(log.id)}
                            disabled={calibratingId === log.id}
                            className="mt-2.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-[#c25944] text-white text-[10px] sm:text-xs font-bold rounded-lg sm:rounded-xl shadow-sm hover:bg-[#a64835] transition-colors flex items-center gap-1.5"
                          >
                            {calibratingId === log.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                            Kalibrasi Ulang
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* TAB 2: Tambah Data - Fat Finger Form */}
      {activeTab === "add-data" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8"
        >
          {/* Card 1: Daftar Sapi Baru */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden">
            <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><Plus className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Pendaftaran Sapi</h3>
                  <p className="text-[11px] sm:text-sm text-[#6b7280]">Sambungkan iTag ke entitas sapi</p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-8 space-y-4 sm:space-y-5">
              <button
                onClick={handleScanBluetooth}
                disabled={isScanning}
                className="w-full bg-[#f4f5f2] text-[#4c7766] py-3.5 px-6 rounded-xl sm:rounded-2xl hover:bg-[#e2e8e4] transition-all font-bold min-h-[48px] sm:min-h-[56px] flex items-center justify-center gap-2 sm:gap-3 border border-[#c1d1c8]"
              >
                {isScanning ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#4c7766] border-t-transparent"></div> : <Bluetooth className="w-4 h-4 sm:w-5 sm:h-5 text-[#4c7766]" />}
                <span className="text-sm sm:text-base">{isScanning ? "Mencari iTag di sekitar..." : "Pindai iTag Bluetooth"}</span>
              </button>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">ID Register (Otomatis)</label>
                  <input
                    type="text"
                    value={generatedId}
                    disabled
                    className="w-full px-3 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#e2e8e4] text-[#818a7a] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl cursor-not-allowed font-bold text-sm sm:text-lg"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">Nama Relatif</label>
                  <input
                    type="text"
                    value={newCattleName}
                    onChange={(e) => setNewCattleName(e.target.value)}
                    placeholder="Sapi Lokal - 025"
                    className="w-full px-3 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-sm sm:text-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">Ras Sapi (Breed)</label>
                <select
                  value={newCattleBreed}
                  onChange={(e) => setNewCattleBreed(e.target.value)}
                  className="w-full px-3 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-sm sm:text-lg appearance-none"
                >
                  {cattleBreedsList.map(breed => <option key={breed} value={breed}>{breed}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">Jenis Kelamin</label>
                <select
                  value={newCattleGender}
                  onChange={(e) => setNewCattleGender(e.target.value as "Jantan" | "Betina")}
                  className="w-full px-3 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-sm sm:text-lg appearance-none"
                >
                  <option value="Betina">Betina</option>
                  <option value="Jantan">Jantan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">Usia Akumulatif</label>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <input
                    type="number"
                    value={newCattleAgeYear}
                    onChange={(e) => setNewCattleAgeYear(e.target.value)}
                    placeholder="Tahun"
                    className="w-full px-2 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-[13px] sm:text-lg text-center"
                  />
                  <input
                    type="number"
                    value={newCattleAgeMonth}
                    onChange={(e) => setNewCattleAgeMonth(e.target.value)}
                    placeholder="Bulan"
                    className="w-full px-2 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-[13px] sm:text-lg text-center"
                  />
                  <input
                    type="number"
                    value={newCattleAgeDay}
                    onChange={(e) => setNewCattleAgeDay(e.target.value)}
                    placeholder="Hari"
                    className="w-full px-2 py-3 sm:px-4 sm:py-3.5 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-[13px] sm:text-lg text-center"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveCattle}
                  className="w-full bg-[#4c7766] text-white py-3.5 sm:py-4 px-6 rounded-xl sm:rounded-2xl hover:bg-[#3f6355] transition-all font-bold min-h-[56px] sm:min-h-[64px] flex items-center justify-center gap-2 sm:gap-3 shadow-md text-sm sm:text-lg"
                >
                  💾 Tambahkan ke Database Pusat
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Mesin Scanner Baru */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col justify-start pb-4 sm:pb-6">
            <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><QrCode className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Mesin Scanner Baru</h3>
                  <p className="text-[11px] sm:text-sm text-[#6b7280]">Registrasi radar sensor pakan</p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
              <div>
                <label className="block text-xs sm:text-sm font-bold text-[#2d3a33] mb-1.5 sm:mb-2">QR Code Serial Number Box</label>
                <div className="flex flex-col gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={newRumiSyncSerial}
                    onChange={(e) => setNewRumiSyncSerial(e.target.value)}
                    placeholder="Ketik SN manual..."
                    className="w-full px-3 py-3 sm:px-4 sm:py-4 min-h-[48px] sm:min-h-[56px] bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#6b8e7b]/30 focus:border-[#4c7766] transition-all font-bold text-sm sm:text-lg"
                  />
                  <button className="bg-[#2d3a33] text-white w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:bg-[#1a231f] transition-all shadow-sm font-bold flex items-center justify-center gap-2 text-sm sm:text-base">
                    <QrCode className="w-4 h-4 sm:w-5 sm:h-5" /> Pindai Kode Melalui Kamera
                  </button>
                </div>
              </div>
            </div>
          </div>

        </motion.div>
      )}
    </div>
  );
}