import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Signal, RefreshCw, Radio, Bluetooth, Plus, QrCode, Settings, AlertTriangle, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useCattle } from "../context/CattleContext";
import type { CattleData, RelConfig } from "../context/CattleContext";

const cattleBreedsList = ["Brahman Cross", "Simental", "Limosin", "Ongole", "Bali", "Madura", "Holstein"];

export function SystemControl() {
  const [activeTab, setActiveTab] = useState("live-monitor");
  const [devicePosition, setDevicePosition] = useState(0);
  const [currentCattleIndex, setCurrentCattleIndex] = useState(0);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);

  const { addCattle, cattleData, notifications, relConfigs, updateRelConfig, addRelConfig, deleteRelConfig } = useCattle();

  // Batches calculation based on relConfigs
  const batches = useMemo(() => {
    const sortedData = [...cattleData].sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    const configs = relConfigs.length > 0 ? relConfigs : [{ rel_number: 1, cattle_count: 10, label: 'Rel 1', id: 1 }];
    const res: { label: string; startIndex: number; endIndex: number; slice: CattleData[] }[] = [];
    
    let offset = 0;
    for (const cfg of configs) {
      const slice = sortedData.slice(offset, offset + cfg.cattle_count);
      if (slice.length > 0) {
        res.push({ 
          label: `Rel ${cfg.rel_number} — ${slice[0].id} s/d ${slice[slice.length - 1].id}`, 
          startIndex: offset, 
          endIndex: offset + slice.length - 1, 
          slice 
        });
      }
      offset += cfg.cattle_count;
    }
    
    if (offset < sortedData.length) {
      const remaining = sortedData.slice(offset);
      res.push({ 
        label: `Rel Extra — ${remaining[0].id} s/d ${remaining[remaining.length - 1].id}`, 
        startIndex: offset, 
        endIndex: offset + remaining.length - 1, 
        slice: remaining 
      });
    }
    return res;
  }, [cattleData, relConfigs]);

  const generatedId = useMemo(() => {
    if (!cattleData || cattleData.length === 0) return 'ID-001';
    const maxNum = cattleData.reduce((max, c) => {
      const match = c.id.match(/\d+/);
      const num = match ? parseInt(match[0]) : 0;
      return num > max ? num : max;
    }, 0);
    return `ID-${String(maxNum + 1).padStart(3, '0')}`;
  }, [cattleData]);

  useEffect(() => {
    if (currentBatchIndex >= batches.length && batches.length > 0) {
      setCurrentBatchIndex(batches.length - 1);
    }
  }, [batches.length, currentBatchIndex]);

  const cattlePositions = useMemo(() => {
    if (batches.length === 0) return [];
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

  // Rel config form state
  const [editingRel, setEditingRel] = useState<number | null>(null);
  const [editRelCount, setEditRelCount] = useState<number>(10);
  const [newRelCount, setNewRelCount] = useState<number>(10);
  const [showAddRel, setShowAddRel] = useState(false);
  const [newMacAddress, setNewMacAddress] = useState("");
  
  useEffect(() => {
    if (cattlePositions.length === 0) return;
    const interval = setInterval(() => {
      setCurrentCattleIndex((prev) => {
        let next = prev + 1;
        if (next >= cattlePositions.length) {
          next = 0;
          setCurrentBatchIndex(prevBatch => (prevBatch + 1) % batches.length);
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [cattlePositions.length, batches.length]);

  useEffect(() => {
    if (cattlePositions.length > 0 && currentCattleIndex < cattlePositions.length) {
      setDevicePosition(cattlePositions[currentCattleIndex].position);
    } else {
      setDevicePosition(0);
      setCurrentCattleIndex(0);
    }
  }, [currentCattleIndex, cattlePositions]);

  const getSignalColor = (rssi: number | null) => {
    if (rssi === null) return "text-[#6b7280]";
    if (rssi > -50) return "text-[#4c7766]";
    if (rssi > -65) return "text-[#d97706]";
    return "text-[#c25944]";
  };

  const getSignalBars = (rssi: number | null) => {
    if (rssi === null) return 0;
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
      setNewMacAddress("A1:B2:C3:D4:E5:F6");
      toast.success("Scan Selesai!", {
        description: "iTag terdeteksi. MAC Address otomatis terisi.",
        style: { minHeight: '64px', fontSize: '16px' }
      });
    }, 2000);
  };

  const handleSaveCattle = () => {
    if (!newCattleName.trim() || !newCattleAgeYear || !newCattleAgeMonth || !newCattleAgeDay) {
      toast.error("Gagal Menyimpan", { description: "Semua kolom form Sapi (termasuk Hari) harus terisi lengkap." });
      return;
    }

    if (cattleData.some(c => c.name.toLowerCase() === newCattleName.toLowerCase().trim())) {
      toast.error("Nama Sapi Duplikat", { description: "Nama tersebut sudah terpakai." }); return;
    }

    const yearParsed = parseInt(newCattleAgeYear) || 0;
    const monthParsed = parseInt(newCattleAgeMonth) || 0;
    const dayParsed = parseInt(newCattleAgeDay) || 0;

    const newCow: CattleData = {
      id: generatedId,
      name: newCattleName,
      breed: newCattleBreed,
      temp: "0.0",
      chewing: "0x/menit",
      rssi: null,
      status: "normal",
      health: 100,
      age: { year: yearParsed, month: monthParsed, day: dayParsed },
      gender: newCattleGender,
      lastUpdated: null,
    };

    addCattle(newCow);

    toast.success("Sapi berhasil ditambahkan!", { description: `${generatedId} terdaftar di sistem pusat.` });

    setNewCattleName("");
    setNewCattleAgeYear("");
    setNewCattleAgeMonth("");
    setNewCattleAgeDay("");
    setNewMacAddress("");
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
        <button onClick={() => setActiveTab("live-monitor")} className={`flex-1 sm:flex-none px-4 py-3 sm:px-6 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all min-h-[48px] sm:min-h-[56px] text-xs sm:text-base ${activeTab === "live-monitor" ? "bg-[#4c7766] text-white shadow-md" : "text-[#6b7280] hover:bg-[#e2e8e4] hover:text-[#2d3a33]"}`}>
          <div className="flex items-center justify-center gap-2"><Radio className="w-4 h-4 sm:w-5 sm:h-5" /><span>Monitor Sistem</span></div>
        </button>
        <button onClick={() => setActiveTab("add-data")} className={`flex-1 sm:flex-none px-4 py-3 sm:px-6 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all min-h-[48px] sm:min-h-[56px] text-xs sm:text-base ${activeTab === "add-data" ? "bg-[#4c7766] text-white shadow-md" : "text-[#6b7280] hover:bg-[#e2e8e4] hover:text-[#2d3a33]"}`}>
          <div className="flex items-center justify-center gap-2"><Plus className="w-4 h-4 sm:w-5 sm:h-5" /><span>Tambah Data Sapi</span></div>
        </button>
      </div>

      {/* TAB 1: Live Monitor */}
      {activeTab === "live-monitor" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-8">
          
          {/* Tracker Rel */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-[#f4f5f2] rounded-xl sm:rounded-2xl flex items-center justify-center"><Radio className="w-5 h-5 sm:w-7 sm:h-7 text-[#4c7766]" /></div>
                <div><h2 className="text-lg sm:text-2xl font-bold text-[#2d3a33]">Tracker Rel Aktif</h2><p className="text-[11px] sm:text-sm text-[#6b7280]">Posisi kamera dan scanner berjalan</p></div>
              </div>
              <div className="w-full sm:w-auto bg-[#f4f5f2] border-2 border-[#6b8e7b]/50 hover:border-[#4c7766] px-4 py-2 sm:px-5 sm:py-3 rounded-2xl shadow-sm relative group cursor-pointer flex flex-col justify-center min-w-[220px]">
                <div className="text-[10px] sm:text-xs font-bold text-[#6b8e7b] mb-0.5">Fokus Analisis Area:</div>
                <select value={currentBatchIndex} onChange={(e) => { setCurrentBatchIndex(parseInt(e.target.value)); setCurrentCattleIndex(0); }} className="w-full bg-transparent font-semibold text-[#2d3a33] focus:outline-none cursor-pointer pr-8 text-sm sm:text-base appearance-none relative z-10">
                  {batches.map((b, i) => <option key={i} value={i}>{b.label}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 transform -translate-y-[10%] pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity"><svg className="w-5 h-5 text-[#4c7766]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg></div>
              </div>
            </div>

            <div className="bg-[#fcfbf9] border border-[#e2e8e4] rounded-xl sm:rounded-2xl p-4 sm:p-10">
              <div className="relative h-28 sm:h-48 my-4">
                <div className="absolute top-1/2 left-0 right-0 h-4 bg-[#e2e8e4] rounded-full transform -translate-y-1/2 shadow-inner"><div className="absolute top-1 bottom-1 left-1 right-1 bg-[#f4f5f2] rounded-full"></div></div>
                {cattlePositions.map((cattle, index) => (
                  <div key={cattle.id} className="absolute top-1/2 transform -translate-y-[120%] -translate-x-1/2" style={{ left: `${cattle.position}%` }}>
                    <div className="flex flex-col items-center">
                      <div className={`text-2xl sm:text-4xl transition-transform ${currentCattleIndex === index ? 'scale-125 drop-shadow-md' : 'grayscale opacity-60'}`}>🐄</div>
                      <div className={`text-[8px] sm:text-xs mt-1 px-1.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap ${currentCattleIndex === index ? 'bg-[#4c7766] text-white' : 'bg-[#f4f5f2] text-[#6b7280] border border-[#e2e8e4]'}`}>{cattle.id}</div>
                    </div>
                  </div>
                ))}
                <motion.div className="absolute top-1/2 transform translate-y-[20%] -translate-x-1/2 z-10" animate={{ left: `${devicePosition}%` }} transition={{ duration: 2, ease: "easeInOut" }}>
                  <div className="flex flex-col items-center drop-shadow-lg">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-[#4c7766] border-2 sm:border-4 border-white rounded-lg sm:rounded-xl flex items-center justify-center text-white text-[10px] sm:text-xs rotate-45 relative overflow-hidden shadow-lg"><span className="-rotate-45 block">📡</span></div>
                    <div className="mt-1 sm:mt-2 px-2 py-0.5 sm:py-1 bg-[#2d3a33] text-white text-[9px] sm:text-[10px] font-bold rounded-md sm:rounded-lg shadow-md whitespace-nowrap">Scanner</div>
                  </div>
                </motion.div>
              </div>
              <div className="mt-6 sm:mt-8 text-center">
                <div className="inline-flex items-center gap-2 sm:gap-3 bg-[#e2e8e4] px-4 py-2 sm:py-3 rounded-full shadow-sm">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-[#4c7766] rounded-full animate-pulse shadow-[0_0_8px_rgba(76,119,102,0.8)] shrink-0"></div>
                  <span className="text-xs sm:text-sm font-semibold text-[#2d3a33]">Menganalisis: <span className="font-bold text-[#4c7766] bg-white px-2 py-0.5 rounded-md ml-1">{cattlePositions[currentCattleIndex]?.id || "..."}</span></span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Konfigurasi Rel & RSSI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
            {/* Konfigurasi Rel */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col">
              <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><Settings className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div><h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Konfigurasi Rel</h3><p className="text-[11px] sm:text-sm text-[#6b7280]">Atur kapasitas sapi per rel</p></div>
                </div>
              </div>
              <div className="p-4 sm:p-6 flex-1 bg-white space-y-4">
                {relConfigs.map(rel => (
                  <div key={rel.id} className="flex items-center justify-between p-4 bg-[#fcfbf9] border border-[#e2e8e4] rounded-xl">
                    <div className="font-bold text-sm text-[#2d3a33]">Rel {rel.rel_number}</div>
                    {editingRel === rel.rel_number ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} max={50} value={editRelCount} onChange={e => setEditRelCount(Number(e.target.value))} className="w-16 px-2 py-1 text-center font-bold border-2 border-[#6b8e7b] rounded-lg" />
                        <button onClick={() => { updateRelConfig(rel.rel_number, editRelCount); setEditingRel(null); }} className="p-1 bg-[#4c7766] text-white rounded-lg"><CheckCircle2 className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#4c7766] bg-[#e2e8e4] px-3 py-1 rounded-lg">{rel.cattle_count} Sapi</span>
                        <button onClick={() => { setEditingRel(rel.rel_number); setEditRelCount(rel.cattle_count); }} className="text-[#6b7280] hover:text-[#4c7766] text-sm font-bold underline">Ubah</button>
                        <button onClick={() => deleteRelConfig(rel.rel_number)} className="text-[#c25944] hover:text-red-700 text-sm font-bold underline ml-1">Hapus</button>
                      </div>
                    )}
                  </div>
                ))}
                
                {showAddRel ? (
                  <div className="flex items-center justify-between p-4 bg-[#e2f0ea] border border-[#6b8e7b] rounded-xl">
                    <div className="font-bold text-sm text-[#2d3a33]">Rel Baru</div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={50} value={newRelCount} onChange={e => setNewRelCount(Number(e.target.value))} className="w-16 px-2 py-1 text-center font-bold border-2 border-[#6b8e7b] rounded-lg" />
                      <button onClick={() => { addRelConfig(newRelCount); setShowAddRel(false); }} className="px-3 py-1 bg-[#4c7766] text-white font-bold rounded-lg text-sm">Simpan</button>
                      <button onClick={() => setShowAddRel(false)} className="px-3 py-1 bg-[#e2e8e4] text-[#2d3a33] font-bold rounded-lg text-sm">Batal</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddRel(true)} className="w-full py-3 border-2 border-dashed border-[#c1d1c8] text-[#4c7766] font-bold rounded-xl hover:bg-[#f4f5f2] transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Tambah Rel
                  </button>
                )}
              </div>
            </motion.div>

            {/* RSSI Debugger (Real) */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col">
              <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2.5 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><Signal className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                  <div><h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Sinyal (RSSI)</h3><p className="text-[11px] sm:text-sm text-[#6b7280]">Real-time dari iTag BLE</p></div>
                </div>
              </div>
              <div className="overflow-x-auto flex-1 p-2">
                <table className="w-full text-xs sm:text-base">
                  <thead className="bg-[#f4f5f2] border-b border-[#e2e8e4]">
                    <tr>
                      <th className="px-5 py-3 text-center font-bold text-[#6b8e7b] uppercase">ID Sapi</th>
                      <th className="px-5 py-3 text-center font-bold text-[#6b8e7b] uppercase">Sinyal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f4f5f2]">
                    {cattleData.map((c) => (
                      <tr key={c.id} className="hover:bg-[#fcfbf9]">
                        <td className="px-5 py-3 font-bold text-[#2d3a33] text-center">{c.id}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-xs sm:text-sm font-bold w-10 text-right ${getSignalColor(c.rssi)}`}>{c.rssi ?? 'N/A'}</span>
                            <div className="flex items-end gap-1 h-4">
                              {[1, 2, 3, 4].map((bar) => (
                                <div key={bar} className={`w-1.5 rounded-sm ${bar <= getSignalBars(c.rssi) ? getSignalColor(c.rssi).replace('text-', 'bg-') : 'bg-[#e2e8e4]'}`} style={{ height: `${bar * 3.5}px` }}></div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>

          {/* Activity Logs - Real Notifications */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden flex flex-col">
            <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2.5 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div><h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Log Sistem (Live)</h3><p className="text-[11px] sm:text-sm text-[#6b7280]">Notifikasi sistem dan anomali</p></div>
              </div>
            </div>
            <div className="p-4 sm:p-6 flex-1 bg-white">
              <div className="space-y-3 sm:space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {notifications.length > 0 ? notifications.map((notif) => (
                  <div key={notif.id} className="flex items-start gap-3 p-4 rounded-xl bg-[#fdfbf7] border border-[#e2e8e4]">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-white shadow-sm border border-[#e2e8e4]">
                      {notif.type === "warning" ? <AlertTriangle className="w-4 h-4 text-[#c25944]" /> : <CheckCircle2 className="w-4 h-4 text-[#4c7766]" />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#2d3a33]">{notif.message}</div>
                      <div className="text-xs font-semibold text-[#6b8e7b] mt-1">{notif.time}</div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-6 text-[#6b7280] font-medium">Belum ada log aktivitas.</div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* TAB 2: Tambah Data */}
      {activeTab === "add-data" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#e2e8e4] overflow-hidden">
            <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-[#e2e8e4] rounded-xl text-[#4c7766]"><Plus className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                <div><h3 className="text-lg sm:text-xl font-bold text-[#2d3a33]">Pendaftaran Sapi</h3><p className="text-[11px] sm:text-sm text-[#6b7280]">Sambungkan iTag ke entitas sapi</p></div>
              </div>
            </div>
            <div className="p-4 sm:p-8 space-y-4">
              <button onClick={handleScanBluetooth} disabled={isScanning} className="w-full bg-[#f4f5f2] text-[#4c7766] py-3.5 rounded-xl hover:bg-[#e2e8e4] transition-all font-bold flex items-center justify-center gap-2 border border-[#c1d1c8]">
                {isScanning ? <div className="animate-spin h-4 w-4 border-2 border-[#4c7766] border-t-transparent rounded-full"></div> : <Bluetooth className="w-5 h-5" />}
                <span>{isScanning ? "Mencari iTag..." : "Pindai iTag Bluetooth"}</span>
              </button>
              
              <div className="flex items-center gap-2 py-1">
                <div className="h-px bg-[#e2e8e4] flex-1"></div>
                <span className="text-xs text-[#6b7280] font-bold">ATAU</span>
                <div className="h-px bg-[#e2e8e4] flex-1"></div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#2d3a33] mb-2">MAC Address iTag (Manual)</label>
                <input type="text" value={newMacAddress} onChange={(e) => setNewMacAddress(e.target.value)} placeholder="00:1B:44:11:3A:B7" className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-bold text-[#2d3a33] mb-2">ID Register</label><input type="text" value={generatedId} disabled className="w-full px-4 py-3 bg-[#e2e8e4] border-2 border-[#e2e8e4] rounded-xl cursor-not-allowed font-bold" /></div>
                <div><label className="block text-sm font-bold text-[#2d3a33] mb-2">Nama Relatif</label><input type="text" value={newCattleName} onChange={(e) => setNewCattleName(e.target.value)} placeholder="Sapi Lokal - 025" className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] font-bold" /></div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2d3a33] mb-2">Ras Sapi</label>
                <select value={newCattleBreed} onChange={(e) => setNewCattleBreed(e.target.value)} className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] font-bold appearance-none">
                  {cattleBreedsList.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2d3a33] mb-2">Jenis Kelamin</label>
                <select value={newCattleGender} onChange={(e) => setNewCattleGender(e.target.value as "Jantan"|"Betina")} className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] font-bold appearance-none">
                  <option value="Betina">Betina</option><option value="Jantan">Jantan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#2d3a33] mb-2">Usia Akumulatif</label>
                <div className="grid grid-cols-3 gap-4">
                  <input type="number" value={newCattleAgeYear} onChange={(e) => setNewCattleAgeYear(e.target.value)} placeholder="Thn" className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] text-center font-bold" />
                  <input type="number" value={newCattleAgeMonth} onChange={(e) => setNewCattleAgeMonth(e.target.value)} placeholder="Bln" className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] text-center font-bold" />
                  <input type="number" value={newCattleAgeDay} onChange={(e) => setNewCattleAgeDay(e.target.value)} placeholder="Hr" className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl focus:border-[#4c7766] text-center font-bold" />
                </div>
              </div>
              <div className="pt-4">
                <button onClick={handleSaveCattle} className="w-full bg-[#4c7766] text-white py-4 rounded-xl hover:bg-[#3f6355] transition-all font-bold flex items-center justify-center gap-2 shadow-md">
                  <Save className="w-5 h-5" /> Tambahkan ke Database
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}