'use client';

// Popup "Impor SOP dari PDF" — dipakai di Studio Buat SOP (ganti isi kanvas) dan di
// halaman daftar SOP / Manajemen Pengajuan (buat SOP baru dari PDF). Berisi panduan
// berkas yang dapat/tidak dapat diimpor, area seret-lepas / pilih dari komputer, lalu
// ringkasan hasil baca sebelum diterapkan. PDF dibaca di peramban (lib/sopImportPdf).
import { useRef, useState } from 'react';
import { FileUp, X, Loader2, Info } from 'lucide-react';
import type { HasilImpor } from '@/lib/sopImportPdf';

const MAKS_MB = 20;

interface Props {
  open: boolean;
  onClose: () => void;
  onTerapkan: (hasil: HasilImpor, namaBerkas: string) => void;
  /** Keterangan kecil di bawah area unggah. */
  catatan?: string;
  /** Penjelasan sebelum tombol terapkan (apa yang akan terjadi). */
  keteranganTerapkan?: string;
  labelTerapkan?: string;
}

export default function ImporSopPdfModal({ open, onClose, onTerapkan, catatan, keteranganTerapkan, labelTerapkan = 'Terapkan ke Kanvas' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tahap, setTahap] = useState<'pilih' | 'membaca' | 'hasil' | 'gagal'>('pilih');
  const [berkas, setBerkas] = useState('');
  const [hasil, setHasil] = useState<HasilImpor | null>(null);
  const [galat, setGalat] = useState('');
  const [seret, setSeret] = useState(false);

  if (!open) return null;

  const reset = () => { setTahap('pilih'); setHasil(null); setGalat(''); setBerkas(''); };
  const tutup = () => { if (tahap === 'membaca') return; reset(); onClose(); };

  const baca = async (file: File) => {
    setBerkas(file.name);
    const gagal = (m: string) => { setGalat(m); setTahap('gagal'); };
    if (/\.vsdx?$/i.test(file.name)) return gagal('Berkas Visio belum dapat diimpor langsung. Dari Visio pilih File → Save As → PDF, lalu unggah PDF-nya.');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return gagal('Format berkas tidak didukung. Unggah berkas PDF (.pdf).');
    if (file.size > MAKS_MB * 1024 * 1024) return gagal(`Ukuran berkas ${(file.size / 1048576).toFixed(1)} MB melebihi batas ${MAKS_MB} MB.`);
    setTahap('membaca');
    try {
      const { imporSopDariPdf } = await import('@/lib/sopImportPdf');
      setHasil(await imporSopDariPdf(await file.arrayBuffer()));
      setTahap('hasil');
    } catch (e) {
      console.error('Impor PDF gagal:', e);
      gagal((e instanceof Error ? e.message : String(e)) + ' Pastikan PDF berbasis teks (bukan hasil scan) dan memakai format tabel SOP standar.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const terapkan = () => {
    if (!hasil) return;
    const h = hasil, b = berkas;
    reset();
    onTerapkan(h, b);
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 no-print font-sans" onClick={tutup}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl text-left" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2"><FileUp className="w-5 h-5 text-violet-600" /> Impor SOP dari PDF</h3>
          <button onClick={tutup} disabled={tahap === 'membaca'} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {tahap === 'pilih' && (
            <>
              <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="font-black text-emerald-700 mb-1.5">✓ Dapat diimpor</p>
                  <ul className="space-y-1 text-emerald-900 list-disc pl-4">
                    <li>PDF SOP berbasis teks — hasil <b>Save as PDF</b> dari Visio/Word (teksnya bisa diblok)</li>
                    <li>Berisi halaman <b>cover</b> (Dasar Hukum, Kualifikasi, dst.) dan tabel alur <b>No · Kegiatan · Pelaksana · Mutu Baku · Keterangan</b></li>
                    <li>Ukuran maksimal {MAKS_MB} MB</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                  <p className="font-black text-red-700 mb-1.5">✕ Tidak dapat diimpor</p>
                  <ul className="space-y-1 text-red-900 list-disc pl-4">
                    <li>PDF hasil <b>scan</b>/foto (teks berupa gambar)</li>
                    <li>Berkas Visio <b>.vsd/.vsdx</b> — simpan dulu sebagai PDF dari Visio</li>
                    <li>Word, Excel, gambar (JPG/PNG)</li>
                    <li>PDF terkunci kata sandi</li>
                  </ul>
                </div>
              </div>
              <label
                onDragOver={e => { e.preventDefault(); setSeret(true); }}
                onDragLeave={() => setSeret(false)}
                onDrop={e => { e.preventDefault(); setSeret(false); const f = e.dataTransfer.files?.[0]; if (f) baca(f); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${seret ? 'border-violet-500 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'}`}>
                <FileUp className={`w-9 h-9 ${seret ? 'text-violet-600' : 'text-slate-400'}`} />
                <span className="text-sm font-bold text-slate-700">Seret &amp; lepas berkas PDF di sini</span>
                <span className="text-xs text-slate-400">atau</span>
                <span className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold shadow-sm">Pilih dari Komputer</span>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) baca(f); }} />
              </label>
              <p className="text-[11px] text-slate-400 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Berkas dibaca di peramban Anda, tidak diunggah ke server.{catatan ? ` ${catatan}` : ''}</span></p>
            </>
          )}
          {tahap === 'membaca' && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
              <p className="text-sm font-bold text-slate-700">Membaca &ldquo;{berkas}&rdquo;…</p>
              <p className="text-xs text-slate-400">Mengenali cover, tabel alur, bentuk &amp; panah.</p>
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
          {tahap === 'hasil' && hasil && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-sm font-black text-emerald-700 mb-0.5">Berkas berhasil dibaca</p>
                <p className="text-xs text-emerald-700/80 mb-3 break-all">{berkas}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([['Halaman alur', hasil.ringkasan.halamanAlur], ['Baris', hasil.ringkasan.langkah], ['Bentuk', hasil.ringkasan.bentuk], ['Panah', hasil.ringkasan.panah]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-white border border-emerald-100 py-2"><p className="text-lg font-black text-slate-800">{v}</p><p className="text-[10px] font-bold uppercase text-slate-400">{l}</p></div>
                  ))}
                </div>
              </div>
              {hasil.ringkasan.peringatan.length > 0 && (
                <ul className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1 text-xs text-amber-900">
                  {hasil.ringkasan.peringatan.map(x => <li key={x}>⚠ {x}</li>)}
                </ul>
              )}
              {keteranganTerapkan && <p className="text-xs text-slate-500">{keteranganTerapkan}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={reset} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Pilih Berkas Lain</button>
                <button onClick={terapkan} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-sm">{labelTerapkan}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
