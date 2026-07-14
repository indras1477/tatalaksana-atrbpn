'use client';

// Popup "Dokumen Manual" — masa transisi dari dokumen manual (Visual Paradigm,
// Visio). Dokumen JADI diunggah sebagai PDF (≤7MB) atau ditautkan (Drive dll.),
// lalu langsung masuk daftar terbit modul BPMN/SOP + registry Dashboard.
import { useState } from 'react';
import { X, FileUp } from 'lucide-react';
import { HIERARKI_UNIT } from '@/lib/constants';

export const JENIS_OPTIONS = ['Pusat', 'Kantor Wilayah', 'Kantor Pertanahan'];
export const KLASIFIKASI_OPTIONS = [
  'Layanan Administrasi Pemerintah',
  'Layanan Pertanahan',
  'Layanan Tata Ruang',
  'Layanan Pengaduan dan Informasi',
  'Layanan Data, Keamanan, dan Infrastruktur',
];

export default function ManualDocModal({ kind, token, onClose, onSaved, defaultL1, defaultL2, isDarkMode }: {
  kind: 'bpmn' | 'sop' | 'sp';
  token: string;
  onClose: () => void;
  onSaved: (row: Record<string, unknown>) => void;
  defaultL1?: string;
  defaultL2?: string;
  isDarkMode?: boolean;
}) {
  const [form, setForm] = useState({
    judul: '', nomor: '', jenis: '', klasifikasi: '',
    l1: defaultL1 || '', l2: defaultL2 || '', tanggal: '', link: '', linkVisio: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.judul.trim()) { alert('Judul wajib diisi.'); return; }
    if (!file && !form.link.trim()) { alert('Unggah PDF atau isi tautan dokumen.'); return; }
    let file_data: string | null = null;
    if (file) {
      if (file.type !== 'application/pdf') { alert('File harus berformat PDF.'); return; }
      if (file.size > 7 * 1024 * 1024) { alert('Ukuran PDF maksimal 7MB.'); return; }
      file_data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    setSaving(true);
    try {
      const res = await fetch(`/e-sop-atrbpn/api/${kind}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          judul: form.judul.trim(),
          nomor: form.nomor.trim() || null,
          jenis: form.jenis || null,
          klasifikasi: form.klasifikasi || null,
          unit_l1: form.l1 || null,
          unit_l2: form.l2 || null,
          tanggal: form.tanggal || null,
          link: form.link.trim() || null,
          link_visio: form.linkVisio.trim() || null,
          file_data,
          file_name: file?.name || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({} as { error?: string }));
        alert(e.error || 'Gagal menyimpan dokumen manual.');
        return;
      }
      const row = await res.json();
      // Nama unit utk tampilan daftar (server mengembalikan id saja).
      row.unit_l1 = form.l1 || null;
      row.unit_l2 = form.l2 || null;
      onSaved(row);
      onClose();
    } finally { setSaving(false); }
  };

  const card = isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white';
  const label = `text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`;
  const input = `w-full min-h-11 px-3.5 py-2.5 rounded-xl border text-base outline-none focus:ring-2 focus:ring-amber-400 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-lg my-4 sm:my-0 rounded-2xl shadow-2xl sm:max-h-[92vh] sm:overflow-y-auto ${card}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700"><FileUp className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold">Dokumen Manual — {kind === 'bpmn' ? 'Proses Bisnis' : kind === 'sp' ? 'Standar Pelayanan' : 'SOP'}</h3>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Dokumen jadi hasil penyusunan manual (Visual Paradigm / Visio) — unggah PDF atau tautkan.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3.5">
          <div>
            <label className={label}>Judul Dokumen *</label>
            <input value={form.judul} onChange={e => set('judul', e.target.value)} placeholder={kind === 'bpmn' ? 'mis. Pemberian Hak Guna Bangunan' : kind === 'sp' ? 'mis. Standar Pelayanan Pendaftaran Tanah Pertama Kali' : 'mis. SOP Pemberian Hak Guna Bangunan'} className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Nomor (Opsional)</label>
              <input value={form.nomor} onChange={e => set('nomor', e.target.value)} placeholder={kind === 'bpmn' ? 'mis. 01/Probis-100.07.OT.02/VII/2026' : 'mis. 12/SOP-100.1/III/2024'} className={input} />
            </div>
            <div>
              <label className={label}>Tanggal (Opsional)</label>
              <input type="date" value={form.tanggal} onChange={e => set('tanggal', e.target.value)} className={input} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Jenis Proses (Kewenangan)</label>
              <select value={form.jenis} onChange={e => set('jenis', e.target.value)} className={input}>
                <option value="">-- Pilih --</option>
                {JENIS_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Klasifikasi</label>
              <select value={form.klasifikasi} onChange={e => set('klasifikasi', e.target.value)} className={input}>
                <option value="">-- Pilih --</option>
                {KLASIFIKASI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Unit Kerja Level 1</label>
            <select value={form.l1} onChange={e => { set('l1', e.target.value); set('l2', ''); }} className={input}>
              <option value="">-- Pilih Unit Kerja L1 --</option>
              {Object.keys(HIERARKI_UNIT).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Unit Kerja Level 2 (Opsional)</label>
            <select value={form.l2} onChange={e => set('l2', e.target.value)} className={input} disabled={!form.l1}>
              <option value="">-- Pilih Unit Kerja L2 --</option>
              {(form.l1 && HIERARKI_UNIT[form.l1] ? Object.keys(HIERARKI_UNIT[form.l1]) : []).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className={`rounded-xl border p-3.5 space-y-3 ${isDarkMode ? 'border-slate-700 bg-slate-800/40' : 'border-amber-200 bg-amber-50/50'}`}>
            <div>
              <label className={label}>Unggah PDF (≤7MB)</label>
              <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
                className={`block w-full text-sm mt-1 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-600 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-amber-700 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} />
              {file && <p className="text-[11px] mt-1 text-amber-700 font-semibold">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
            </div>
            <div className={`text-center text-[10px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>— atau —</div>
            <div>
              <label className={label}>Tautan Dokumen (Drive / eksternal)</label>
              <input value={form.link} onChange={e => set('link', e.target.value)} placeholder="https://…" className={input} />
            </div>
            {kind !== 'sp' && (
              <div>
                <label className={label}>{kind === 'bpmn' ? 'Tautan File Visual Paradigm (Opsional)' : 'Tautan File Visio (Opsional)'}</label>
                <input value={form.linkVisio} onChange={e => set('linkVisio', e.target.value)} placeholder={kind === 'bpmn' ? 'https://… (file sumber .vpp)' : 'https://… (file sumber .vsdx)'} className={input} />
                <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Tautan file sumber penyusunan — memudahkan revisi di kemudian hari.</p>
              </div>
            )}
          </div>
        </div>

        <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <button onClick={onClose} disabled={saving} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Batal</button>
          <button onClick={submit} disabled={saving} className="min-h-11 rounded-xl bg-amber-600 px-6 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:bg-slate-300">
            {saving ? 'Menyimpan…' : 'Simpan Dokumen'}
          </button>
        </div>
      </div>
    </div>
  );
}
