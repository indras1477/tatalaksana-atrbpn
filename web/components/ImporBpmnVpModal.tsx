'use client';

// Popup "Impor Proses Bisnis dari Visual Paradigm" (tahap uji, superadmin) — di halaman
// daftar Buat Proses Bisnis. Berkas proyek .vpp dibaca di peramban (lib/bpmnImportVp),
// tiap diagram BPMN di dalamnya dapat dipilih, lalu diteruskan ke studio sebagai
// Proses Bisnis BARU (belum tersimpan sampai pengguna menekan Simpan).
import { useRef, useState } from 'react';
import { FileUp, X, Loader2, Info, Check } from 'lucide-react';
import type { DiagramImpor, HasilImporBpmn } from '@/lib/bpmnImportVp';

const MAKS_MB = 50;

interface Props {
  open: boolean;
  onClose: () => void;
  onTerapkan: (diagram: DiagramImpor, namaBerkas: string) => void;
}

export default function ImporBpmnVpModal({ open, onClose, onTerapkan }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tahap, setTahap] = useState<'pilih' | 'membaca' | 'hasil' | 'gagal'>('pilih');
  const [berkas, setBerkas] = useState('');
  const [hasil, setHasil] = useState<HasilImporBpmn | null>(null);
  const [dipilih, setDipilih] = useState(0);
  const [galat, setGalat] = useState('');
  const [seret, setSeret] = useState(false);

  if (!open) return null;

  const reset = () => { setTahap('pilih'); setHasil(null); setGalat(''); setBerkas(''); setDipilih(0); };
  const tutup = () => { if (tahap === 'membaca') return; reset(); onClose(); };

  const baca = async (file: File) => {
    setBerkas(file.name);
    const gagal = (m: string) => { setGalat(m); setTahap('gagal'); };
    if (/\.(svg|pdf|png|jpe?g)$/i.test(file.name)) {
      return gagal('PDF/SVG/gambar hasil ekspor Visual Paradigm hanya berisi GAMBAR — jenis elemen, lajur & sambungan panahnya tidak tersimpan sehingga tidak bisa disunting kembali. Unggah berkas proyeknya (.vpp).');
    }
    if (!/\.vpp$/i.test(file.name)) return gagal('Format berkas tidak didukung. Unggah berkas proyek Visual Paradigm (.vpp).');
    if (file.size > MAKS_MB * 1024 * 1024) return gagal(`Ukuran berkas ${(file.size / 1048576).toFixed(1)} MB melebihi batas ${MAKS_MB} MB.`);
    setTahap('membaca');
    try {
      const { imporBpmnDariVpp } = await import('@/lib/bpmnImportVp');
      const h = await imporBpmnDariVpp(await file.arrayBuffer());
      setHasil(h); setDipilih(0);
      setTahap('hasil');
    } catch (e) {
      console.error('Impor VPP gagal:', e);
      gagal((e instanceof Error ? e.message : String(e)) + ' Pastikan berkas adalah proyek Visual Paradigm (.vpp) yang tidak rusak.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const d = hasil?.diagram[dipilih];
  const terapkan = () => {
    if (!d) return;
    const b = berkas;
    reset();
    onTerapkan(d, b);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 font-sans" onClick={tutup}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2"><FileUp className="w-5 h-5 text-violet-600" /> Impor dari Visual Paradigm</h3>
          <button onClick={tutup} disabled={tahap === 'membaca'} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {tahap === 'pilih' && (
            <>
              <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="font-black text-emerald-700 mb-1.5">✓ Dapat diimpor</p>
                  <ul className="space-y-1 text-emerald-900 list-disc pl-4">
                    <li>Berkas proyek Visual Paradigm <b>.vpp</b> berisi Business Process Diagram</li>
                    <li>Pool &amp; Lane (tegak/mendatar), Task, Gateway, Event, Sub-Proses, panah alur &amp; pesan</li>
                    <li>Ukuran maksimal {MAKS_MB} MB</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                  <p className="font-black text-red-700 mb-1.5">✕ Tidak dapat diimpor</p>
                  <ul className="space-y-1 text-red-900 list-disc pl-4">
                    <li><b>PDF/SVG/gambar</b> hasil ekspor — hanya gambar, tanpa struktur diagram</li>
                    <li>Proyek Visual Paradigm terkunci kata sandi</li>
                    <li>Diagram selain BPMN (UML, ERD, dsb.)</li>
                  </ul>
                </div>
              </div>
              <label
                onDragOver={e => { e.preventDefault(); setSeret(true); }}
                onDragLeave={() => setSeret(false)}
                onDrop={e => { e.preventDefault(); setSeret(false); const f = e.dataTransfer.files?.[0]; if (f) baca(f); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${seret ? 'border-violet-500 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'}`}>
                <FileUp className={`w-9 h-9 ${seret ? 'text-violet-600' : 'text-slate-400'}`} />
                <span className="text-sm font-bold text-slate-700">Seret &amp; lepas berkas .vpp di sini</span>
                <span className="text-xs text-slate-400">atau</span>
                <span className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold shadow-sm">Pilih dari Komputer</span>
                <input ref={inputRef} type="file" accept=".vpp" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) baca(f); }} />
              </label>
              <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Berkas dibaca di peramban Anda, tidak diunggah ke server. Hasilnya menjadi Proses Bisnis BARU — dokumen lain tidak berubah.</span></p>
            </>
          )}
          {tahap === 'membaca' && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
              <p className="text-sm font-bold text-slate-700">Membaca &ldquo;{berkas}&rdquo;…</p>
              <p className="text-xs text-slate-400">Mengenali pool, lajur, aktivitas &amp; panah.</p>
            </div>
          )}
          {tahap === 'gagal' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-black text-red-700 mb-1">Berkas tidak dapat diimpor</p>
                {berkas && <p className="text-xs text-red-600/80 mb-1.5 break-all">{berkas}</p>}
                <p className="text-sm text-red-800">{galat}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={tutup} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Tutup</button>
                <button onClick={reset} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold">Pilih Berkas Lain</button>
              </div>
            </div>
          )}
          {tahap === 'hasil' && hasil && d && (
            <div className="space-y-4">
              {hasil.diagram.length > 1 && (
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-1.5">Proyek berisi {hasil.diagram.length} diagram — pilih satu:</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {hasil.diagram.map((x, i) => (
                      <button key={x.id} onClick={() => setDipilih(i)}
                        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl border text-sm ${i === dipilih ? 'border-violet-400 bg-violet-50 text-violet-900 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}>
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${i === dipilih ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300'}`}>{i === dipilih && <Check className="w-3 h-3" />}</span>
                        <span className="min-w-0 break-words">{x.nama}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-sm font-black text-emerald-700 mb-0.5">Berkas berhasil dibaca</p>
                <p className="text-xs text-emerald-700/80 break-all">{berkas}</p>
                <p className="text-sm font-bold text-slate-800 mt-2 mb-3 break-words">{d.nama}</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center">
                  {([['Pool', d.ringkasan.pool], ['Lane', d.ringkasan.lane], ['Aktivitas', d.ringkasan.task], ['Gateway', d.ringkasan.gateway],
                    ['Event', d.ringkasan.event], ['Sub-Proses', d.ringkasan.subProses], ['Alur', d.ringkasan.alur], ['Pesan', d.ringkasan.pesan]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-white border border-emerald-100 py-2"><p className="text-lg font-black text-slate-800">{v}</p><p className="text-[10px] font-bold uppercase text-slate-400">{l}</p></div>
                  ))}
                </div>
              </div>
              {d.ringkasan.dilewati.length > 0 && (
                <ul className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1 text-xs text-amber-900">
                  {d.ringkasan.dilewati.map(x => <li key={x}>⚠ {x}</li>)}
                </ul>
              )}
              <p className="text-xs text-slate-500">Selanjutnya lengkapi Informasi Proses Bisnis (unit kerja, jenis, klasifikasi). Diagram dimuat di studio dan baru tersimpan setelah Anda menekan Simpan.</p>
              <div className="flex justify-end gap-2">
                <button onClick={reset} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Pilih Berkas Lain</button>
                <button onClick={terapkan} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-sm">Lanjut ke Studio</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
