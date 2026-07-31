'use client';

// KOTAK SAMPAH (admin & superadmin) — dokumen BPMN/SOP/SP yang dihapus disimpan
// 30 hari sebelum dibuang permanen, sehingga penghapusan tak sengaja bisa dipulihkan.
import { useEffect, useState, useCallback } from 'react';
import { Trash2, RotateCcw, X, GitBranch, FileText, ClipboardList, AlertTriangle, Clock } from 'lucide-react';

const API_BASE = '/e-sop-atrbpn/api';

interface TrashItem {
  id: number;
  kind: 'bpmn' | 'sop' | 'sp';
  process_title: string;
  status: string;
  is_manual?: boolean | null;
  deleted_at: string;
  sisa_hari: number;
  unit_l1?: string | null;
  unit_l2?: string | null;
  penghapus_nama?: string | null;
  penghapus_user?: string | null;
}

const IKON: Record<string, React.ReactNode> = {
  bpmn: <GitBranch className="w-4 h-4" />,
  sop: <FileText className="w-4 h-4" />,
  sp: <ClipboardList className="w-4 h-4" />,
};
const LABEL: Record<string, string> = { bpmn: 'Proses Bisnis', sop: 'SOP', sp: 'Standar Pelayanan' };

export default function TrashModal({ token, role, isDarkMode, onClose, onRestored }: {
  token: string;
  role: string;
  isDarkMode?: boolean;
  onClose: () => void;
  onRestored?: () => void;
}) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [retensi, setRetensi] = useState(30);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const isSuperadmin = role === 'superadmin';

  const muat = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/trash`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Gagal memuat kotak sampah');
      const d = await r.json();
      setItems(d.items || []);
      setRetensi(d.retensi_hari || 30);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal memuat'); setItems([]); }
  }, [token]);

  useEffect(() => { muat(); }, [muat]);

  const pulihkan = async (it: TrashItem) => {
    if (!window.confirm(`Pulihkan "${it.process_title}"?\n\nDokumen akan kembali muncul di daftar ${LABEL[it.kind]}.`)) return;
    setSibuk(`${it.kind}-${it.id}`);
    try {
      const r = await fetch(`${API_BASE}/trash/${it.kind}/${it.id}/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Gagal memulihkan.'); return; }
      setItems(prev => (prev || []).filter(x => !(x.id === it.id && x.kind === it.kind)));
      onRestored?.();
    } finally { setSibuk(null); }
  };

  const hapusPermanen = async (it: TrashItem) => {
    if (!window.confirm(`HAPUS PERMANEN "${it.process_title}"?\n\nTindakan ini TIDAK DAPAT dibatalkan — dokumen beserta isinya hilang selamanya.`)) return;
    if (!window.confirm('Sekali lagi: yakin menghapus permanen? Tidak ada cara memulihkannya.')) return;
    setSibuk(`${it.kind}-${it.id}`);
    try {
      const r = await fetch(`${API_BASE}/trash/${it.kind}/${it.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Gagal menghapus.'); return; }
      setItems(prev => (prev || []).filter(x => !(x.id === it.id && x.kind === it.kind)));
    } finally { setSibuk(null); }
  };

  const tgl = (s: string) => { try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };

  return (
    <div className="fixed inset-0 z-70 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-3xl my-4 rounded-2xl shadow-2xl flex flex-col max-h-[88vh] ${isDarkMode ? 'bg-[#151F32] text-slate-200' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0"><Trash2 className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Kotak Sampah</h3>
              <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Dokumen terhapus disimpan {retensi} hari, lalu dibuang otomatis.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {err ? (
            <p className="text-sm text-red-500 py-6 text-center">{err}</p>
          ) : items === null ? (
            <p className={`text-sm py-10 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Memuat…</p>
          ) : items.length === 0 ? (
            <div className={`py-12 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <Trash2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">Kotak sampah kosong.</p>
              <p className="text-[11px] mt-1">Dokumen yang dihapus akan muncul di sini selama {retensi} hari.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map(it => {
                const kunci = `${it.kind}-${it.id}`;
                const mepet = it.sisa_hari <= 7;
                return (
                  <div key={kunci} className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-200 bg-slate-50/60'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600'}`}>{IKON[it.kind]}{LABEL[it.kind]}</span>
                        {it.is_manual && <span className="text-[10px] font-black px-1.5 py-0.5 rounded border uppercase text-amber-700 bg-amber-50 border-amber-300">Manual</span>}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${mepet ? 'bg-red-100 text-red-700' : (isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600')}`}>
                          <Clock className="w-3 h-3" /> sisa {Math.max(0, it.sisa_hari)} hari
                        </span>
                      </div>
                      <p className={`font-bold text-sm leading-snug wrap-break-word ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{it.process_title}</p>
                      <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {it.unit_l1 || 'Tanpa unit'}{it.unit_l2 ? ` › ${it.unit_l2}` : ''}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        Dihapus {tgl(it.deleted_at)}{it.penghapus_nama || it.penghapus_user ? ` oleh ${it.penghapus_nama || it.penghapus_user}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button disabled={sibuk === kunci} onClick={() => pulihkan(it)}
                        className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        <RotateCcw className="w-3.5 h-3.5" /> Pulihkan
                      </button>
                      {isSuperadmin && (
                        <button disabled={sibuk === kunci} onClick={() => hapusPermanen(it)} title="Hapus permanen (tidak dapat dibatalkan)"
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border disabled:opacity-60 ${isDarkMode ? 'border-red-800 text-red-400 hover:bg-red-900/30' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {items !== null && items.length > 0 && (
            <p className={`text-[11px] mt-4 pt-3 border-t flex items-start gap-1.5 leading-relaxed ${isDarkMode ? 'text-slate-500 border-slate-800' : 'text-slate-400 border-slate-100'}`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Dokumen dibuang permanen otomatis setelah {retensi} hari sejak dihapus.{isSuperadmin ? ' Tombol merah menghapus permanen seketika (khusus superadmin).' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
