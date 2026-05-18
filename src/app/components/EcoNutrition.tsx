import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Leaf, ChevronLeft, ChevronRight, Sparkles, FlaskConical, CheckCircle2, Flame, Save, Bot, Lightbulb, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useCattle } from "../context/CattleContext";
import { supabase } from "../../lib/supabase";

const SERAT_OPTIONS = [
  { id: 'pucuk_tebu', label: 'Pucuk Tebu', ipm: 1.30 },
  { id: 'rumput_raja', label: 'Rumput Raja', ipm: 1.15 },
  { id: 'rumput_gajah', label: 'Rumput Gajah', ipm: 1.10 },
  { id: 'rumput_bd', label: 'Rumput BD (Brachiaria decumbens)', ipm: 1.10 },
  { id: 'rumput_setaria', label: 'Rumput Setaria', ipm: 1.05 },
  { id: 'rumput_gama_umami', label: 'Rumput Gama Umami', ipm: 1.00 },
  { id: 'daun_nangka', label: 'Daun Nangka', ipm: 0.95 },
  { id: 'daun_pepaya', label: 'Daun Pepaya', ipm: 0.90 },
  { id: 'rendeng', label: 'Rendeng (Kacang Tanah)', ipm: 0.85 },
  { id: 'lamtoro', label: 'Lamtoro', ipm: 0.80 },
];
const PATI_OPTIONS = [
  { id: 'dedak_padi', label: 'Dedak Padi', ipm: 0.65 },
  { id: 'jagung', label: 'Jagung', ipm: 0.60 },
  { id: 'ketan_hitam', label: 'Ketan Hitam', ipm: 0.55 },
  { id: 'millet_kenari', label: 'Millet & Biji Kenari', ipm: 0.55 },
  { id: 'bungkil_sawit', label: 'Bungkil Kelapa Sawit', ipm: 0.50 },
  { id: 'bungkil_kedelai', label: 'Bungkil Kedelai', ipm: 0.45 },
  { id: 'bungkil_kacang_tanah', label: 'Bungkil Kacang Tanah', ipm: 0.45 },
  { id: 'ampas_tahu', label: 'Ampas Tahu', ipm: 0.45 },
  { id: 'tepung_ikan', label: 'Tepung Ikan', ipm: 0.30 },
  { id: 'tepung_daging_tulang', label: 'Tepung Daging & Tulang (MBM)', ipm: 0.30 },
];
const ECO_BOOSTERS = [
  { id: 'minyak_kelapa', label: 'Minyak Kelapa', category: 'Minyak & Lemak', reduction: 0.15, icon: '🥥' },
  { id: 'minyak_bunga', label: 'Minyak Bunga Matahari', category: 'Minyak & Lemak', reduction: 0.18, icon: '🌻' },
  { id: 'minyak_ikan', label: 'Minyak Ikan', category: 'Minyak & Lemak', reduction: 0.20, icon: '🐟' },
  { id: 'peppermint', label: 'Minyak Peppermint', category: 'Minyak Atsiri', reduction: 0.25, icon: '🌱' },
  { id: 'bawang_putih', label: 'Minyak Bawang Putih', category: 'Minyak Atsiri', reduction: 0.30, icon: '🧄' },
];

const MAX_METHANE = 400;

// DMI-based methane: CH4 (g/day) = DMI(kg) × Baseline × IPM_gabungan × Faktor_ruminasi
// DMI = 2.5% of body weight.
function calcMethaneDMI(seratId: string, patiId: string, ratio: number, boosterId: string | null, bodyWeightKg: number, breed: string): { methane: number; dmi: number } {
  const dmi = bodyWeightKg * 0.025;
  const breedLower = breed.toLowerCase();
  
  let baseline = 21; // Pedaging
  if (breedLower.includes('perah') || breedLower.includes('impor') || breedLower.includes('holstein')) {
    baseline = 22;
  } else if (breedLower.includes('bali') || breedLower.includes('po') || breedLower.includes('madura')) {
    baseline = 19;
  }

  const serat = SERAT_OPTIONS.find(s => s.id === seratId);
  const pati = PATI_OPTIONS.find(p => p.id === patiId);
  const booster = boosterId ? ECO_BOOSTERS.find(b => b.id === boosterId) : null;
  if (!serat || !pati) return { methane: 0, dmi };
  
  const ipmGabungan = serat.ipm * (ratio / 100) + pati.ipm * ((100 - ratio) / 100);
  const faktorRuminasi = 500 / 500; // Asumsi default 500 menit/hari untuk estimasi awal
  
  let m = dmi * baseline * ipmGabungan * faktorRuminasi;
  if (booster) m *= (1 - booster.reduction);
  
  return { methane: Math.round(Math.min(MAX_METHANE, Math.max(0, m))), dmi: parseFloat(dmi.toFixed(1)) };
}

function getMethaneZone(v: number) {
  if (v === 0) return { label: '⏳ Menunggu Input Pakan', color: '#6b7280', bg: '#f4f5f2', border: '#e2e8e4', zone: 'empty' };
  if (v < 180) return { label: '✅ Zona Hijau — Emisi Rendah', color: '#4c7766', bg: '#e2f0ea', border: '#a7f3d0', zone: 'green' };
  if (v < 250) return { label: '⚠️ Zona Kuning — Emisi Sedang', color: '#d97706', bg: '#fef3c7', border: '#fde68a', zone: 'yellow' };
  return { label: '🔴 Zona Merah — Emisi Tinggi', color: '#c25944', bg: '#fee2e2', border: '#fca5a5', zone: 'red' };
}

function needleRotation(v: number): number {
  return -90 + (v / MAX_METHANE) * 180;
}

// ─── AI Feed Optimizer Logic ─────────────────────────────────
interface AIRecommendation {
  zone: 'green' | 'yellow' | 'red' | 'empty';
  headline: string;
  detail: string;
  action: string;
  boosterSuggestion: string | null;
  potentialReduction: number; // % emisi bisa dikurangi
}

function generateAIRecommendation(
  methane: number,
  seratId: string,
  patiId: string,
  ratio: number,
  boosterId: string | null,
  zone: ReturnType<typeof getMethaneZone>
): AIRecommendation {
  if (methane === 0) {
    return {
      zone: 'empty', headline: 'Pilih bahan pakan untuk memulai analisis AI',
      detail: 'AI akan menganalisis komposisi pakan dan memberikan rekomendasi optimasi emisi metana secara real-time.',
      action: '', boosterSuggestion: null, potentialReduction: 0
    };
  }

  const serat = SERAT_OPTIONS.find(s => s.id === seratId);
  const pati = PATI_OPTIONS.find(p => p.id === patiId);
  const hasBooster = boosterId !== null;
  const highFiberRatio = ratio > 65;
  const lowPatiRatio = 100 - ratio < 35;
  const isHighIpm = (serat?.ipm ?? 1) > 1.10;

  let headline = '';
  let detail = '';
  let action = '';
  let boosterSuggestion: string | null = null;
  let potentialReduction = 0;

  if (zone.zone === 'red') {
    headline = `🔴 Zona Merah — Perlu Optimasi Segera`;
    if (highFiberRatio) {
      detail = `Porsi ${serat?.label ?? 'Serat'} cukup tinggi (${ratio}%). Geser rasio pati ke ${Math.min(ratio - 10, 55)}% agar propionat meningkat.`;
      potentialReduction = 15;
    } else if (isHighIpm) {
      detail = `Bahan ${serat?.label} memiliki potensi metana tinggi (IPM ${serat?.ipm}). Pertimbangkan ganti ke sumber berserat dengan IPM lebih rendah seperti Lamtoro.`;
      potentialReduction = 20;
    } else {
      detail = `Emisi ${methane}g/hari melebihi batas aman.`;
      potentialReduction = 18;
    }
    action = 'Eco-Booster direkomendasikan untuk mendorong ke Zona Hijau.';
    boosterSuggestion = hasBooster ? null : 'bawang_putih';
  } else if (zone.zone === 'yellow') {
    headline = `⚠️ Zona Kuning — Perlu Optimasi`;
    if (highFiberRatio || lowPatiRatio) {
      detail = `Porsi ${serat?.label ?? 'Serat'} cukup tinggi (${ratio}%). Geser rasio pati ke 55% agar propionat meningkat.`;
      potentialReduction = 18;
    } else if (isHighIpm) {
       detail = `Bahan ${serat?.label} (IPM ${serat?.ipm}) bisa diganti dengan alternatif IPM lebih rendah.`;
       potentialReduction = 15;
    } else {
      detail = `Komposisi seimbang tapi emisi masih di zona kuning (${methane}g/hari). Optimalkan dengan Eco-Booster.`;
      potentialReduction = 12;
    }
    action = hasBooster ? 'Pertahankan Eco-Booster dan monitor emisi.' : 'Tambahkan Eco-Booster Minyak Bawang Putih atau Peppermint untuk hasil terbaik.';
    boosterSuggestion = hasBooster ? null : 'peppermint';
  } else {
    headline = `✅ Zona Hijau — Formulasi Optimal`;
    detail = `Emisi ${methane}g/hari sudah dalam batas optimal. ${hasBooster ? 'Eco-Booster aktif memberikan kontribusi reduksi signifikan.' : 'Bisa tambah Eco-Booster untuk optimasi lebih lanjut.'}`;
    action = hasBooster ? 'Formulasi sudah optimal. Terapkan ke semua rel!' : 'Pertimbangkan Eco-Booster untuk menekan emisi lebih jauh.';
    boosterSuggestion = null;
    potentialReduction = hasBooster ? 0 : 8;
  }

  return { zone: zone.zone as 'green' | 'yellow' | 'red', headline, detail, action, boosterSuggestion, potentialReduction };
}

export function EcoNutrition() {
  const { cattleData, selectedCattleId, setSelectedCattleId, relConfigs } = useCattle();

  // Rel batches based on relConfigs
  const batches = useMemo(() => {
    const sorted = [...cattleData].sort((a, b) => {
      const nA = parseInt(a.id.match(/\d+/)?.[0] || '0');
      const nB = parseInt(b.id.match(/\d+/)?.[0] || '0');
      return nA - nB;
    });
    const configs = relConfigs.length > 0 ? relConfigs : [{ rel_number: 1, cattle_count: 10, label: 'Rel 1', id: 1 }];
    const res: { label: string; cattle: typeof sorted }[] = [];
    let offset = 0;
    for (const cfg of configs) {
      const slice = sorted.slice(offset, offset + cfg.cattle_count);
      if (slice.length > 0) {
        res.push({ label: `Rel ${cfg.rel_number} — ${slice[0].id} s/d ${slice[slice.length - 1].id}`, cattle: slice });
      }
      offset += cfg.cattle_count;
    }
    if (offset < sorted.length) {
      const remaining = sorted.slice(offset);
      res.push({ label: `Rel Extra — ${remaining[0].id} s/d ${remaining[remaining.length - 1].id}`, cattle: remaining });
    }
    return res;
  }, [cattleData, relConfigs]);

  const [relIdx, setRelIdx] = useState(0);

  // Input state — start EMPTY (not pre-filled)
  const [seratId, setSeratId] = useState('');
  const [patiId, setPatiId] = useState('');
  const [ratio, setRatio] = useState(60);
  const [boosterId, setBoosterId] = useState<string | null>(null);
  const [bodyWeight, setBodyWeight] = useState(400);
  const [isSaving, setIsSaving] = useState(false);

  const hasInput = seratId !== '' && patiId !== '';
  const currentRel = batches[Math.min(relIdx, batches.length - 1)];
  const breed = currentRel?.cattle[0]?.breed || 'Brahman Cross';
  
  const { methane, dmi } = useMemo(() =>
    hasInput ? calcMethaneDMI(seratId, patiId, ratio, boosterId, bodyWeight, breed) : { methane: 0, dmi: 0 },
    [seratId, patiId, ratio, boosterId, bodyWeight, breed, hasInput]
  );
  const zone = getMethaneZone(methane);
  const rotation = needleRotation(methane);
  const boosterCats = ECO_BOOSTERS.reduce((acc, b) => {
    if (!acc[b.category]) acc[b.category] = [];
    acc[b.category].push(b);
    return acc;
  }, {} as Record<string, typeof ECO_BOOSTERS>);

  // Simpan resep pakan ke database — hanya saat peternak klik "Terapkan"
  const handleApplyFeed = async () => {
    if (!hasInput || !currentRel) return;
    setIsSaving(true);
    const records = currentRel.cattle.map(c => ({
      cattle_id: c.id,
      serat_id: seratId,
      pati_id: patiId,
      ratio_serat: ratio,
      booster_id: boosterId,
      methane_estimate: methane,
      dmi,
    }));
    const { error } = await supabase.from('feed_records').insert(records);
    setIsSaving(false);
    if (error) {
      toast.error('Gagal menyimpan resep pakan', { description: error.message });
    } else {
      toast.success(`Resep pakan diterapkan ke ${currentRel.cattle.length} sapi!`);
    }
  };

  // Reset input saat ganti rel
  const handleRelChange = (newIdx: number) => {
    setRelIdx(newIdx);
    setSeratId(''); setPatiId(''); setBoosterId(null);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4 text-center md:text-left">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-rs-primary rounded-xl flex items-center justify-center shadow-lg text-white shrink-0">
          <Leaf className="w-5 h-5 sm:w-7 sm:h-7" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-rs-text">Eco-Nutrisi & Carbon Tracker</h1>
          <p className="text-xs sm:text-sm text-rs-muted">Formulasi Pakan Cerdas — Emisi Metana per Sapi (Rumus DMI IPCC Tier 2)</p>
        </div>
      </div>

      {/* REL SELECTOR */}
      <div className="bg-rs-card rounded-2xl border border-rs-border shadow-sm p-4">
        <div className="text-xs font-bold text-rs-muted uppercase tracking-widest mb-3">📍 Pilih Target Rel</div>
        <div className="flex items-center gap-3">
          <button onClick={() => handleRelChange(Math.max(0, relIdx - 1))} disabled={relIdx === 0}
            className="w-10 h-10 rounded-xl bg-rs-sage-light border border-rs-border flex items-center justify-center text-rs-primary disabled:opacity-30 hover:bg-rs-border transition-colors shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 bg-rs-sage-light border-2 border-rs-primary/30 rounded-xl px-4 py-2.5 text-center">
            <div className="font-bold text-rs-primary text-sm sm:text-base">{currentRel?.label ?? '—'}</div>
            <div className="text-xs text-rs-muted">{currentRel?.cattle.length ?? 0} ekor sapi</div>
          </div>
          <button onClick={() => handleRelChange(Math.min(batches.length - 1, relIdx + 1))} disabled={relIdx >= batches.length - 1}
            className="w-10 h-10 rounded-xl bg-rs-sage-light border border-rs-border flex items-center justify-center text-rs-primary disabled:opacity-30 hover:bg-rs-border transition-colors shrink-0">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {currentRel && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {currentRel.cattle.map(c => (
              <button key={c.id} onClick={() => setSelectedCattleId(c.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${selectedCattleId === c.id ? 'bg-rs-primary text-white border-rs-primary' : 'bg-rs-sage-light text-rs-text border-rs-border hover:border-rs-sage'}`}>
                {c.id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Feed Inputs */}
        <div className="bg-rs-card rounded-2xl border border-rs-border shadow-sm overflow-hidden">
          <div className="bg-rs-sage-light border-b border-rs-border px-4 sm:px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rs-primary/10 rounded-xl"><Leaf className="w-4 h-4 text-rs-primary" /></div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-rs-text">Pilih Bahan Baku Pakan</h2>
                <p className="text-xs text-rs-muted">Input kosong = speedometer tetap 0. Isi untuk menghitung emisi.</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-rs-text mb-1">🌾 Sumber Serat Kasar</label>
              <select value={seratId} onChange={e => setSeratId(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] bg-rs-card-sub border-2 border-rs-border rounded-xl focus:outline-none focus:border-rs-primary transition-all text-rs-text text-sm appearance-none">
                <option value="">— Pilih Serat —</option>
                {SERAT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-rs-text mb-1">🌽 Sumber Pati</label>
              <select value={patiId} onChange={e => setPatiId(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] bg-rs-card-sub border-2 border-rs-border rounded-xl focus:outline-none focus:border-rs-primary transition-all text-rs-text text-sm appearance-none">
                <option value="">— Pilih Pati —</option>
                {PATI_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-rs-text mb-1">🐄 Berat Badan Sapi (kg)</label>
              <input type="number" value={bodyWeight} onChange={e => setBodyWeight(Number(e.target.value) || 0)} min={100} max={1000}
                className="w-full px-3 py-2.5 min-h-[44px] bg-rs-card-sub border-2 border-rs-border rounded-xl focus:outline-none focus:border-rs-primary transition-all text-rs-text text-sm font-bold" />
              <p className="text-[10px] text-rs-muted mt-1">DMI = 2.5% × berat badan = {(bodyWeight * 0.025).toFixed(1)} kg/hari</p>
            </div>
            <div>
              <div className="text-xs font-bold text-rs-text mb-2">⚖️ Rasio Serat vs Pati</div>
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="px-2 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-700">🌾 Serat {ratio}%</span>
                <span className="px-2 py-1 rounded-lg bg-[#e2f0ea] border border-[#c1d1c8] text-[#4c7766]">🌽 Pati {100 - ratio}%</span>
              </div>
              <input type="range" min={10} max={90} value={ratio} onChange={e => setRatio(Number(e.target.value))}
                className="w-full h-3 rounded-full cursor-pointer"
                style={{ background: `linear-gradient(to right, #f97316 ${ratio}%, #4c7766 ${ratio}%)`, accentColor: '#4c7766' }} />
            </div>
          </div>
        </div>

        {/* Speedometer */}
        <div className="bg-rs-card rounded-2xl border border-rs-border shadow-sm overflow-hidden">
          <div className="bg-rs-sage-light border-b border-rs-border px-4 sm:px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rs-primary/10 rounded-xl"><Flame className="w-4 h-4 text-rs-primary" /></div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-rs-text">Monitor Emisi Metana (DMI)</h2>
                <p className="text-xs text-rs-muted">CH₄ = DMI × Baseline × IPM_gabungan × Faktor_ruminasi</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 flex flex-col items-center">
            <div className="w-full max-w-[280px] mx-auto">
              <svg viewBox="0 0 200 115" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
                <path d="M 10 105 A 90 90 0 0 1 72.3 19.4" fill="none" stroke="#d1fae5" strokeWidth="20" strokeLinecap="butt" />
                <path d="M 72.3 19.4 A 90 90 0 0 1 152.9 32.2" fill="none" stroke="#fef3c7" strokeWidth="20" strokeLinecap="butt" />
                <path d="M 152.9 32.2 A 90 90 0 0 1 190 105" fill="none" stroke="#fee2e2" strokeWidth="20" strokeLinecap="butt" />
                <text x="8" y="112" fill="#6b8e7b" fontSize="7.5" fontWeight="bold" textAnchor="middle">0</text>
                <text x="50" y="26" fill="#4c7766" fontSize="7.5" fontWeight="bold" textAnchor="middle">180</text>
                <text x="160" y="22" fill="#d97706" fontSize="7.5" fontWeight="bold" textAnchor="middle">250</text>
                <text x="193" y="112" fill="#c25944" fontSize="7.5" fontWeight="bold" textAnchor="middle">400</text>
                <text x="100" y="8" fill="#6b8e7b" fontSize="7" fontWeight="bold" textAnchor="middle">g/hari</text>
                <g transform={`translate(100, 105) rotate(${rotation})`}>
                  <path d="M -3 6 L 0 -80 L 3 6 Z" fill="#2d3a33" />
                  <circle cx="0" cy="0" r="9" fill="#2d3a33" />
                  <circle cx="0" cy="0" r="4" fill="#ffffff" />
                </g>
              </svg>
            </div>
            <motion.div key={methane} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="text-4xl sm:text-5xl font-black text-rs-text text-center mt-2">
              {methane}
            </motion.div>
            <div className="text-xs text-rs-muted mt-1">g metana / hari / ekor (DMI: {dmi} kg/hari)</div>
            <div className="mt-2 px-4 py-1.5 rounded-full text-xs font-bold border inline-block text-center"
              style={{ backgroundColor: zone.bg, color: zone.color, borderColor: zone.border }}>
              {zone.label}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 w-full">
              <div className="bg-rs-sage-light rounded-xl p-3 border border-rs-border">
                <div className="text-xs text-rs-muted">Porsi Serat</div>
                <div className="text-sm font-bold text-rs-text">{ratio}%</div>
              </div>
              <div className="bg-rs-sage-light rounded-xl p-3 border border-rs-border">
                <div className="text-xs text-rs-muted">Berat Badan</div>
                <div className="text-sm font-bold text-rs-text">{bodyWeight} kg</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Eco-Boosters */}
      {hasInput && (
        <div className="bg-rs-card rounded-2xl border border-rs-border shadow-sm p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-rs-primary" />
            <span className="text-sm font-bold text-rs-text">🧪 Eco-Booster (Opsional)</span>
            {boosterId && <button onClick={() => setBoosterId(null)} className="ml-auto text-xs text-rs-sage hover:text-rs-primary font-bold">Reset</button>}
          </div>
          <div className="space-y-3">
            {Object.entries(boosterCats).map(([cat, items]) => (
              <div key={cat}>
                <div className="text-xs font-bold text-rs-muted uppercase tracking-wider mb-2">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {items.map(b => (
                    <button key={b.id} onClick={() => setBoosterId(boosterId === b.id ? null : b.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${boosterId === b.id ? 'bg-rs-primary text-white border-rs-primary' : 'bg-rs-sage-light text-rs-text border-rs-border hover:border-rs-sage'}`}>
                      {b.icon} {b.label} <span className={boosterId === b.id ? 'text-white/80' : 'text-rs-sage'}>-{Math.round(b.reduction * 100)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── AI Feed Optimizer Panel ─────────────────────────── */}
      {(() => {
        const aiRec = generateAIRecommendation(methane, seratId, patiId, ratio, boosterId, zone);
        const suggestedBooster = aiRec.boosterSuggestion ? ECO_BOOSTERS.find(b => b.id === aiRec.boosterSuggestion) : null;
        const bgMap = { green: '#f0fdf4', yellow: '#fefce8', red: '#fff7f5', empty: '#f8fafc' };
        const borderMap = { green: '#bbf7d0', yellow: '#fde68a', red: '#fecaca', empty: '#e2e8f0' };
        const headerBgMap = { green: '#4c7766', yellow: '#d97706', red: '#c25944', empty: '#64748b' };
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ backgroundColor: bgMap[aiRec.zone], borderColor: borderMap[aiRec.zone] }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: headerBgMap[aiRec.zone] }}>
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-white font-bold text-sm">Resep AI — Analisis Pakan Real-Time</div>
                <div className="text-white/75 text-[10px]">Output berubah otomatis saat Anda mengubah bahan atau slider</div>
              </div>
              {aiRec.potentialReduction > 0 && (
                <div className="ml-auto flex items-center gap-1 bg-white/20 rounded-lg px-2.5 py-1">
                  <TrendingDown className="w-3.5 h-3.5 text-white" />
                  <span className="text-white font-bold text-xs">-{aiRec.potentialReduction}% potensial</span>
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Headline & Detail */}
              {aiRec.zone !== 'empty' && (
                <div className="rounded-xl p-3.5 border" style={{ backgroundColor: bgMap[aiRec.zone], borderColor: borderMap[aiRec.zone] }}>
                  <div className="font-bold text-sm mb-1" style={{ color: headerBgMap[aiRec.zone] }}>{aiRec.headline}</div>
                  <p className="text-xs leading-relaxed" style={{ color: aiRec.zone === 'green' ? '#166534' : aiRec.zone === 'yellow' ? '#92400e' : '#991b1b' }}>
                    {aiRec.detail}
                  </p>
                </div>
              )}

              {/* Saran Tindakan */}
              {aiRec.action && (
                <div className="flex gap-2.5 items-start bg-white/70 rounded-xl p-3 border" style={{ borderColor: borderMap[aiRec.zone] }}>
                  <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: borderMap[aiRec.zone] }}>
                    <Lightbulb className="w-3.5 h-3.5" style={{ color: headerBgMap[aiRec.zone] }} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: headerBgMap[aiRec.zone] }}>Saran Tindakan AI</div>
                    <p className="text-xs font-medium text-rs-text">{aiRec.action}</p>
                  </div>
                </div>
              )}

              {/* Eco-Booster Suggestion */}
              {suggestedBooster && (
                <div className="flex items-center gap-3 bg-white/70 rounded-xl p-3 border" style={{ borderColor: borderMap[aiRec.zone] }}>
                  <span className="text-2xl">{suggestedBooster.icon}</span>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rs-muted mb-0.5">Rekomendasi Eco-Booster</div>
                    <div className="text-xs font-bold text-rs-text">{suggestedBooster.label}</div>
                    <div className="text-[10px] text-rs-muted">Reduksi emisi hingga -{Math.round(suggestedBooster.reduction * 100)}%</div>
                  </div>
                  <button
                    onClick={() => setBoosterId(suggestedBooster.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors shrink-0"
                    style={{ backgroundColor: headerBgMap[aiRec.zone] }}
                  >
                    Pakai
                  </button>
                </div>
              )}

              {/* Empty state */}
              {aiRec.zone === 'empty' && (
                <div className="text-center py-4">
                  <Sparkles className="w-8 h-8 text-rs-muted mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-rs-muted">{aiRec.detail}</p>
                </div>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* Tombol Terapkan — data hanya tersimpan saat peternak klik ini */}
      {hasInput && currentRel && (
        <button onClick={handleApplyFeed} disabled={isSaving}
          className="w-full bg-rs-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#3f6355] transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
          {isSaving ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
          Terapkan Resep ke {currentRel.label} ({currentRel.cattle.length} Sapi)
        </button>
      )}

      <div className="bg-rs-border border border-rs-sage/30 rounded-xl p-4 flex gap-3">
        <span className="text-2xl shrink-0">🌍</span>
        <div className="text-xs sm:text-sm text-rs-text">
          <span className="font-bold block mb-0.5">Dampak Lingkungan</span>
          {hasInput ? `Formulasi ini menghasilkan ${methane}g CH₄/hari/ekor. ${currentRel ? `Total rel: ${methane * currentRel.cattle.length}g/hari.` : ''}` : 'Pilih bahan pakan untuk melihat estimasi emisi metana.'}
        </div>
      </div>
    </div>
  );
}
