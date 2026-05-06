import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useCattle } from "../context/CattleContext";
import { Home, ChevronLeft, ChevronRight, Edit2, Trash2, X, Save, AlertTriangle, Loader2, Wifi } from "lucide-react";
import { toast } from "sonner";
import sapiAmanImg from '../../assets/sapi_aman.png';
import sapiPantauanImg from '../../assets/sapi_pantauan.png';
import sapiSakitImg from '../../assets/sapi_sakit.png';
import type { CattleData } from "../context/CattleContext";

export function Dashboard() {
  const { cattleData, setSelectedCattleId, updateCattle, deleteCattle, isLoading, connectionStatus } = useCattle();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // CRUD Modals state
  const [cattleToDelete, setCattleToDelete] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CattleData | null>(null);

  const activities = cattleData.map(cattle => ({
    time: "Baru saja", 
    id: cattle.id,
    temp: cattle.temp,
    chewing: cattle.chewing,
    status: cattle.status,
    health: cattle.health,
    age: cattle.age,
    gender: cattle.gender,
    name: cattle.name,
    breed: cattle.breed
  }));

  const safeCount = activities.filter(a => a.status === 'normal' && parseFloat(a.temp) <= 39.0).length;
  const dangerCount = activities.filter(a => parseFloat(a.temp) >= 39.5 || a.health < 80).length;
  const warningCount = activities.length - safeCount - dangerCount;

  const handleCardClick = (statusFilter: string) => {
    setFilter(statusFilter);
    setCurrentPage(1);
    document.getElementById('inventory-table')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFilterChange = (f: string) => {
    setFilter(f);
    setCurrentPage(1);
  };

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    // Prevent routing if clicking on action buttons
    if ((e.target as HTMLElement).closest('button.action-btn')) return;
    setSelectedCattleId(id);
    navigate("/medical");
  };

  const confirmDelete = () => {
    if (cattleToDelete) {
      deleteCattle(cattleToDelete);
      toast.success("Data berhasil dihapus");
      setCattleToDelete(null);
    }
  };

  const saveEdit = () => {
    if (editForm) {
      // Validate Duplicate Name
      const isDuplicateName = cattleData.some(c => c.id !== editForm.id && c.name.toLowerCase().trim() === editForm.name.toLowerCase().trim());
      if (isDuplicateName) {
        toast.error("Nama sapi duplikat", { description: "Nama tersebut sudah dipakai sapi lain." });
        return;
      }
      
      updateCattle(editForm.id, editForm);
      toast.success("Data sapi berhasil diperbarui");
      setEditForm(null);
    }
  };

  const filteredActivities = activities.filter(a => {
    if (filter === "safe") return a.status === 'normal' && parseFloat(a.temp) <= 39.0;
    if (filter === "danger") return parseFloat(a.temp) >= 39.5 || a.health < 80;
    if (filter === "warning") return !(a.status === 'normal' && parseFloat(a.temp) <= 39.0) && !(parseFloat(a.temp) >= 39.5 || a.health < 80);
    return true;
  });

  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);
  const currentActivities = filteredActivities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const StatusCard = ({ 
    title, count, desc, imageSrc, bgColors, textColors, onClick 
  }: { 
    title: string, count: number, desc: string, imageSrc: string, bgColors: string, textColors: string, onClick: () => void 
  }) => (
    <motion.button
      onClick={onClick}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`text-center w-full rounded-2xl md:rounded-3xl p-3 sm:p-8 shadow-sm border border-[#e2e8e4] relative overflow-hidden group transition-all flex flex-col items-center justify-between ${bgColors}`}
    >
      <div className="absolute -right-6 -bottom-6 w-32 h-32 opacity-20 pointer-events-none rounded-full blur-2xl bg-white/60 group-hover:scale-150 transition-transform duration-700"></div>
      
      <div className="w-14 h-14 sm:w-28 sm:h-28 rounded-xl sm:rounded-2xl bg-white/60 backdrop-blur-sm border border-white/40 shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 mb-2 sm:mb-5 relative z-10">
        <img src={imageSrc} alt={title} className="w-full h-full object-cover mix-blend-multiply" />
      </div>
      
      <div className={`text-4xl sm:text-7xl font-black ${textColors} drop-shadow-sm mb-1 sm:mb-3 relative z-10 leading-none`}>
        {count}
      </div>
      
      <div className="relative z-10">
        <div className={`text-xs sm:text-2xl font-bold text-[#2d3a33] mb-0.5 sm:mb-1 group-hover:underline decoration-2 underline-offset-4 whitespace-nowrap`}>
          {title}
        </div>
        <div className="hidden sm:block text-sm sm:text-base text-[#2d3a33]/70 font-medium">
          {desc}
        </div>
      </div>
    </motion.button>
  );

  return (
    <div className="p-3 sm:p-8 space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Title Centered on Mobile, Left on Desktop */}
      <div className="text-center md:text-left flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4 mb-4 sm:mb-6">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#4c7766] rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg text-white">
          <Home className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#2d3a33] mb-0.5 sm:mb-1">Beranda RUMI-SYNC</h1>
          <div className="flex items-center gap-2">
            <p className="text-xs sm:text-base text-[#6b7280]">Status Kesehatan dan Pemantauan Real-Time</p>
            {connectionStatus === 'connected' && (
              <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-[#4c7766] bg-[#e8f5ee] px-2 py-0.5 rounded-full border border-[#6b8e7b]/20">
                <Wifi className="w-3 h-3" /> Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-12 h-12 text-[#4c7766] animate-spin" />
          <p className="text-[#6b7280] font-medium">Memuat data sapi dari Supabase...</p>
        </div>
      ) : cattleData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-3xl border border-[#e2e8e4]">
          <div className="text-6xl">🐄</div>
          <h3 className="text-xl font-bold text-[#2d3a33]">Belum Ada Data Sapi</h3>
          <p className="text-[#6b7280] text-sm text-center max-w-sm">
            Tabel <code className="bg-[#f4f5f2] px-1.5 py-0.5 rounded font-mono text-xs">cattle_inventory</code> di Supabase masih kosong.
            Data akan muncul otomatis ketika hardware mengirim data melalui MQTT.
          </p>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-3 gap-2 sm:gap-8">
        <StatusCard 
          title="Aman" 
          count={safeCount} 
          desc="Kondisi sehat & stabil" 
          imageSrc={sapiAmanImg} 
          bgColors="bg-gradient-to-br from-[#f4f5f2] to-[#e2e8e4] hover:border-[#6b8e7b]" 
          textColors="text-[#4c7766]"
          onClick={() => handleCardClick("safe")}
        />

        <StatusCard 
          title="Pantauan" 
          count={warningCount} 
          desc="Ruminasi terganggu" 
          imageSrc={sapiPantauanImg} 
          bgColors="bg-gradient-to-br from-[#fef3c7] to-[#fde68a] hover:border-amber-400" 
          textColors="text-[#d97706]"
          onClick={() => handleCardClick("warning")}
        />

        <StatusCard 
          title="Sakit" 
          count={dangerCount} 
          desc="Tanda klinis atau demam" 
          imageSrc={sapiSakitImg} 
          bgColors="bg-gradient-to-br from-[#fee2e2] to-[#fecaca] hover:border-[#fca5a5]" 
          textColors="text-[#c25944]"
          onClick={() => handleCardClick("danger")}
        />
      </div>

      <div id="inventory-table" className="bg-white border border-[#e2e8e4] rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden mt-6 sm:mt-8">
        <div className="bg-[#fcfbf9] border-b border-[#e2e8e4] px-4 sm:px-8 py-4 sm:py-6 flex flex-col xl:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h2 className="text-lg sm:text-2xl font-bold text-[#2d3a33]">Manajemen Inventaris Sapi</h2>
            <p className="text-xs sm:text-sm text-[#6b7280] mt-0.5 sm:mt-1">Daftar lengkap sensor headstall aktif</p>
          </div>
          
          <div className="flex gap-1.5 sm:gap-2 bg-[#f4f5f2] p-1.5 rounded-xl sm:rounded-2xl border border-[#e2e8e4] w-full xl:w-auto overflow-x-auto scroolbar-hide">
            {[ 
              { id: 'all', label: 'Semua' },
              { id: 'safe', label: 'Aman' },
              { id: 'warning', label: 'Pantauan' },
              { id: 'danger', label: 'Sakit' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={`flex-1 md:flex-none px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${filter === f.id ? 'bg-white text-[#4c7766] shadow-sm' : 'text-[#6b7280] hover:bg-[#e2e8e4]'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto pb-2 sm:pb-4">
          <table className="w-full text-[13px] sm:text-base min-w-[850px]">
            <thead className="bg-[#fcfbf9] sticky top-0 z-10 border-b border-[#e2e8e4]">
              <tr>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Aksi</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">ID Sapi</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Nama Sapi</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Umur</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Kelamin</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Ras</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Suhu</th>
                <th className="px-4 sm:px-8 py-4 text-left text-[11px] sm:text-xs font-bold text-[#6b8e7b] uppercase tracking-wider">Status Klinis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4f5f2]">
              {currentActivities.length > 0 ? currentActivities.map((activity, index) => (
                <motion.tr 
                  key={activity.id} 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: index * 0.05 }} 
                  className="hover:bg-[#fcfbf9] transition-colors cursor-pointer group"
                  onClick={(e) => handleRowClick(activity.id, e)}
                >
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                       <button onClick={() => setEditForm(cattleData.find(c => c.id === activity.id) || null)} className="action-btn p-1.5 sm:p-2 bg-white border border-[#e2e8e4] text-[#d97706] hover:bg-[#fef3c7] rounded-lg transition-colors">
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                       </button>
                       <button onClick={() => setCattleToDelete(activity.id)} className="action-btn p-1.5 sm:p-2 bg-white border border-[#e2e8e4] text-[#c25944] hover:bg-[#fee2e2] rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                       </button>
                    </div>
                  </td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap">
                    <span className="font-bold text-[#4c7766] group-hover:text-[#2d3a33] transition-colors">{activity.id}</span>
                  </td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap text-[#2d3a33] font-bold">{activity.name}</td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap text-[#2d3a33] font-medium">{activity.age.year}t {activity.age.month}b {activity.age.day}h</td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap text-[#2d3a33] font-medium">{activity.gender}</td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap text-[#2d3a33] font-medium">{activity.breed}</td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap font-bold text-[#2d3a33]">{activity.temp} °C</td>
                  <td className="px-4 sm:px-8 py-3 sm:py-5 whitespace-nowrap">
                    {parseFloat(activity.temp) >= 39.5 || activity.health < 80 ? (
                      <span className="px-3 sm:px-4 py-1 sm:py-2 inline-flex text-[10px] sm:text-xs leading-5 rounded-lg sm:rounded-xl bg-[#fee2e2] text-[#c25944] font-bold border border-[#fca5a5]/30 shadow-sm">
                        Indikasi Sakit
                      </span>
                    ) : activity.status === "normal" && parseFloat(activity.temp) <= 39.0 ? (
                      <span className="px-3 sm:px-4 py-1 sm:py-2 inline-flex text-[10px] sm:text-xs leading-5 rounded-lg sm:rounded-xl bg-[#e2e8e4] text-[#4c7766] font-bold border border-[#6b8e7b]/20 shadow-sm">
                        Normal Terkendali
                      </span>
                    ) : (
                      <span className="px-3 sm:px-4 py-1 sm:py-2 inline-flex text-[10px] sm:text-xs leading-5 rounded-lg sm:rounded-xl bg-[#fef3c7] text-[#d97706] font-bold border border-[#d97706]/20 shadow-sm">
                        Perlu Pantauan
                      </span>
                    )}
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[#6b7280] font-medium">Tidak ada data sapi untuk filter ini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="bg-[#fcfbf9] border-t border-[#e2e8e4] px-4 sm:px-8 py-4 flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-[#6b7280]">
              Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredActivities.length)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white border border-[#e2e8e4] flex items-center justify-center text-[#2d3a33] disabled:opacity-50 hover:bg-[#f4f5f2] transition-colors"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="px-2 sm:px-4 font-bold text-sm sm:text-base text-[#2d3a33]">
                {currentPage} / {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white border border-[#e2e8e4] flex items-center justify-center text-[#2d3a33] disabled:opacity-50 hover:bg-[#f4f5f2] transition-colors"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

        {/* Delete Modal */}
      <AnimatePresence>
        {cattleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl relative">
              <div className="w-16 h-16 bg-[#fee2e2] rounded-2xl flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
                 <AlertTriangle className="w-8 h-8 text-[#c25944]" />
              </div>
              <h3 className="text-xl font-bold text-center text-[#2d3a33] mb-2">Hapus Data Sapi</h3>
              <p className="text-center text-[#6b7280] text-sm mb-6">Apakah Anda yakin ingin menghapus data dengan ID <span className="font-bold text-[#c25944]">{cattleToDelete}</span>? Tindakan ini tidak dapat dibatalkan.</p>
              <div className="flex gap-3">
                <button onClick={() => setCattleToDelete(null)} className="flex-1 py-3 bg-[#f4f5f2] text-[#6b7280] font-bold rounded-xl hover:bg-[#e2e8e4]">Batal</button>
                <button onClick={confirmDelete} className="flex-1 py-3 bg-[#c25944] text-white font-bold rounded-xl hover:bg-[#a64835] shadow-md">Hapus</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Edit Modal */}
        {editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto pt-20 pb-20">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative my-auto">
              <button onClick={() => setEditForm(null)} className="absolute top-4 right-4 p-2 bg-[#f4f5f2] hover:bg-[#e2e8e4] rounded-full text-[#6b7280]"><X className="w-5 h-5" /></button>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-[#fef3c7] rounded-xl text-[#d97706]"><Edit2 className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-xl font-bold text-[#2d3a33]">Edit Data Sapi</h3>
                  <p className="text-sm text-[#6b7280]">{editForm.id}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#2d3a33] mb-1.5">Nama Sapi</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#2d3a33] mb-1.5">Ras Sapi (Breed)</label>
                    <select value={editForm.breed} onChange={(e) => setEditForm({...editForm, breed: e.target.value})} className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none appearance-none">
                      <option value="Brahman Cross">Brahman Cross</option>
                      <option value="Simental">Simental</option>
                      <option value="Limosin">Limosin</option>
                      <option value="Ongole">Ongole</option>
                      <option value="Bali">Bali</option>
                      <option value="Madura">Madura</option>
                      <option value="Holstein">Holstein</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#2d3a33] mb-1.5">Kelamin</label>
                    <select value={editForm.gender} onChange={(e) => setEditForm({...editForm, gender: e.target.value as "Jantan" | "Betina"})} className="w-full px-4 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none appearance-none">
                      <option value="Betina">Betina</option>
                      <option value="Jantan">Jantan</option>
                    </select>
                  </div>
                </div>
                 <div>
                  <label className="block text-xs font-bold text-[#2d3a33] mb-1.5">Tanggal Lahir (Usia)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" placeholder="Tahun" value={editForm.age.year} onChange={(e) => setEditForm({...editForm, age: {...editForm.age, year: parseInt(e.target.value) || 0}})} className="w-full px-3 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none text-center" />
                    <input type="number" placeholder="Bulan" value={editForm.age.month} onChange={(e) => setEditForm({...editForm, age: {...editForm.age, month: parseInt(e.target.value) || 0}})} className="w-full px-3 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none text-center" />
                    <input type="number" placeholder="Hari" value={editForm.age.day} onChange={(e) => setEditForm({...editForm, age: {...editForm.age, day: parseInt(e.target.value) || 0}})} className="w-full px-3 py-3 bg-[#fcfbf9] border-2 border-[#e2e8e4] rounded-xl font-bold focus:border-[#d97706] focus:outline-none text-center" />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                 <button onClick={saveEdit} className="w-full py-4 bg-[#d97706] text-white font-bold rounded-xl hover:bg-[#b46305] shadow-md flex items-center justify-center gap-2">
                    <Save className="w-5 h-5" /> Simpan Perubahan
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </>
    )}
    </div>
  );
}