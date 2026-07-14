'use client';

// Popup "Lihat Dokumen" untuk baris DOKUMEN MANUAL (BPMN / SOP / SP).
// Menampilkan langsung PDF unggahan ATAU pratinjau tautan (Google Drive/Docs
// ditransformasi ke mode /preview) agar admin bisa memeriksa isi tanpa pindah
// tab — tombol "Buka Tautan" tetap ada bila diperlukan. Juga menyediakan:
//  - Edit Informasi (judul s.d. Unit Kerja L2, tautan dokumen & file Visio) —
//    penyusun/admin; menyimpan saat status "rejected" otomatis antre review lagi.
//  - Aksi alur: pending → (Setujui admin) penetapan → (unggah PDF ber-TTD)
//    verifikasi → (Tetapkan admin) terbit/approved; Tolak/Kembalikan + catatan.
import { useState, useEffect, useRef } from 'react';
import {
  X, FileText, ExternalLink, CheckCircle, XCircle, Stamp, Upload, Pencil,
  Building2, Calendar, Hash, AlertTriangle, Clock, Landmark, Link2,
} from 'lucide-react';
import { HIERARKI_UNIT } from '@/lib/constants';
import { JENIS_OPTIONS, KLASIFIKASI_OPTIONS } from '@/components/ManualDocModal';

const API_BASE = '/e-sop-atrbpn/api';

export interface ManualModelRow {
  id: number; process_title: string; status: string; created_by: number;
  catatan?: string | null; catatan_at?: string | null; updated_at: string;
  unit_l1?: string | null; unit_l2?: string | null;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
  is_manual?: boolean | null; manual_nomor?: string | null; manual_link?: string | null;
  manual_link_visio?: string | null;
  manual_file_name?: string | null; manual_tanggal?: string | null;
}

// Tautan eksternal → URL yang bisa disematkan (Google Drive/Docs punya mode
// /preview khusus iframe; situs lain dicoba apa adanya — sebagian menolak).
function embedUrlForLink(link: string): string | null {
  try {
    const u = new URL(link);
    if (u.hostname.includes('drive.google.com')) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
      const id = u.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
      return null; // folder dll. — tidak bisa dipratinjau
    }
    if (u.hostname.includes('docs.google.com')) {
      return link.replace(/\/(edit|view)([?#].*)?$/, '/preview');
    }
    return link;
  } catch { return null; }
}

export default function ManualDocDetailModal({ kind, model, token, role, isDarkMode, onClose, onChanged }: {
  kind: 'bpmn' | 'sop' | 'sp';
  model: ManualModelRow;
  token: string;
  role: string;               // 'admin' (superadmin sudah dinormalisasi) | 'user' | 'viewer'
  isDarkMode?: boolean;
  onClose: () => void;
  onChanged: (row: Record<string, unknown>) => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState<{ open: boolean; note: string; backTo: 'rejected' | 'penetapan' }>({ open: false, note: '', backTo: 'rejected' });
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ judul: '', nomor: '', jenis: '', klasifikasi: '', l1: '', l2: '', tanggal: '', link: '', linkVisio: '' });
  const urlRef = useRef<string | null>(null);

  const isAdmin = role === 'admin';
  const canUpload = role !== 'viewer'; // pemilik/unit divalidasi server saat unggah
  const finalStatus = kind === 'bpmn' ? 'approved' : 'terbit';
  const isFinal = model.status === finalStatus || model.status === 'terbit';
  const canEdit = role !== 'viewer' && (isAdmin || !isFinal); // server tetap memvalidasi

  // Muat PDF otomatis (fetch blob — window.open tak bisa kirim Authorization).
  useEffect(() => {
    if (model.manual_link) { setPdfUrl(null); return; }
    let cancelled = false;
    setLoadingPdf(true);
    fetch(`${API_BASE}/${kind}/models/${model.id}/manual-file`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (cancelled || !blob) return;
        const u = URL.createObjectURL(blob);
        urlRef.current = u;
        setPdfUrl(u);
      })
      .finally(() => { if (!cancelled) setLoadingPdf(false); });
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id, model.manual_file_name, model.manual_link]);

  const startEdit = () => {
    setEditForm({
      judul: model.process_title || '',
      nomor: model.manual_nomor || '',
      jenis: model.jenis_proses || '',
      klasifikasi: model.klasifikasi_proses || '',
      l1: model.unit_l1 || '',
      l2: model.unit_l2 || '',
      tanggal: model.manual_tanggal ? String(model.manual_tanggal).slice(0, 10) : '',
      link: model.manual_link || '',
      linkVisio: model.manual_link_visio || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm.judul.trim()) { alert('Judul wajib diisi.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/${kind}/models/${model.id}/manual-meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          judul: editForm.judul.trim(),
          nomor: editForm.nomor.trim() || null,
          jenis: editForm.jenis || null,
          klasifikasi: editForm.klasifikasi || null,
          unit_l1: editForm.l1 || null,
          unit_l2: editForm.l2 || null,
          tanggal: editForm.tanggal || null,
          link: editForm.link.trim() || null,
          link_visio: editForm.linkVisio.trim() || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal menyimpan perubahan.'); return; }
      const row = await res.json(); // server mengembalikan nama unit hasil join
      onChanged(row);
      setEditing(false);
    } finally { setBusy(false); }
  };

  const patchStatus = async (status: string, catatan?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/${kind}/models/status/${model.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, catatan: catatan || null }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal memperbarui status.'); return; }
      const row = await res.json();
      row.unit_l1 = model.unit_l1; row.unit_l2 = model.unit_l2;
      onChanged(row);
    } finally { setBusy(false); }
  };

  const uploadSigned = async () => {
    if (!signedFile) { alert('Pilih file PDF terlebih dahulu.'); return; }
    if (signedFile.type !== 'application/pdf') { alert('File harus berformat PDF.'); return; }
    if (signedFile.size > 7 * 1024 * 1024) { alert('Ukuran PDF maksimal 7MB.'); return; }
    const file_data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(signedFile);
    });
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/${kind}/models/${model.id}/manual-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ file_data, file_name: signedFile.name }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal mengunggah PDF.'); return; }
      const row = await res.json();
      row.unit_l1 = model.unit_l1; row.unit_l2 = model.unit_l2;
      setSignedFile(null);
      onChanged(row);
    } finally { setBusy(false); }
  };

  const statusInfo = (): { label: string; cls: string; icon: React.ReactNode; hint: string } => {
    switch (model.status) {
      case 'pending': return { label: 'REVIEW ORTALA MR', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Clock className="w-3 h-3" />, hint: 'Menunggu admin memeriksa dokumen ini — setujui untuk lanjut ke pengesahan pimpinan, atau tolak dengan catatan.' };
      case 'penetapan': return kind === 'bpmn'
        ? { label: 'MENUNGGU PENETAPAN MENTERI', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: <Landmark className="w-3 h-3" />, hint: 'Sudah disetujui Ortala MR — tinggal ditetapkan oleh admin/superadmin (tombol Ditetapkan di daftar).' }
        : { label: 'PENGESAHAN PIMPINAN', cls: 'bg-violet-50 text-violet-700 border-violet-200', icon: <Landmark className="w-3 h-3" />, hint: 'Disetujui — cetak & mintakan tanda tangan pimpinan, lalu unggah kembali PDF yang sudah ditandatangani.' };
      case 'verifikasi': return { label: 'VERIFIKASI TTD', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', icon: <Stamp className="w-3 h-3" />, hint: 'PDF ber-TTD sudah diunggah — admin memeriksa; bila sesuai, tetapkan agar dokumen terbit.' };
      case 'rejected': return { label: 'PERLU REVISI', cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" />, hint: 'Ditolak — perbaiki lewat "Edit Informasi" atau unggah ulang PDF; perbaikan otomatis mengantre ulang ke review admin.' };
      case 'approved': return kind === 'bpmn'
        ? { label: 'DITETAPKAN', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, hint: 'Dokumen sudah ditetapkan dan tercatat di registry Dashboard.' }
        : { label: 'DISETUJUI', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, hint: '' };
      case 'terbit': return { label: 'TERBIT', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, hint: 'Dokumen sudah terbit dan tercatat di registry Dashboard.' };
      default: return { label: (model.status || 'DRAFT').toUpperCase(), cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: <FileText className="w-3 h-3" />, hint: '' };
    }
  };
  const st = statusInfo();

  const label = `text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`;
  const input = `w-full min-h-11 px-3.5 py-2.5 rounded-xl border text-base outline-none focus:ring-2 focus:ring-teal-500 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`;
  const chip = `inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border ${isDarkMode ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`;
  const linkEmbed = model.manual_link ? embedUrlForLink(model.manual_link) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-3xl my-2 sm:my-0 rounded-2xl shadow-2xl sm:max-h-[94vh] sm:overflow-y-auto ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b sticky top-0 z-10 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-white'}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0"><FileText className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h3 className="font-bold leading-snug">{model.process_title}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black border ${st.cls}`}>{st.icon}{st.label}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-amber-300 bg-amber-900/30 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>Dokumen Manual</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && !editing && (
              <button onClick={startEdit} title="Edit Informasi Dokumen"
                className={`min-h-11 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${isDarkMode ? 'border-slate-700 text-teal-400 hover:bg-teal-900/30' : 'border-slate-200 text-teal-600 hover:bg-teal-50'}`}>
                <Pencil className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit Informasi</span><span className="sm:hidden">Edit</span>
              </button>
            )}
            <button onClick={onClose} className="min-h-11 min-w-11 flex items-center justify-center text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {editing ? (
            /* ===== MODE EDIT INFORMASI ===== */
            <div className={`rounded-xl border p-4 space-y-3.5 ${isDarkMode ? 'border-teal-800 bg-teal-900/10' : 'border-teal-200 bg-teal-50/40'}`}>
              <p className={`text-sm font-bold ${isDarkMode ? 'text-teal-300' : 'text-teal-700'}`}>Edit Informasi Dokumen</p>
              {model.status === 'rejected' && (
                <p className={`text-[11px] rounded-lg px-3 py-2 border ${isDarkMode ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                  Dokumen berstatus Perlu Revisi — menyimpan perbaikan akan mengirim ulang dokumen untuk direview admin.
                </p>
              )}
              <div>
                <label className={label}>Judul Dokumen *</label>
                <input value={editForm.judul} onChange={e => setEditForm(f => ({ ...f, judul: e.target.value }))} className={input} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Nomor (Opsional)</label>
                  <input value={editForm.nomor} onChange={e => setEditForm(f => ({ ...f, nomor: e.target.value }))} className={input} />
                </div>
                <div>
                  <label className={label}>Tanggal (Opsional)</label>
                  <input type="date" value={editForm.tanggal} onChange={e => setEditForm(f => ({ ...f, tanggal: e.target.value }))} className={input} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Jenis Proses (Kewenangan)</label>
                  <select value={editForm.jenis} onChange={e => setEditForm(f => ({ ...f, jenis: e.target.value }))} className={input}>
                    <option value="">-- Pilih --</option>
                    {JENIS_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Klasifikasi</label>
                  <select value={editForm.klasifikasi} onChange={e => setEditForm(f => ({ ...f, klasifikasi: e.target.value }))} className={input}>
                    <option value="">-- Pilih --</option>
                    {KLASIFIKASI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={label}>Unit Kerja Level 1</label>
                <select value={editForm.l1} onChange={e => setEditForm(f => ({ ...f, l1: e.target.value, l2: '' }))} className={input}>
                  <option value="">-- Pilih Unit Kerja L1 --</option>
                  {Object.keys(HIERARKI_UNIT).map(u => <option key={u} value={u}>{u}</option>)}
                  {editForm.l1 && !HIERARKI_UNIT[editForm.l1] && <option value={editForm.l1}>{editForm.l1}</option>}
                </select>
              </div>
              <div>
                <label className={label}>Unit Kerja Level 2 (Opsional)</label>
                <select value={editForm.l2} onChange={e => setEditForm(f => ({ ...f, l2: e.target.value }))} className={input} disabled={!editForm.l1}>
                  <option value="">-- Pilih Unit Kerja L2 --</option>
                  {(editForm.l1 && HIERARKI_UNIT[editForm.l1] ? Object.keys(HIERARKI_UNIT[editForm.l1]) : []).map(u => <option key={u} value={u}>{u}</option>)}
                  {editForm.l2 && !(editForm.l1 && HIERARKI_UNIT[editForm.l1] && HIERARKI_UNIT[editForm.l1][editForm.l2]) && <option value={editForm.l2}>{editForm.l2}</option>}
                </select>
              </div>
              <div>
                <label className={label}>Tautan Dokumen (Drive / eksternal)</label>
                <input value={editForm.link} onChange={e => setEditForm(f => ({ ...f, link: e.target.value }))} placeholder="https://…" className={input} />
                {model.manual_file_name && !editForm.link.trim() && (
                  <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Kosongkan bila tetap memakai PDF unggahan ({model.manual_file_name}).</p>
                )}
              </div>
              {kind !== 'sp' && (
                <div>
                  <label className={label}>{kind === 'bpmn' ? 'Tautan File Visual Paradigm (Opsional)' : 'Tautan File Visio (Opsional)'}</label>
                  <input value={editForm.linkVisio} onChange={e => setEditForm(f => ({ ...f, linkVisio: e.target.value }))} placeholder={kind === 'bpmn' ? 'https://… (file sumber .vpp)' : 'https://… (file sumber .vsdx)'} className={input} />
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
                <button onClick={() => setEditing(false)} disabled={busy} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Batal</button>
                <button onClick={saveEdit} disabled={busy} className="min-h-11 rounded-xl bg-teal-600 px-6 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:bg-slate-300">
                  {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
                </button>
              </div>
            </div>
          ) : (<>
            {/* Meta */}
            <div className="flex flex-wrap gap-1.5">
              {model.manual_nomor && <span className={chip}><Hash className="w-3 h-3" />{model.manual_nomor}</span>}
              <span className={chip}><Building2 className="w-3 h-3" />{model.unit_l1 || '—'}{model.unit_l2 ? ` › ${model.unit_l2}` : ''}</span>
              {model.jenis_proses && <span className={chip}>{model.jenis_proses}</span>}
              {model.klasifikasi_proses && <span className={chip}>{model.klasifikasi_proses}</span>}
              {model.manual_tanggal && <span className={chip}><Calendar className="w-3 h-3" />{new Date(model.manual_tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</span>}
            </div>

            {st.hint && (
              <p className={`text-xs leading-relaxed rounded-xl px-3.5 py-2.5 border ${isDarkMode ? 'text-slate-300 bg-slate-800/50 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>{st.hint}</p>
            )}

            {model.catatan && (
              <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${isDarkMode ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="font-black flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Catatan Admin</p>
                  {model.catatan_at && <span className={`text-[10px] font-semibold shrink-0 ${isDarkMode ? 'text-red-400/80' : 'text-red-500'}`}>{new Date(model.catatan_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <p className="whitespace-pre-wrap wrap-break-word">{model.catatan}</p>
              </div>
            )}

            {/* Tombol tautan (dokumen + file Visio) */}
            {(model.manual_link || model.manual_link_visio) && (
              <div className="flex flex-col sm:flex-row gap-2">
                {model.manual_link && (
                  <a href={model.manual_link} target="_blank" rel="noopener noreferrer"
                    className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 min-h-11 transition-colors ${isDarkMode ? 'border-teal-800 bg-teal-900/20 hover:bg-teal-900/40' : 'border-teal-200 bg-teal-50/60 hover:bg-teal-50'}`}>
                    <ExternalLink className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${isDarkMode ? 'text-teal-300' : 'text-teal-700'}`}>Buka Tautan Dokumen</span>
                      <span className={`block text-[10px] truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{model.manual_link}</span>
                    </span>
                  </a>
                )}
                {model.manual_link_visio && (
                  <a href={model.manual_link_visio} target="_blank" rel="noopener noreferrer"
                    className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 min-h-11 transition-colors ${isDarkMode ? 'border-indigo-800 bg-indigo-900/20 hover:bg-indigo-900/40' : 'border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50'}`}>
                    <Link2 className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    <span className="min-w-0">
                      <span className={`block text-xs font-bold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>{kind === 'bpmn' ? 'Buka File Visual Paradigm' : 'Buka File Visio'}</span>
                      <span className={`block text-[10px] truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{model.manual_link_visio}</span>
                    </span>
                  </a>
                )}
              </div>
            )}

            {/* Pratinjau dokumen: PDF unggahan atau tautan tersemat */}
            {model.manual_link ? (
              linkEmbed ? (
                <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className={`px-3.5 py-2 border-b text-[11px] font-bold ${isDarkMode ? 'border-slate-700 bg-slate-800/60 text-slate-300' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                    Pratinjau Tautan — bila tidak tampil (situs menolak disematkan), gunakan tombol Buka Tautan di atas.
                  </div>
                  <iframe src={linkEmbed} title="Pratinjau Dokumen" className="w-full h-[52vh] min-h-72 bg-white" allow="autoplay" />
                </div>
              ) : (
                <p className={`text-xs rounded-xl px-3.5 py-2.5 border ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  Tautan ini tidak dapat dipratinjau — gunakan tombol Buka Tautan Dokumen.
                </p>
              )
            ) : (
              <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className={`flex items-center justify-between px-3.5 py-2 border-b ${isDarkMode ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
                  <p className={`text-[11px] font-bold truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{model.manual_file_name || 'dokumen.pdf'}</p>
                  {pdfUrl && (
                    <button onClick={() => window.open(pdfUrl, '_blank')} className={`min-h-9 text-[11px] font-bold flex items-center gap-1 shrink-0 ml-2 ${isDarkMode ? 'text-teal-400 hover:text-teal-300' : 'text-teal-600 hover:text-teal-700'}`}>
                      <ExternalLink className="w-3 h-3" /> Buka di Tab Baru
                    </button>
                  )}
                </div>
                {loadingPdf ? (
                  <div className={`h-48 flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Memuat dokumen…</div>
                ) : pdfUrl ? (
                  <iframe src={pdfUrl} title="Dokumen Manual" className="w-full h-[52vh] min-h-72 bg-white" />
                ) : (
                  <div className={`h-32 flex items-center justify-center text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>File dokumen tidak ditemukan.</div>
                )}
              </div>
            )}

            {/* Aksi alur */}
            {!isFinal && (
              <div className={`rounded-xl border p-4 space-y-3 ${isDarkMode ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50/60'}`}>
                {/* Admin: review awal */}
                {isAdmin && model.status === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button disabled={busy} onClick={() => { if (window.confirm(kind === 'bpmn' ? 'Setujui dokumen ini? Selanjutnya menunggu proses penetapan menteri untuk ditetapkan admin.' : 'Setujui dokumen ini? Selanjutnya penyusun mencetak & memintakan tanda tangan pimpinan, lalu mengunggah ulang PDF ber-TTD.')) patchStatus('penetapan'); }}
                      className="flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300">
                      <CheckCircle className="w-4 h-4" /> {kind === 'bpmn' ? 'Setujui — Lanjut Penetapan Menteri' : 'Setujui — Lanjut Pengesahan Pimpinan'}
                    </button>
                    <button disabled={busy} onClick={() => setRejectNote({ open: true, note: '', backTo: 'rejected' })}
                      className={`flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'border-red-800 text-red-400 hover:bg-red-900/30' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                      <XCircle className="w-4 h-4" /> Tolak
                    </button>
                  </div>
                )}

                {/* BPMN: tidak pakai TTD/pimpinan — setelah disetujui, tinggal ditetapkan lewat daftar. */}
                {kind === 'bpmn' && isAdmin && model.status === 'penetapan' && (
                  <p className={`text-xs rounded-xl px-3.5 py-2.5 border ${isDarkMode ? 'text-violet-300 bg-violet-900/20 border-violet-800' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>
                    Dokumen sudah disetujui dan menunggu <b>penetapan menteri</b>. Tekan tombol <b>Ditetapkan</b> pada baris dokumen di daftar untuk menetapkannya (mengisi dasar & tanggal penetapan).
                  </p>
                )}

                {/* Unggah ulang PDF ber-TTD (SOP/SP; setelah disetujui) atau perbaikan (setelah ditolak) */}
                {kind !== 'bpmn' && canUpload && (model.status === 'penetapan' || model.status === 'rejected') && (
                  <div>
                    <label className={label}>
                      {model.status === 'penetapan' ? 'Unggah PDF yang Sudah Ditandatangani Pimpinan (≤7MB)' : 'Unggah Ulang PDF Perbaikan (≤7MB)'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <input type="file" accept="application/pdf" onChange={e => setSignedFile(e.target.files?.[0] || null)}
                        className={`flex-1 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-violet-700 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} />
                      <button disabled={busy || !signedFile} onClick={uploadSigned}
                        className="min-h-11 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:bg-slate-300">
                        <Upload className="w-4 h-4" /> {busy ? 'Mengunggah…' : 'Unggah'}
                      </button>
                    </div>
                    {signedFile && <p className="text-[11px] mt-1 text-violet-500 font-semibold">{signedFile.name} ({(signedFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
                  </div>
                )}

                {/* Admin: penetapan akhir setelah verifikasi TTD */}
                {isAdmin && model.status === 'verifikasi' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button disabled={busy} onClick={() => { if (window.confirm('Dokumen ber-TTD sudah sesuai semua? Tetapkan & terbitkan — dokumen akan tercatat di registry Dashboard.')) patchStatus(finalStatus); }}
                      className="flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300">
                      <Stamp className="w-4 h-4" /> Tetapkan &amp; Terbitkan
                    </button>
                    <button disabled={busy} onClick={() => setRejectNote({ open: true, note: '', backTo: 'penetapan' })}
                      className={`flex-1 min-h-11 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/30' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
                      <AlertTriangle className="w-4 h-4" /> Kembalikan (TTD belum sesuai)
                    </button>
                  </div>
                )}
              </div>
            )}
          </>)}

          <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Terakhir diperbarui: {new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Sub-modal catatan penolakan / pengembalian */}
        {rejectNote.open && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectNote(r => ({ ...r, open: false }))}>
            <div className={`w-full max-w-md rounded-2xl shadow-2xl ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
              <div className={`px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <h3 className="font-bold text-red-600 flex items-center gap-2"><XCircle className="w-5 h-5" /> {rejectNote.backTo === 'penetapan' ? 'Kembalikan untuk Perbaikan TTD' : 'Tolak Dokumen'}</h3>
              </div>
              <div className="p-5">
                <textarea rows={5} value={rejectNote.note} onChange={e => setRejectNote(r => ({ ...r, note: e.target.value }))}
                  placeholder={rejectNote.backTo === 'penetapan' ? 'Contoh: tanda tangan kurang jelas / halaman TTD tidak lengkap…' : 'Tuliskan alasan penolakan / poin revisi…'}
                  className={`w-full border rounded-xl p-3.5 text-base outline-none focus:ring-2 focus:ring-red-500 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
              </div>
              <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <button onClick={() => setRejectNote(r => ({ ...r, open: false }))} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'}`}>Batal</button>
                <button disabled={busy || !rejectNote.note.trim()} onClick={async () => { await patchStatus(rejectNote.backTo, rejectNote.note.trim()); setRejectNote(r => ({ ...r, open: false })); }}
                  className="min-h-11 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300">Kirim</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
