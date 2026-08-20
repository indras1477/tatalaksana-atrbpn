'use client';

// Riwayat / log aktivitas dokumen BPMN, SOP & SP — linimasa transisi status lengkap
// dengan pelakunya dan CATATAN REVIEW Ortala MR terdahulu (tersimpan permanen,
// walau kolom catatan di dokumen dibersihkan saat dikirim ulang).
import { useEffect, useState } from 'react';
import { History, X, Clock, MessageSquare } from 'lucide-react';

const API_BASE = '/e-sop-atrbpn/api';

interface HistRow {
  id: number; action: string; detail?: string | null; created_at: string;
  user_role?: string | null; unit?: string | null;
  nama_lengkap?: string | null; username?: string | null;
}

const roleLabel = (r?: string | null) =>
  r === 'admin' ? 'Admin' : r === 'superadmin' ? 'Superadmin' : r === 'user' ? 'User (Terbatas)' : r === 'viewer' ? 'Viewer' : (r || '');

function narasi(kind: 'bpmn' | 'sop' | 'sp', action: string): string {
  const doc = kind === 'bpmn' ? 'Proses Bisnis' : kind === 'sp' ? 'Standar Pelayanan' : 'SOP';
  switch (action) {
    case 'create':
    case 'draft': return `menyusun draft dokumen ${doc}`;
    case 'usulan': return `menambahkan usulan dokumen ${doc}`;
    case 'pending': return `mengirim dokumen ${doc} ke Biro Ortala MR untuk direview`;
    case 'rejected': return `mengembalikan dokumen ${doc} untuk diperbaiki (dengan catatan review)`;
    case 'approved': return kind !== 'bpmn'
      ? `menyetujui dokumen ${doc} — lanjut pengesahan pimpinan`
      : `menetapkan dokumen ${doc} (ditetapkan)`;
    case 'verifikasi': return 'menyerahkan berkas bertanda tangan — menunggu verifikasi admin';
    case 'penetapan': return `menyetujui dokumen ${doc} — menunggu proses penetapan menteri`;
    case 'terbit': return `menetapkan & menerbitkan dokumen ${doc}`;
    case 'relink': return `memperbarui tautan dokumen ${doc}`;
    default: return `memperbarui dokumen ${doc} (${action})`;
  }
}

const dotCls: Record<string, string> = {
  create: 'bg-slate-400', draft: 'bg-slate-400', usulan: 'bg-slate-400',
  pending: 'bg-blue-500', rejected: 'bg-red-500', approved: 'bg-emerald-500',
  verifikasi: 'bg-cyan-500', penetapan: 'bg-violet-500', terbit: 'bg-emerald-600', relink: 'bg-teal-500',
};

export default function DocHistoryModal({ kind, modelId, title, token, isDarkMode, onClose }: {
  kind: 'bpmn' | 'sop' | 'sp';
  modelId: number;
  title?: string;
  token: string;
  isDarkMode?: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<HistRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/${kind}/models/${modelId}/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { if (!r.ok) throw new Error('Gagal memuat riwayat'); return r.json(); })
      .then(d => { if (active) setRows(Array.isArray(d) ? d : []); })
      .catch(e => { if (active) setErr(e instanceof Error ? e.message : 'Gagal'); });
    return () => { active = false; };
  }, [kind, modelId, token]);

  const fmtTgl = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}, ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    } catch { return s; }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-lg my-4 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shrink-0"><History className="w-5 h-5" /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm">Riwayat Dokumen</h3>
              {title && <p className={`text-[11px] truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{title}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {err ? (
            <p className="text-sm text-red-500 py-4 text-center">{err}</p>
          ) : rows === null ? (
            <p className={`text-sm py-6 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Memuat riwayat…</p>
          ) : rows.length === 0 ? (
            <p className={`text-sm py-6 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Belum ada riwayat tercatat untuk dokumen ini.</p>
          ) : (
            <ol className="relative">
              {rows.map((h, i) => {
                const nama = h.nama_lengkap || h.username || 'Pengguna';
                const meta = [roleLabel(h.user_role), h.unit].filter(Boolean).join(', ');
                return (
                  <li key={`${h.id}-${i}`} className="relative pl-6 pb-5 last:pb-0">
                    {i < rows.length - 1 && <span className={`absolute left-[5px] top-4 bottom-0 w-px ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />}
                    <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-2 ${dotCls[h.action] || 'bg-slate-400'} ${isDarkMode ? 'ring-[#0F172A]' : 'ring-white'}`} />
                    <p className={`text-[11px] font-semibold flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Clock className="w-3 h-3" /> {fmtTgl(h.created_at)}
                    </p>
                    <p className={`text-[13px] mt-0.5 leading-snug ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      <b>{nama}</b>{meta ? <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}> ({meta})</span> : null} {narasi(kind, h.action)}.
                    </p>
                    {h.detail && (
                      <div className={`mt-1.5 rounded-xl border px-3 py-2 text-[12px] leading-relaxed flex gap-2 ${h.action === 'rejected'
                        ? (isDarkMode ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800')
                        : (isDarkMode ? 'bg-slate-800/60 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600')}`}>
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span className="whitespace-pre-wrap">{h.detail}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <p className={`text-[11px] mt-4 pt-3 border-t leading-relaxed ${isDarkMode ? 'text-slate-500 border-slate-800' : 'text-slate-400 border-slate-100'}`}>
            Catatan review Ortala MR terdahulu tetap tersimpan di riwayat ini sebagai pengingat bersama, walau dokumen sudah diperbaiki/dikirim ulang. Riwayat tercatat sejak fitur ini diaktifkan.
          </p>
        </div>
      </div>
    </div>
  );
}
