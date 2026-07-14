'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Network, Plus, Trash2, Pencil, Layers, ShieldAlert, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE = '/e-sop-atrbpn/api';

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}

interface ProcessMap {
  id: number;
  process_title: string;
  level: number;
  kode: string | null;
  tahun: string | null;
  kelompok: string | null;
  status: string;
  updated_at: string;
  parent_id: number | null;
  unit_l1: string | null;
  unit_l2: string | null;
  relasi_internal?: string | null;
  relasi_eksternal?: string | null;
}

const LEVELS = [
  { n: 0, label: 'Level 0', desc: 'Peta Proses Bisnis (value chain: Inti · Pendukung · Lainnya)', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { n: 1, label: 'Level 1', desc: 'Peta Proses per unit kerja (SiPoC)', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { n: 2, label: 'Level 2', desc: 'Subproses · Relasi · Lintas Fungsi', color: 'bg-violet-50 text-violet-700 border-violet-200' },
];

export default function PetaProsesBisnisPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [token, setToken] = useState<string>('');
  const [maps, setMaps] = useState<ProcessMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ process_title: '', level: 0, kode: '', tahun: String(new Date().getFullYear()) });
  const [saving, setSaving] = useState(false);
  // Konfirmasi hapus berantai: peta + seluruh turunan terelasinya.
  const [deleteTarget, setDeleteTarget] = useState<ProcessMap | null>(null);
  const [deleteDescendants, setDeleteDescendants] = useState<{ id: number; level: number; kode: string | null; process_title: string }[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!t || !u) { router.replace('/login'); return; }
    try {
      const parsed = JSON.parse(u);
      setRole(parsed.role);
      setToken(t);
    } catch { router.replace('/login'); }
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/process-map/models', token);
      if (res.ok) setMaps(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token && role === 'superadmin') load(); }, [token, role, load]);

  const handleCreate = async () => {
    if (!form.process_title.trim()) { alert('Judul peta wajib diisi.'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/process-map/models', token, {
        method: 'POST',
        body: JSON.stringify({
          process_title: form.process_title.trim(),
          level: form.level,
          kode: form.kode.trim() || null,
          tahun: form.tahun || null,
          kelompok: form.level === 0 ? 'value-chain' : null,
          status: 'draft',
        }),
      });
      if (!res.ok) { alert('Gagal membuat peta.'); return; }
      const created = await res.json();
      router.push(`/peta-proses-bisnis/studio?id=${created.id}`);
    } finally { setSaving(false); }
  };

  // Buka modal konfirmasi + muat daftar turunan yang akan ikut terhapus.
  const askDelete = async (m: ProcessMap) => {
    setDeleteTarget(m);
    setDeleteDescendants([]);
    try {
      const res = await apiFetch(`/process-map/models/${m.id}/descendants`, token);
      if (res.ok) setDeleteDescendants(await res.json());
    } catch { /* daftar turunan gagal dimuat — modal tetap tampil */ }
  };

  // Ekspor Excel: Sheet 1 = hierarki L0–L2 per kolom (format contoh resmi:
  // "Level 0" = kode 2 segmen, "Level 1" = 3 segmen, "Level 2" = kegiatan 4
  // segmen, + Unit Kerja); Sheet 2 = Daftar Proses Level 3; Sheet 3 = Peta Relasi.
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const byKode = (a: ProcessMap, b: ProcessMap) => (a.kode || '').localeCompare(b.kode || '');
      const label = (m: ProcessMap) => `${m.kode ? `ATR/BPN ${m.kode} ` : ''}${m.process_title}`;
      // Proses L3 (usulan BPMN tertaut kegiatan)
      const res = await apiFetch('/bpmn/models', token);
      const bpmn: { peta_kegiatan_id?: number; probis_kode?: string; process_title: string; unit_l1?: string; unit_l2?: string; status?: string }[] = res.ok ? await res.json() : [];
      const l3ByKeg: Record<number, typeof bpmn> = {};
      bpmn.filter(b => b.peta_kegiatan_id).forEach(b => { (l3ByKeg[b.peta_kegiatan_id as number] ||= []).push(b); });

      // Sheet 1 — hierarki (kolom kosong utk baris lanjutan grup, seperti contoh)
      const rows1: Record<string, string>[] = [];
      const l1s = maps.filter(m => m.level === 1).sort(byKode);
      for (const l1 of l1s) {
        let firstL1 = true;
        const l2s = maps.filter(m => m.parent_id === l1.id && m.level === 2).sort(byKode);
        if (l2s.length === 0) { rows1.push({ 'Level 0': label(l1), 'Level 1': '', 'Level 2': '', 'Unit Kerja': l1.unit_l1 || '' }); continue; }
        for (const l2 of l2s) {
          let firstL2 = true;
          const kegs = maps.filter(m => m.parent_id === l2.id && m.level === 3).sort(byKode);
          if (kegs.length === 0) {
            rows1.push({ 'Level 0': firstL1 ? label(l1) : '', 'Level 1': label(l2), 'Level 2': '', 'Unit Kerja': l2.unit_l2 || l2.unit_l1 || '' });
            firstL1 = false;
            continue;
          }
          for (const kg of kegs) {
            rows1.push({
              'Level 0': firstL1 ? label(l1) : '',
              'Level 1': firstL2 ? label(l2) : '',
              'Level 2': label(kg),
              'Unit Kerja': firstL2 ? (l2.unit_l2 || l2.unit_l1 || '') : '',
            });
            firstL1 = false; firstL2 = false;
          }
        }
      }

      // Sheet 2 — Daftar Proses Level 3
      const rows2: Record<string, string>[] = [];
      maps.filter(m => m.level === 3).sort(byKode).forEach(kg => {
        (l3ByKeg[kg.id] || []).sort((a, b) => (a.probis_kode || '').localeCompare(b.probis_kode || '')).forEach(p => {
          rows2.push({
            'Kegiatan (Level 2)': label(kg),
            'Kode Proses': p.probis_kode ? `ATR/BPN ${p.probis_kode}` : '',
            'Nama Proses (Level 3)': p.process_title,
            'Unit Kerja': [p.unit_l1, p.unit_l2].filter(Boolean).join(' › '),
            'Status': p.status || '',
          });
        });
      });

      // Sheet 3 — Peta Relasi per kegiatan
      const rows3: Record<string, string>[] = [];
      maps.filter(m => m.level === 3).sort(byKode).forEach(kg => {
        let ri: string[] = [], re: string[] = [];
        try { ri = JSON.parse(kg.relasi_internal || '[]'); } catch { /* abaikan */ }
        try { re = JSON.parse(kg.relasi_eksternal || '[]'); } catch { /* abaikan */ }
        rows3.push({
          'Kode Kegiatan': kg.kode ? `ATR/BPN ${kg.kode}` : '',
          'Kegiatan': kg.process_title,
          'Internal ATR/BPN': ri.join(', '),
          'Eksternal': re.join(', '),
          'Unit Kerja': kg.unit_l2 || kg.unit_l1 || '',
        });
      });

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(rows1);
      ws1['!cols'] = [{ wch: 50 }, { wch: 60 }, { wch: 65 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Proses Bisnis L0-L2');
      const ws2 = XLSX.utils.json_to_sheet(rows2.length ? rows2 : [{ 'Kegiatan (Level 2)': '', 'Kode Proses': '', 'Nama Proses (Level 3)': '', 'Unit Kerja': '', 'Status': '' }]);
      ws2['!cols'] = [{ wch: 55 }, { wch: 24 }, { wch: 60 }, { wch: 40 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Daftar Proses L3');
      const ws3 = XLSX.utils.json_to_sheet(rows3.length ? rows3 : [{ 'Kode Kegiatan': '', 'Kegiatan': '', 'Internal ATR/BPN': '', 'Eksternal': '', 'Unit Kerja': '' }]);
      ws3['!cols'] = [{ wch: 24 }, { wch: 55 }, { wch: 50 }, { wch: 40 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Peta Relasi');
      const tahun = maps.find(m => m.level === 0)?.tahun || new Date().getFullYear();
      XLSX.writeFile(wb, `Peta Proses Bisnis Kementerian ${tahun}.xlsx`);
    } finally { setExporting(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/process-map/models/${deleteTarget.id}`, token, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        const gone: number[] = Array.isArray(data.deleted) ? data.deleted : [deleteTarget.id];
        setMaps(list => list.filter(x => !gone.includes(x.id)));
        setDeleteTarget(null);
      } else { alert('Gagal menghapus peta.'); }
    } finally { setDeleting(false); }
  };

  if (role && role !== 'superadmin') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <ShieldAlert className="w-12 h-12 mx-auto text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Khusus Superadmin</h2>
        <p className="text-slate-500 mt-1 text-sm">Fitur Peta Proses Bisnis (Level 0–2) masih dalam tahap uji coba dan hanya dapat diakses oleh akun <b>Superadmin</b>.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><Network className="w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Peta Proses Bisnis Kementerian</h1>
            <p className="text-sm text-slate-500">Level 0 s.d. Level 2 · selaras PermenPANRB 19/2018 tentang Penyusunan Peta Proses Bisnis Instansi Pemerintah</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportExcel} disabled={exporting || maps.length === 0}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50">
            <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Menyusun…' : 'Ekspor Excel'}
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700 transition-all active:scale-95">
            <Plus className="w-4 h-4" /> Buat Peta Baru
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm py-16 text-center">Memuat…</p>
      ) : maps.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <Layers className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Belum ada peta proses bisnis.</p>
          <p className="text-slate-400 text-sm mt-1">Klik <b>Buat Peta Baru</b> untuk mulai menyusun Level 0.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {LEVELS.map(lv => {
            const items = maps.filter(m => m.level === lv.n);
            if (items.length === 0) return null;
            return (
              <section key={lv.n}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${lv.color}`}>{lv.label}</span>
                  <span className="text-xs text-slate-400">{lv.desc}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(m => (
                    <div key={m.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {m.kode && <p className="font-mono text-[11px] font-bold text-blue-600">{m.kode}</p>}
                          <h3 className="font-bold text-slate-800 leading-snug truncate">{m.process_title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Tahun {m.tahun || '-'} · {m.status}</p>
                          {(m.unit_l2 || m.unit_l1) && (
                            <p className="text-[11px] text-cyan-700 mt-0.5 truncate" title={`${m.unit_l1 || ''}${m.unit_l2 ? ' › ' + m.unit_l2 : ''}`}>
                              {m.unit_l2 || m.unit_l1}
                            </p>
                          )}
                          {m.parent_id && (
                            <p className="text-[10px] text-slate-400 mt-0.5">↳ turunan dari peta #{m.parent_id}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <button onClick={() => router.push(`/peta-proses-bisnis/studio?id=${m.id}`)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold py-2 hover:bg-blue-100 transition-colors">
                          <Pencil className="w-3.5 h-3.5" /> Buka
                        </button>
                        <button onClick={() => askDelete(m)} title="Hapus" className="rounded-lg border border-slate-200 text-slate-400 p-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-800">Buat Peta Proses Bisnis</h3></div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {LEVELS.map(lv => (
                    <button key={lv.n} onClick={() => setForm(f => ({ ...f, level: lv.n }))}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition-all ${form.level === lv.n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {lv.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">{LEVELS.find(l => l.n === form.level)?.desc}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Judul Peta</label>
                <input value={form.process_title} onChange={e => setForm(f => ({ ...f, process_title: e.target.value }))}
                  placeholder="mis. Peta Proses Bisnis ATR/BPN" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Kode (opsional)</label>
                  <input value={form.kode} onChange={e => setForm(f => ({ ...f, kode: e.target.value }))}
                    placeholder="mis. ATR/BPN 01.03" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono focus:border-blue-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Tahun</label>
                  <input value={form.tahun} onChange={e => setForm(f => ({ ...f, tahun: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">Batal</button>
              <button onClick={handleCreate} disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300">
                {saving ? 'Membuat…' : 'Buat & Susun'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal konfirmasi hapus berantai */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
              <div className="p-2 rounded-xl bg-red-50 text-red-600"><Trash2 className="w-5 h-5" /></div>
              <h3 className="font-bold text-slate-800">Hapus Peta Proses Bisnis?</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-200 px-3.5 py-2.5">
                {deleteTarget.kode && <span className="font-mono text-xs font-bold text-blue-600 mr-2">{deleteTarget.kode}</span>}
                <span className="text-sm font-bold text-slate-800">{deleteTarget.process_title}</span>
                <span className="ml-2 text-[10px] font-black uppercase text-slate-400">Level {deleteTarget.level}</span>
              </div>
              {deleteDescendants.length > 0 ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
                  <p className="flex items-start gap-2 text-sm font-bold text-red-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    Peringatan: {deleteDescendants.length} peta turunan yang terelasi juga akan ikut terhapus:
                  </p>
                  <ul className="mt-2.5 space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {deleteDescendants.map(d => (
                      <li key={d.id} className="flex items-center gap-2 text-xs text-red-800 bg-white/60 rounded-lg px-2.5 py-1.5">
                        <span className="text-[9px] font-black uppercase bg-red-100 text-red-600 rounded px-1.5 py-0.5 shrink-0">L{d.level}</span>
                        {d.kode && <span className="font-mono font-bold shrink-0">{d.kode}</span>}
                        <span className="truncate">{d.process_title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Peta ini tidak memiliki peta turunan yang terelasi.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">Batal</button>
              <button onClick={confirmDelete} disabled={deleting} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300">
                {deleting ? 'Menghapus…' : deleteDescendants.length > 0 ? `Hapus Semua (${deleteDescendants.length + 1} peta)` : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
