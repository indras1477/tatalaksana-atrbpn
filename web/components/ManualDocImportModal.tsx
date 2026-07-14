'use client';

// Impor MASSAL Dokumen Manual dari Excel — khusus SUPERADMIN (pola sama dgn
// Import Data Dashboard). Baris berbasis TAUTAN dokumen (Drive dll.); untuk
// unggah PDF satuan tetap lewat tombol "Dokumen Manual".
// Alur: unduh template → isi → unggah .xlsx → pratinjau + validasi → impor
// (pilih masuk sebagai Review Ortala MR ATAU langsung terbit/ditetapkan).
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { X, FileSpreadsheet, Download, Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { HIERARKI_UNIT } from '@/lib/constants';
import { JENIS_OPTIONS, KLASIFIKASI_OPTIONS } from '@/components/ManualDocModal';

const API_BASE = '/e-sop-atrbpn/api';

interface ImportRow {
  judul: string; nomor: string; tanggal: string; jenis: string; klasifikasi: string;
  unit_l1: string; unit_l2: string; link: string; link_visio: string;
}

const KIND_LABEL = { bpmn: 'Proses Bisnis', sop: 'SOP', sp: 'Standar Pelayanan' } as const;
const SRC_LABEL = { bpmn: 'Visual Paradigm', sop: 'Visio', sp: '' } as const;

export default function ManualDocImportModal({ kind, token, isDarkMode, onClose, onImported }: {
  kind: 'bpmn' | 'sop' | 'sp';
  token: string;
  isDarkMode?: boolean;
  onClose: () => void;
  onImported: (rows: Record<string, unknown>[], masuk: 'pending' | 'final') => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseMsg, setParseMsg] = useState('');
  const [masuk, setMasuk] = useState<'pending' | 'final'>('pending');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; failed: { baris: number; judul: string; error: string }[] } | null>(null);

  // BPMN yang diimpor selalu masih DALAM PROSES → paksa masuk Proses Penyusunan
  // (Review Ortala MR), tanpa opsi "Langsung Ditetapkan". Dokumen yang sudah
  // ditetapkan dicatat lewat Import Data di Dashboard. SOP/SP boleh langsung terbit.
  const allowFinal = kind !== 'bpmn';
  const effectiveMasuk: 'pending' | 'final' = allowFinal ? masuk : 'pending';

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const contoh: Record<string, string> = {
      'Judul': `Contoh: ${kind === 'sop' ? 'SOP ' : kind === 'sp' ? 'Standar Pelayanan ' : ''}Pemberian Hak Guna Bangunan`,
      'Nomor': kind === 'bpmn' ? '01/Probis-100.07.OT.02/VII/2026' : '12/SK-100.1/III/2024',
      'Tanggal': '2024-03-12',
      'Jenis Proses (Kewenangan)': JENIS_OPTIONS[0],
      'Klasifikasi': KLASIFIKASI_OPTIONS[1],
      'Unit Kerja L1': 'Direktorat Jenderal Penetapan Hak dan Pendaftaran Tanah',
      'Unit Kerja L2': 'Direktorat Pengaturan dan Penetapan Hak Atas Tanah',
      'Link Dokumen': 'https://drive.google.com/file/d/…/view',
    };
    if (kind !== 'sp') contoh[`Link ${SRC_LABEL[kind]}`] = 'https://drive.google.com/file/d/…/view';
    const ws = XLSX.utils.json_to_sheet([contoh]);
    ws['!cols'] = [{ wch: 55 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 60 }, { wch: 55 }, { wch: 45 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    // Sheet daftar unit resmi (L1 + L2) agar nama bisa disalin persis.
    const unitRows: { 'Unit Kerja L1': string; 'Unit Kerja L2': string }[] = [];
    Object.entries(HIERARKI_UNIT).forEach(([l1, l2s]) => {
      Object.keys(l2s).forEach(l2 => unitRows.push({ 'Unit Kerja L1': l1, 'Unit Kerja L2': l2 }));
    });
    const wsU = XLSX.utils.json_to_sheet(unitRows);
    wsU['!cols'] = [{ wch: 65 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(wb, wsU, 'Daftar Unit Kerja');
    XLSX.writeFile(wb, `Template_Impor_Dokumen_Manual_${KIND_LABEL[kind].replace(/ /g, '_')}.xlsx`);
  };

  const normalizeTanggal = (v: string): string => {
    const t = v.trim();
    if (!t) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const dm = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY
    if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    const d = new Date(t);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
        if (json.length === 0) { setParseMsg('✗ File kosong atau tidak ada data.'); setRows([]); return; }

        // Alias kolom fleksibel (case-insensitive) — pola sama dgn impor Dashboard.
        const COL: Record<keyof ImportRow, string[]> = {
          judul: ['Judul', 'Judul Dokumen', 'Nama', 'Nama Proses', 'Nama Proses/Layanan', 'Nama SOP', 'Judul Proses Bisnis'],
          nomor: ['Nomor', 'No', 'Nomor Dokumen', 'Nomor SK'],
          tanggal: ['Tanggal', 'Tanggal Dokumen', 'Tgl'],
          jenis: ['Jenis Proses (Kewenangan)', 'Jenis Proses', 'Kewenangan', 'Jenis Kewilayahan', 'Jenis', 'Kewilayahan'],
          klasifikasi: ['Klasifikasi', 'Klasifikasi Proses', 'Layanan'],
          unit_l1: ['Unit Kerja L1', 'Unit L1', 'Direktorat Jenderal', 'Ditjen', 'L1', 'Unit Eselon I'],
          unit_l2: ['Unit Kerja L2', 'Unit L2', 'Direktorat', 'L2', 'Unit Eselon II'],
          link: ['Link Dokumen', 'Link', 'URL', 'Tautan', 'Tautan Dokumen', 'Hyperlink'],
          link_visio: ['Link Visual Paradigm', 'Link Visio', 'Tautan Visio', 'Tautan Visual Paradigm', 'Link Sumber', 'Link File Sumber'],
        };
        const headers = Object.keys(json[0]);
        const resolveCol = (aliases: string[]) => {
          for (const a of aliases) {
            const f = headers.find(h => h.trim().toLowerCase() === a.toLowerCase());
            if (f) return f;
          }
          return '';
        };
        const colMap = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, resolveCol(v)])) as Record<keyof ImportRow, string>;
        const pick = (r: Record<string, string>, c: string) => (c ? String(r[c] ?? '').trim() : '');

        const parsed: ImportRow[] = json.map(r => ({
          judul: pick(r, colMap.judul),
          nomor: pick(r, colMap.nomor),
          tanggal: normalizeTanggal(pick(r, colMap.tanggal)),
          jenis: pick(r, colMap.jenis),
          klasifikasi: pick(r, colMap.klasifikasi),
          unit_l1: pick(r, colMap.unit_l1),
          unit_l2: pick(r, colMap.unit_l2),
          link: pick(r, colMap.link),
          link_visio: pick(r, colMap.link_visio),
        })).filter(r => r.judul || r.link);
        // Buang baris contoh dari template
        const cleaned = parsed.filter(r => !r.judul.toLowerCase().startsWith('contoh:'));
        if (cleaned.length === 0) { setParseMsg(`✗ Tidak ada baris valid. Kolom terdeteksi: [${headers.join(', ')}] — unduh template untuk format yang benar.`); setRows([]); return; }
        const tanpaLink = cleaned.filter(r => r.judul && !r.link).length;
        const tanpaJudul = cleaned.filter(r => !r.judul).length;
        let msg = `✓ ${cleaned.length} baris terbaca dari sheet "${wb.SheetNames[0]}"`;
        if (tanpaLink) msg += ` — ⚠ ${tanpaLink} baris tanpa Link Dokumen (akan dilewati)`;
        if (tanpaJudul) msg += `, ${tanpaJudul} tanpa Judul (dilewati)`;
        setParseMsg(msg);
        setRows(cleaned);
      } catch (err) { console.error(err); setParseMsg('✗ Gagal membaca file — pastikan format .xlsx.'); setRows([]); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const validRows = rows.filter(r => r.judul && r.link);

  const doImport = async () => {
    if (validRows.length === 0) { alert('Tidak ada baris valid untuk diimpor.'); return; }
    const tujuan = effectiveMasuk === 'final' ? 'langsung Terbit' : 'Proses Penyusunan (Review Ortala MR)';
    if (!window.confirm(`Impor ${validRows.length} dokumen manual ${KIND_LABEL[kind]} sebagai "${tujuan}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/${kind}/manual/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: validRows, masuk: effectiveMasuk }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        alert(e.error || 'Impor gagal.');
        return;
      }
      const d = await res.json();
      setResult({ inserted: d.inserted.length, failed: d.failed || [] });
      if (d.inserted.length > 0) onImported(d.inserted, effectiveMasuk);
    } finally { setBusy(false); }
  };

  const label = `text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-3xl my-4 sm:my-0 rounded-2xl shadow-2xl sm:max-h-[92vh] sm:overflow-y-auto ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-white'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><FileSpreadsheet className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold">Impor Excel — Dokumen Manual {KIND_LABEL[kind]}</h3>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Khusus superadmin: masukkan banyak dokumen bertautan sekaligus. Unggahan PDF satuan tetap lewat tombol Dokumen Manual.</p>
            </div>
          </div>
          <button onClick={onClose} className="min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Langkah 1: template + unggah */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={downloadTemplate}
              className={`flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'border-emerald-800 text-emerald-400 hover:bg-emerald-900/30' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
              <Download className="w-4 h-4" /> Unduh Template Excel
            </button>
            <label className={`flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold cursor-pointer text-white bg-emerald-600 hover:bg-emerald-700`}>
              <Upload className="w-4 h-4" /> Pilih File .xlsx
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
          </div>

          {parseMsg && (
            <p className={`text-xs rounded-xl px-3.5 py-2.5 border ${parseMsg.startsWith('✓') ? (isDarkMode ? 'text-emerald-300 bg-emerald-900/20 border-emerald-800' : 'text-emerald-700 bg-emerald-50 border-emerald-200') : (isDarkMode ? 'text-red-300 bg-red-900/20 border-red-800' : 'text-red-700 bg-red-50 border-red-200')}`}>{parseMsg}</p>
          )}

          {/* Pratinjau */}
          {rows.length > 0 && !result && (
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className={`text-[10px] font-bold uppercase sticky top-0 ${isDarkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-50'}`}>
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Judul</th>
                      <th className="px-3 py-2">Unit Kerja</th>
                      <th className="px-3 py-2">Link</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {rows.map((r, i) => {
                      const ok = !!(r.judul && r.link);
                      return (
                        <tr key={i} className={ok ? '' : (isDarkMode ? 'bg-red-900/20' : 'bg-red-50')}>
                          <td className={`px-3 py-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{i + 1}</td>
                          <td className={`px-3 py-2 font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{r.judul || <i className="text-red-500">tanpa judul</i>}{r.nomor ? ` · ${r.nomor}` : ''}</td>
                          <td className={`px-3 py-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{r.unit_l1 || '—'}{r.unit_l2 ? ` › ${r.unit_l2}` : ''}</td>
                          <td className="px-3 py-2 max-w-40 truncate">{r.link ? <span className="text-teal-600">{r.link}</span> : <i className="text-red-500">tanpa link</i>}</td>
                          <td className="px-3 py-2">{ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pilihan status masuk — SOP/SP boleh langsung terbit; BPMN selalu ke penyusunan */}
          {rows.length > 0 && !result && (allowFinal ? (
            <div>
              <p className={label}>Masukkan sebagai</p>
              <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
                {([
                  { key: 'pending', title: 'Proses Review (Ortala MR)', desc: 'Ikut alur: review → pengesahan pimpinan → verifikasi → terbit.' },
                  { key: 'final', title: 'Langsung Terbit', desc: 'Untuk dokumen lama yang SUDAH sah — langsung masuk daftar & registry Dashboard.' },
                ] as const).map(o => (
                  <button key={o.key} onClick={() => setMasuk(o.key)}
                    className={`flex-1 text-left rounded-xl border p-3.5 transition-all ${masuk === o.key ? (isDarkMode ? 'border-emerald-500 bg-emerald-900/20' : 'border-emerald-500 bg-emerald-50 shadow-sm') : (isDarkMode ? 'border-slate-700 hover:border-slate-500' : 'border-slate-200 hover:border-slate-300')}`}>
                    <p className={`text-sm font-bold flex items-center gap-1.5 ${masuk === o.key ? 'text-emerald-600' : (isDarkMode ? 'text-slate-300' : 'text-slate-700')}`}>
                      {masuk === o.key && <CheckCircle className="w-4 h-4" />}{o.title}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{o.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className={`text-xs leading-relaxed rounded-xl px-3.5 py-2.5 border ${isDarkMode ? 'text-blue-300 bg-blue-900/20 border-blue-800' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
              Dokumen hasil impor masuk ke <b>Proses Penyusunan</b> (Review Ortala MR) karena Proses Bisnis yang diimpor masih dalam proses — belum ditetapkan. Untuk rekap dokumen yang sudah ditetapkan, gunakan <b>Import Data</b> di Dashboard.
            </p>
          ))}

          {/* Hasil */}
          {result && (
            <div className={`rounded-xl border p-4 space-y-2 ${isDarkMode ? 'border-emerald-800 bg-emerald-900/20' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                <CheckCircle className="w-4 h-4" /> {result.inserted} dokumen berhasil diimpor{result.failed.length ? `, ${result.failed.length} gagal` : ''}.
              </p>
              {result.failed.length > 0 && (
                <ul className={`text-[11px] space-y-0.5 ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {result.failed.slice(0, 10).map((f, i) => <li key={i}>Baris {f.baris} ({f.judul || 'tanpa judul'}): {f.error}</li>)}
                  {result.failed.length > 10 && <li>… dan {result.failed.length - 10} lainnya</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <button onClick={onClose} disabled={busy} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{result ? 'Tutup' : 'Batal'}</button>
          {!result && (
            <button onClick={doImport} disabled={busy || validRows.length === 0}
              className="min-h-11 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300">
              {busy ? 'Mengimpor…' : `Impor ${validRows.length} Dokumen`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
