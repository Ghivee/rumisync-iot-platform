import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Leaf, ChevronLeft, ChevronRight, Sparkles, FlaskConical, CheckCircle2, Flame, Save } from "lucide-react";
import { toast } from "sonner";
import { useCattle } from "../context/CattleContext";
import { supabase } from "../../lib/supabase";

const SERAT_OPTIONS = [
  { id: 'jerami_padi', label: 'Jerami Padi / Silase Jerami Padi', methaneFactor: 1.80 },
  { id: 'pucuk_tebu', label: 'Pucuk Tebu / Silase Pucuk Tebu', methaneFactor: 1.65 },
  { id: 'pelepah_sawit', label: 'Pelepah Sawit / Silase Pelepah Sawit', methaneFactor: 1.55 },
  { id: 'jerami_jagung', label: 'Jerami Jagung (Tebon)', methaneFactor: 1.42 },
  { id: 'rumput_gajah', label: 'Rumput Gajah / Odot / Lapangan', methaneFactor: 1.25 },
];
const PATI_OPTIONS = [
  { id: 'bis', label: 'Bungkil Inti Sawit (BIS)', methaneFactor: 0.72 },
  { id: 'jagung', label: 'Jagung Giling / Silase Jagung', methaneFactor: 0.65 },
  { id: 'dedak', label: 'Dedak Padi / Bekatul', methaneFactor: 0.78 },
  { id: 'pollard', label: 'Pollard Gandum', methaneFactor: 0.80 },
];
const PROTEIN_OPTIONS = [
  { id: 'none', label: 'Tidak Ada (Opsional)', reduction: 0 },
  { id: 'gamal', label: 'Daun Gamal', reduction: 0.12 },
  { id: 'indigofera', label: 'Indigofera sp.', reduction: 0.15 },
  { id: 'lamtoro', label: 'Daun Lamtoro / Kaliandra', reduction: 0.10 },
  { id: 'alfalfa', label: 'Alfalfa', reduction: 0.14 },
  { id: 'bungkil_kopra', label: 'Bungkil Kopra', reduction: 0.08 },
];
const ECO_BOOSTERS = [
  { id: 'minyak_kelapa', label: 'Minyak Kelapa', category: 'Minyak & Lemak', reduction: 0.15, icon: '🥥' },
  { id: 'minyak_bunga', label: 'Minyak Bunga Matahari', category: 'Minyak & Lemak', reduction: 0.18, icon: '🌻' },
  { id: 'minyak_ikan', label: 'Minyak Ikan', category: 'Minyak & Lemak', reduction: 0.20, icon: '🐟' },
  { id: 'lerak', label: 'Buah Lerak', category: 'Saponin & Tanin', reduction: 0.16, icon: '🫐' },
  { id: 'akasia', label: 'Daun Akasia', category: 'Saponin & Tanin', reduction: 0.19, icon: '🌿' },
  { id: 'peppermint', label: 'Minyak Peppermint', category: 'Minyak Atsiri', reduction: 0.25, icon: '🌱' },
  { id: 'bawang_putih', label: 'Minyak Bawang Putih', category: 'Minyak Atsiri', reduction: 0.30, icon: '🧄' },
];

const MAX_METHANE = 270;

// DMI-based methane: CH4 (g/day) = DMI(kg) × EF × blendFactor × reductions
// DMI = 2.5% of body weight. Avg cow ~400kg → DMI ≈ 10 kg/day
// EF (Emission Factor IPCC Tier 2) ≈ 21.6 g CH4/kg DMI for tropical cattle
function calcMethaneDMI(seratId: string, patiId: string, proteinId: string, ratio: number, boosterId: string | null, bodyWeightKg: number): { methane: number; dmi: number } {
  const dmi = bodyWeightKg * 0.025;
  const baseCH4perKgDMI = 21.6;
  const serat = SERAT_OPTIONS.find(s => s.id === seratId);
  const pati = PATI_OPTIONS.find(p => p.id === patiId);
  const protein = PROTEIN_OPTIONS.find(pr => pr.id === proteinId);
  const booster = boosterId ? ECO_BOOSTERS.find(b => b.id === boosterId) : null;
  if (!serat || !pati) return { methane: 0, dmi };
  const blendedFactor = serat.methaneFactor * (ratio / 100) + pati.methaneFactor * ((100 - ratio) / 100);
  let m = dmi * baseCH4perKgDMI * blendedFactor;
  if (protein && protein.reduction > 0) m *= (1 - protein.reduction);
  if (booster) m *= (1 - booster.reduction);
  return { methane: Math.round(Math.min(MAX_METHANE, Math.max(0, m))), dmi: parseFloat(dmi.toFixed(1)) };
}

function getMethaneZone(v: number) {
  if (v === 0) return { label: '⏳ Menunggu Input Pakan', color: '#6b7280', bg: '#f4f5f2', border: '#e2e8e4', zone: 'empty' };
  if (v < 110) return { label: '✅ Zona Hijau — Emisi Rendah', color: '#4c7766', bg: '#e2f0ea', border: '#a7f3d0', zone: 'green' };
  if (v < 175) return { label: '⚠️ Zona Kuning — Emisi Sedang', color: '#d97706', bg: '#fef3c7', border: '#fde68a', zone: 'yellow' };
  return { label: '🔴 Zona Merah — Emisi Tinggi', color: '#c25944', bg: '#fee2e2', border: '#fca5a5', zone: 'red' };
}

function needleRotation(v: number): number {
  return -90 + (v / MAX_METHANE) * 180;
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
  const [proteinId, setProteinId] = useState('none');
  const [ratio, setRatio] = useState(60);
  const [boosterId, setBoosterId] = useState<string | null>(null);
  const [bodyWeight, setBodyWeight] = useState(400);
  const [isSaving, setIsSaving] = useState(false);

  const hasInput = seratId !== '' && patiId !== '';
  const { methane, dmi } = useMemo(() =>
    hasInput ? calcMethaneDMI(seratId, patiId, proteinId, ratio, boosterId, bodyWeight) : { methane: 0, dmi: 0 },
    [seratId, patiId, proteinId, ratio, boosterId, bodyWeight, hasInput]
  );
  const zone = getMethaneZone(methane);
  const rotation = needleRotation(methane);
  const currentRel = batches[Math.min(relIdx, batches.length - 1)];

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
      protein_id: proteinId,
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
    setSeratId(''); setPatiId(''); setProteinId('none'); setBoosterId(null);
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
              <label className="flex items-center gap-1.5 text-xs font-bold text-rs-text mb-1">🌿 Sumber Protein</label>
              <select value={proteinId} onChange={e => setProteinId(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] bg-rs-card-sub border-2 border-rs-border rounded-xl focus:outline-none focus:border-rs-primary transition-all text-rs-text text-sm appearance-none">
                {PROTEIN_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
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
                <p className="text-xs text-rs-muted">CH₄ = DMI × 21.6 × blendFactor × reduksi</p>
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
                <text x="50" y="26" fill="#4c7766" fontSize="7.5" fontWeight="bold" textAnchor="middle">110</text>
                <text x="160" y="22" fill="#d97706" fontSize="7.5" fontWeight="bold" textAnchor="middle">175</text>
                <text x="193" y="112" fill="#c25944" fontSize="7.5" fontWeight="bold" textAnchor="middle">270</text>
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
