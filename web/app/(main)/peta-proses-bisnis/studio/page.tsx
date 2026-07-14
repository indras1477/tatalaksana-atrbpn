'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowUpRight, CheckCircle2, CornerLeftUp, FileDown, ListPlus, Loader2, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';

const BPMNModeler = dynamic(() => import('@/components/BPMNModeler'), { ssr: false });

const API_BASE = '/e-sop-atrbpn/api';
function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
}

// Template Level 0 — value chain: 3 pool (Inti · Pendukung · Lainnya).
const L0_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_L0" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_L0">
    <bpmn:participant id="Pool_Inti" name="Proses Inti" processRef="Proc_Inti" />
    <bpmn:participant id="Pool_Pendukung" name="Proses Pendukung" processRef="Proc_Pendukung" />
    <bpmn:participant id="Pool_Lainnya" name="Proses Lainnya" processRef="Proc_Lainnya" />
  </bpmn:collaboration>
  <bpmn:process id="Proc_Inti" isExecutable="false" />
  <bpmn:process id="Proc_Pendukung" isExecutable="false" />
  <bpmn:process id="Proc_Lainnya" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_L0">
    <bpmndi:BPMNPlane id="BPMNPlane_L0" bpmnElement="Collaboration_L0">
      <bpmndi:BPMNShape id="Pool_Inti_di" bpmnElement="Pool_Inti" isHorizontal="true">
        <dc:Bounds x="160" y="80" width="920" height="180" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Pool_Pendukung_di" bpmnElement="Pool_Pendukung" isHorizontal="true">
        <dc:Bounds x="160" y="280" width="920" height="180" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Pool_Lainnya_di" bpmnElement="Pool_Lainnya" isHorizontal="true">
        <dc:Bounds x="160" y="480" width="920" height="160" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

interface ProcessMap {
  id: number; process_title: string; level: number; kode: string | null;
  tahun: string | null; kelompok: string | null; status: string; bpmn_xml: string | null;
  parent_id: number | null; parent_element_id?: string | null; unit_l1: string | null; unit_l2: string | null;
}
interface SelectedEl { id: string; type: string; name: string; parentType?: string }
interface Kegiatan extends ProcessMap { relasi_internal?: string | null; relasi_eksternal?: string | null }
interface L3Process { id: number; process_title: string; probis_kode: string | null; probis_element_id?: string | null; status: string; unit_l1?: string | null; unit_l2?: string | null }

// Editor chip sederhana: ketik lalu Enter untuk menambah.
function ChipEditor({ label, color, values, onChange, placeholder }: {
  label: string; color: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div>
      <label className={`block text-xs font-bold mb-1.5 ${color}`}>{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 p-2 min-h-11">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))} className="text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={placeholder}
          className="flex-1 min-w-28 border-0 outline-none text-xs px-1 bg-transparent"
        />
      </div>
    </div>
  );
}

// Ekstrak struktur berjenjang dari XML BPMN: sub-process level-atas + yang
// bersarang di dalamnya (dengan koordinat x untuk penomoran urut kiri→kanan).
function extractHierarchy(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const subs = Array.from(doc.getElementsByTagNameNS('*', 'subProcess'));
  const shapes = Array.from(doc.getElementsByTagNameNS('*', 'BPMNShape'));
  const xOf = (id: string) => {
    const sh = shapes.find(s => s.getAttribute('bpmnElement') === id);
    const b = sh && sh.getElementsByTagNameNS('*', 'Bounds')[0];
    return b ? parseFloat(b.getAttribute('x') || '0') : 0;
  };
  const info = (el: Element) => ({
    element_id: el.getAttribute('id') || '',
    name: el.getAttribute('name') || '',
    x: xOf(el.getAttribute('id') || ''),
  });
  return subs
    .filter(s => (s.parentNode as Element | null)?.localName === 'process')
    .map(t => ({
      ...info(t),
      nested: subs.filter(s => s.parentNode === t).map(info),
    }));
}
interface UnitNode { id: string; nama: string; level: number; children?: UnitNode[] }

const LEVEL_META: Record<number, { label: string; color: string }> = {
  0: { label: 'LEVEL 0 · Value Chain', color: 'bg-blue-100 text-blue-700' },
  1: { label: 'LEVEL 1 · Peta Proses', color: 'bg-cyan-100 text-cyan-700' },
  2: { label: 'LEVEL 2 · Subproses', color: 'bg-violet-100 text-violet-700' },
};

function StudioInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [token, setToken] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [model, setModel] = useState<ProcessMap | null>(null);
  const [initialXml, setInitialXml] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Properti sub-process & integrasi antar level
  const [selectedEl, setSelectedEl] = useState<SelectedEl | null>(null);
  const [showProps, setShowProps] = useState(false);
  const [unitTree, setUnitTree] = useState<UnitNode[]>([]);
  const [propsForm, setPropsForm] = useState({ kode: '', unit: '' });
  const [childMap, setChildMap] = useState<ProcessMap | null>(null);
  const [propsSaving, setPropsSaving] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  // Pemicu simpan diagram terprogram (diregistrasikan oleh BPMNModeler) —
  // dipakai untuk auto-save sebelum berpindah ke peta turunan agar
  // sub-process yang baru digambar tidak hilang.
  const saveDiagramRef = useRef<(() => Promise<void>) | null>(null);
  const registerSaveHandler = useCallback((fn: () => Promise<void>) => { saveDiagramRef.current = fn; }, []);
  // API kanvas: gambar kotak bersarang secara live (proses L3 → kotak di kegiatan).
  const canvasApiRef = useRef<import('@/components/BPMNModeler').BpmnCanvasApi | null>(null);
  const registerCanvasApi = useCallback((api: import('@/components/BPMNModeler').BpmnCanvasApi) => { canvasApiRef.current = api; }, []);

  // Kegiatan (khusus L2): Peta Relasi + Daftar Proses L3 (masuk usulan BPMN).
  const [showKegiatan, setShowKegiatan] = useState(false);
  const [kegiatan, setKegiatan] = useState<Kegiatan | null>(null);
  const [kegiatanLoading, setKegiatanLoading] = useState(false);
  const [relasiInternal, setRelasiInternal] = useState<string[]>([]);
  const [relasiEksternal, setRelasiEksternal] = useState<string[]>([]);
  const [relasiSaving, setRelasiSaving] = useState(false);
  const [relasiSaved, setRelasiSaved] = useState(false);
  const [l3List, setL3List] = useState<L3Process[]>([]);
  const [newProc, setNewProc] = useState('');
  const [addingProc, setAddingProc] = useState(false);
  // Ref nilai relasi TERKINI — diisi sinkron oleh setter di bawah, sehingga
  // klik "Simpan" tepat setelah blur chip (yang menambah nilai) tidak kehilangan
  // chip terakhir (state React belum re-render saat handler klik jalan).
  const relasiRef = useRef({ internal: [] as string[], eksternal: [] as string[] });
  const setInternal = useCallback((v: string[]) => { relasiRef.current.internal = v; setRelasiInternal(v); }, []);
  const setEksternal = useCallback((v: string[]) => { relasiRef.current.eksternal = v; setRelasiEksternal(v); }, []);
  // Panel Peta Relasi (tampilan baca di bawah kanvas L2)
  const [kegiatanList, setKegiatanList] = useState<Kegiatan[]>([]);
  // Tampilan formal Peta Relasi (dokumen lembar penuh, sesuai format resmi)
  const [showRelasiView, setShowRelasiView] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  // Konfirmasi hapus proses L3 dari daftar (modal peringatan) + penekan dialog
  // saat penghapusan elemen dilakukan TERPROGRAM (bukan oleh pengguna).
  const [deleteProc, setDeleteProc] = useState<L3Process | null>(null);
  const [deletingProc, setDeletingProc] = useState(false);
  const suppressDeleteConfirmRef = useRef(false);
  // Ganti nama peta (khusus peta akar/L0 — turunan mengikuti nama kotak di induk).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!t || !u) { router.replace('/login'); return; }
    try { setRole(JSON.parse(u).role); setToken(t); } catch { router.replace('/login'); }
  }, [router]);

  useEffect(() => {
    if (!token || role !== 'superadmin' || !id) { if (role && role !== 'superadmin') setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/process-map/models/${id}`, token);
        if (!res.ok) { router.replace('/peta-proses-bisnis'); return; }
        const data: ProcessMap = await res.json();
        setModel(data);
        setInitialXml(data.bpmn_xml || (data.level === 0 ? L0_TEMPLATE : undefined));
        setSelectedEl(null);
        setShowProps(false);
      } finally { setLoading(false); }
    })();
  }, [token, role, id, router]);

  // Muat pohon unit kerja sekali (untuk dropdown pengampu).
  useEffect(() => {
    if (!token || role !== 'superadmin') return;
    apiFetch('/unit-kerja/tree', token).then(r => r.ok ? r.json() : []).then(setUnitTree).catch(() => {});
  }, [token, role]);

  const handleSave = useCallback(async (xml: string, svg: string) => {
    if (!model) return;
    setSaveState('saving');
    try {
      const res = await apiFetch(`/process-map/models/${model.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          process_title: model.process_title, level: model.level, kode: model.kode,
          tahun: model.tahun, parent_id: model.parent_id, parent_element_id: (model as ProcessMap & { parent_element_id?: string }).parent_element_id,
          kelompok: model.kelompok, unit_l1: model.unit_l1, unit_l2: model.unit_l2,
          bpmn_xml: xml, svg_xml: svg,
        }),
      });
      if (res.ok) {
        // Sinkronisasi berjenjang otomatis: sub-process ber-properti → judul L1
        // mengikuti; yang bersarang → jadi L2 bernomor otomatis + kanvas L1
        // ter-generate; di L2 → kotak menjadi KEGIATAN bernomor otomatis.
        if (model.level < 3) {
          try {
            const sres = await apiFetch(`/process-map/models/${model.id}/sync-children`, token, {
              method: 'POST',
              body: JSON.stringify({ children: extractHierarchy(xml) }),
            });
            if (sres.ok) {
              const sdata = await sres.json();
              // Backfill menyuntik kotak L3 ke kanvas di server → muat ulang
              // kanvas agar kotak yang digambar otomatis langsung terlihat.
              if (sdata.canvas_updated) {
                const fresh = await apiFetch(`/process-map/models/${model.id}`, token);
                if (fresh.ok) {
                  const fdata: ProcessMap = await fresh.json();
                  if (fdata.bpmn_xml) setInitialXml(fdata.bpmn_xml);
                }
              }
            }
          } catch { /* sinkronisasi gagal tidak menggagalkan simpan */ }
        }
        setSaveState('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState('idle'), 2500);
      } else { setSaveState('idle'); alert('Gagal menyimpan.'); }
    } catch { setSaveState('idle'); alert('Gagal menyimpan.'); }
  }, [model, token]);

  // Buka modal properti: muat tautan peta turunan yang sudah ada (bila ada).
  const openProps = useCallback(async () => {
    if (!model || !selectedEl) return;
    setShowProps(true);
    setPropsLoading(true);
    setChildMap(null);
    try {
      const res = await apiFetch(`/process-map/models/${model.id}/element-link/${encodeURIComponent(selectedEl.id)}`, token);
      if (res.ok) {
        const child: ProcessMap | null = await res.json();
        if (child) {
          setChildMap(child);
          setPropsForm({ kode: child.kode || '', unit: (model.level === 0 ? child.unit_l1 : child.unit_l2) || '' });
          return;
        }
      }
      setPropsForm({ kode: '', unit: '' });
    } finally { setPropsLoading(false); }
  }, [model, selectedEl, token]);

  // Muat daftar kegiatan peta ini (untuk panel Peta Relasi di bawah kanvas L2).
  const loadKegiatanList = useCallback(async () => {
    if (!model || model.level !== 2) return;
    try {
      const res = await apiFetch('/process-map/models', token);
      if (res.ok) {
        const all: Kegiatan[] = await res.json();
        setKegiatanList(all.filter(m => m.parent_id === model.id).sort((a, b) => (a.kode || '').localeCompare(b.kode || '')));
      }
    } catch { /* panel opsional */ }
  }, [model, token]);
  useEffect(() => { loadKegiatanList(); }, [loadKegiatanList]);

  // Isi state modal dari sebuah baris kegiatan.
  const hydrateKegiatan = useCallback(async (keg: Kegiatan) => {
    setKegiatan(keg);
    let ri: string[] = [], re: string[] = [];
    try { ri = JSON.parse(keg.relasi_internal || '[]'); } catch { /* abaikan */ }
    try { re = JSON.parse(keg.relasi_eksternal || '[]'); } catch { /* abaikan */ }
    setInternal(ri); setEksternal(re);
    const lr = await apiFetch(`/process-map/models/${keg.id}/l3-processes`, token);
    if (lr.ok) setL3List(await lr.json());
  }, [token, setInternal, setEksternal]);

  // Buka modal dari SELEKSI KANVAS: simpan-dulu (agar sinkronisasi mendaftarkan
  // kegiatan), lalu muat baris kegiatan + relasi + daftar proses L3-nya.
  const openKegiatan = useCallback(async () => {
    if (!model || !selectedEl) return;
    setShowKegiatan(true);
    setKegiatanLoading(true);
    setKegiatan(null); setL3List([]); setInternal([]); setEksternal([]); setRelasiSaved(false);
    try {
      await saveDiagramRef.current?.(); // pastikan kegiatan terdaftar via sync
      // Simpan + sinkronisasi berjalan asinkron — coba ulang beberapa kali.
      let keg: Kegiatan | null = null;
      for (let attempt = 0; attempt < 5 && !keg; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 800));
        const res = await apiFetch(`/process-map/models/${model.id}/element-link/${encodeURIComponent(selectedEl.id)}`, token);
        if (res.ok) keg = await res.json();
      }
      if (keg) await hydrateKegiatan(keg);
      loadKegiatanList();
    } finally { setKegiatanLoading(false); }
  }, [model, selectedEl, token, hydrateKegiatan, setInternal, setEksternal, loadKegiatanList]);

  // Simpan nama baru: diagram di-save dulu, lalu PUT judul (tanpa bpmn_xml —
  // server memakai COALESCE sehingga kanvas aman), lalu segarkan state.
  const saveRename = useCallback(async () => {
    const t = titleDraft.trim();
    if (!t || !model) { setEditingTitle(false); return; }
    setRenaming(true);
    try {
      await saveDiagramRef.current?.();
      await new Promise(r => setTimeout(r, 500));
      const res = await apiFetch(`/process-map/models/${model.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          process_title: t, level: model.level, kode: model.kode, tahun: model.tahun,
          parent_id: model.parent_id, parent_element_id: model.parent_element_id,
          kelompok: model.kelompok, unit_l1: model.unit_l1, unit_l2: model.unit_l2,
        }),
      });
      if (res.ok) {
        const row: ProcessMap = await res.json();
        setModel(row);
        if (row.bpmn_xml) setInitialXml(row.bpmn_xml); // remount kanvas dgn versi tersimpan
      } else alert('Gagal mengganti nama.');
    } finally { setRenaming(false); setEditingTitle(false); }
  }, [titleDraft, model, token]);

  // Unduh PDF F4: simpan diagram dulu (agar SVG terbaru), lalu unduh dari server.
  const handleDownloadPdf = useCallback(async () => {
    if (!model) return;
    setPdfDownloading(true);
    try {
      await saveDiagramRef.current?.();
      await new Promise(r => setTimeout(r, 600)); // beri waktu PUT menyelesaikan simpan
      const res = await apiFetch(`/process-map/models/${model.id}/pdf`, token);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Gagal membuat PDF.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Peta Proses Bisnis L${model.level} - ${model.process_title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally { setPdfDownloading(false); }
  }, [model, token]);

  const saveRelasi = useCallback(async () => {
    if (!kegiatan) return;
    setRelasiSaving(true);
    setRelasiSaved(false);
    try {
      // Baca dari ref agar chip yang baru di-commit lewat blur tidak tertinggal.
      const res = await apiFetch(`/process-map/models/${kegiatan.id}/relasi`, token, {
        method: 'PATCH',
        body: JSON.stringify({ internal: relasiRef.current.internal, eksternal: relasiRef.current.eksternal }),
      });
      if (res.ok) {
        setRelasiSaved(true);
        setTimeout(() => setRelasiSaved(false), 2500);
        loadKegiatanList(); // segarkan panel tampilan
      } else alert('Gagal menyimpan Peta Relasi.');
    } catch { alert('Gagal menyimpan Peta Relasi.'); }
    finally { setRelasiSaving(false); }
  }, [kegiatan, token, loadKegiatanList]);

  const addL3Process = useCallback(async () => {
    if (!kegiatan || !newProc.trim()) return;
    setAddingProc(true);
    try {
      // Arah sebaliknya: proses yang diisi dari modal juga otomatis DIGAMBAR
      // sebagai kotak bersarang di dalam kotak kegiatan pada kanvas L2.
      let elementId: string | null = null;
      if (kegiatan.parent_element_id) {
        elementId = canvasApiRef.current?.addNestedSubProcess(kegiatan.parent_element_id, newProc.trim()) || null;
      }
      const res = await apiFetch(`/process-map/models/${kegiatan.id}/l3-processes`, token, {
        method: 'POST',
        body: JSON.stringify({ process_title: newProc.trim(), element_id: elementId }),
      });
      if (res.ok) {
        const createdProc: L3Process = await res.json();
        setL3List(list => [...list, createdProc]);
        setNewProc('');
        // Simpan kanvas agar kotak yang baru digambar ikut persist.
        if (elementId) await saveDiagramRef.current?.();
      } else alert('Gagal menambah proses.');
    } finally { setAddingProc(false); }
  }, [kegiatan, token, newProc]);

  // Klik tong sampah pada daftar → tampilkan modal peringatan dulu.
  const askDeleteL3 = useCallback((p: L3Process) => {
    if (p.status !== 'usulan') { alert('Proses sudah dalam penyusunan di modul BPMN — hapus dari sana.'); return; }
    setDeleteProc(p);
  }, []);

  // Eksekusi hapus: baris usulan + KOTAK sub-process-nya di kanvas ikut terhapus
  // (dua arah tetap cermin), lalu simpan agar tidak dibuat ulang oleh sinkronisasi.
  const confirmDeleteL3 = useCallback(async () => {
    const p = deleteProc;
    if (!p) return;
    setDeletingProc(true);
    try {
      const res = await apiFetch(`/bpmn/models/${p.id}`, token, { method: 'DELETE' });
      if (!res.ok) { alert('Gagal menghapus.'); return; }
      if (p.probis_element_id) {
        suppressDeleteConfirmRef.current = true; // penghapusan terprogram — tanpa dialog
        try { canvasApiRef.current?.removeElement(p.probis_element_id); }
        finally { suppressDeleteConfirmRef.current = false; }
        await saveDiagramRef.current?.(); // persist kanvas tanpa kotak itu
      }
      setL3List(list => list.filter(x => x.id !== p.id));
      setDeleteProc(null);
    } finally { setDeletingProc(false); }
  }, [deleteProc, token]);

  // Peringatan saat pengguna menghapus ELEMEN sub-process di kanvas.
  const handleBeforeDelete = useCallback((els: SelectedEl[]) => {
    if (suppressDeleteConfirmRef.current) return true;
    if (!model) return true;
    const subs = els.filter(e => e.type === 'bpmn:SubProcess');
    if (subs.length === 0) return true;
    const names = subs.map(s => `"${s.name || s.id}"`).join(', ');
    const msg = model.level === 2
      ? `Hapus ${names}?\n\nSaat Simpan Alur: kegiatan/proses yang tertaut ikut terhapus — termasuk usulannya di Daftar Usulan BPMN (yang masih berstatus usulan).`
      : `Hapus ${names}?\n\nSaat Simpan Alur: peta turunan yang tertaut (beserta seluruh isinya) ikut terhapus.`;
    return window.confirm(msg);
  }, [model]);

  const savePropsAndLink = useCallback(async (): Promise<ProcessMap | null> => {
    if (!model || !selectedEl) return null;
    setPropsSaving(true);
    try {
      const res = await apiFetch(`/process-map/models/${model.id}/element-link`, token, {
        method: 'POST',
        body: JSON.stringify({
          element_id: selectedEl.id,
          element_name: selectedEl.name || 'Proses Tanpa Nama',
          kode: propsForm.kode.trim() || null,
          unit_l1: model.level === 0 ? propsForm.unit || null : undefined,
          unit_l2: model.level === 1 ? propsForm.unit || null : undefined,
        }),
      });
      if (!res.ok) { alert('Gagal menyimpan properti.'); return null; }
      const child: ProcessMap = await res.json();
      setChildMap(child);
      return child;
    } finally { setPropsSaving(false); }
  }, [model, selectedEl, token, propsForm]);

  if (role && role !== 'superadmin') {
    return <div className="p-8 text-center text-slate-500">Fitur ini khusus Superadmin.</div>;
  }
  if (loading || !model) {
    return <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Memuat peta…</div>;
  }

  const meta = LEVEL_META[model.level] || LEVEL_META[0];
  // Hanya sub-process LEVEL-ATAS yang punya properti/turunan manual; yang bersarang
  // di dalam kotak lain dikelola otomatis oleh sinkronisasi (nomor & peta L2).
  const topLevelSubProc = selectedEl?.type === 'bpmn:SubProcess' && selectedEl?.parentType !== 'bpmn:SubProcess';
  const canHaveChild = model.level < 2 && topLevelSubProc;
  // Di L2: sub-process = KEGIATAN → Peta Relasi + Daftar Proses L3 (usulan BPMN).
  const isKegiatanBtn = model.level === 2 && topLevelSubProc;
  // Dropdown unit: L0 → daftar Unit Kerja L1; L1 → daftar Unit Kerja L2 di bawah unit L1 peta ini.
  const unitOptions: string[] = model.level === 0
    ? unitTree.map(u => u.nama)
    : (unitTree.find(u => u.nama === model.unit_l1)?.children || []).map(u => u.nama);
  const unitLabel = model.level === 0 ? 'Unit Kerja Level 1 (pengampu)' : `Unit Kerja Level 2 (di bawah ${model.unit_l1 || 'unit induk'})`;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 flex-wrap">
        <button onClick={() => router.push('/peta-proses-bisnis')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <ArrowLeft className="w-4 h-4" /> Daftar
        </button>
        {model.parent_id && (
          <button onClick={() => router.push(`/peta-proses-bisnis/studio?id=${model.parent_id}`)} title="Buka peta induk"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <CornerLeftUp className="w-4 h-4" /> Peta Induk
          </button>
        )}
        <span className={`text-[11px] font-black tracking-wider px-2.5 py-1 rounded-lg ${meta.color}`}>{meta.label}</span>
        <div className="min-w-0">
          {model.kode && <span className="font-mono text-xs font-bold text-blue-600 mr-2">{model.kode}</span>}
          {editingTitle ? (
            <span className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="rounded-lg border border-blue-300 px-2 py-1 text-sm font-bold text-slate-800 focus:outline-none min-w-72"
              />
              <button onClick={saveRename} disabled={renaming} className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-bold text-white disabled:bg-slate-300">{renaming ? '…' : 'Simpan'}</button>
              <button onClick={() => setEditingTitle(false)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500">Batal</button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-bold text-slate-800 truncate">{model.process_title}</span>
              {!model.parent_element_id ? (
                <button onClick={() => { setTitleDraft(model.process_title); setEditingTitle(true); }}
                  title="Ganti nama peta" className="text-slate-300 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
              ) : (
                <span title="Nama peta turunan mengikuti nama kotaknya di peta induk — ubah di sana (klik-ganda kotak), lalu Simpan Alur." className="cursor-help text-slate-300 text-[10px]">ⓘ</span>
              )}
            </span>
          )}
          {(model.unit_l1 || model.unit_l2) && (
            <span className="ml-2 text-[11px] text-slate-400">· {model.unit_l2 || model.unit_l1}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canHaveChild && (
            <button onClick={openProps}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 transition-all">
              <Settings2 className="w-4 h-4" /> Properti Sub-Proses
            </button>
          )}
          {isKegiatanBtn && (
            <button onClick={openKegiatan}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-all">
              <ListPlus className="w-4 h-4" /> Kegiatan &amp; Peta Relasi
            </button>
          )}
          {saveState === 'saving' && <span className="flex items-center gap-1.5 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…</span>}
          {saveState === 'saved' && <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-sm"><CheckCircle2 className="w-4 h-4" /> Tersimpan</span>}
        </div>
      </div>
      {/* overflow-hidden + override min-h internal BPMNModeler (min-h-150 = 600px)
          agar kanvas TIDAK meluber menutupi panel/tombol di bawahnya. */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden [&>div]:min-h-0">
        <BPMNModeler
          xml={initialXml}
          projectName={model.process_title}
          isViewOnly={false}
          onSave={handleSave}
          onDirtyChange={() => {}}
          onSelectionChange={setSelectedEl}
          registerSaveHandler={registerSaveHandler}
          registerCanvasApi={registerCanvasApi}
          onBeforeDelete={handleBeforeDelete}
          toolbarExtra={(
            <>
              {model.level === 2 && (
                // Fitur mandiri Peta Relasi: tampilkan dokumen formal. Pengisian
                // datanya tetap lewat properties "Kegiatan & Peta Relasi".
                <button
                  onClick={() => { loadKegiatanList(); setShowRelasiView(true); }}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-all"
                >
                  🗺 Lihat Peta Relasi
                </button>
              )}
              <button
                onClick={handleDownloadPdf}
                disabled={pdfDownloading}
                title="Unduh PDF ukuran F4 (menyimpan diagram terlebih dahulu)"
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition-all disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" /> {pdfDownloading ? 'Membuat…' : 'Unduh PDF'}
              </button>
            </>
          )}
        />
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
        {model.level === 0
          ? <>Pilih <b>Sub-Proses</b> → <b>Properti Sub-Proses</b> untuk mengisi kode &amp; unit pengampu (menjadi peta Level 1). Sub-proses yang digambar <b>di dalam</b> kotak ber-properti otomatis menjadi <b>Level 2 bernomor otomatis</b> (mis. 01.03 → 01.03.01) dan kanvas peta Level 1 terisi sendiri saat <b>Simpan Alur</b>.</>
          : model.level === 1
          ? <>Kotak sub-proses di peta ini tertaut ke peta Level 2 — pilih kotak → <b>Properti Sub-Proses</b> untuk mengisi Unit Kerja Level 2 atau membukanya. Sub-proses baru yang digambar di sini otomatis menjadi Level 2 bernomor otomatis saat <b>Simpan Alur</b>.</>
          : <>Gambar <b>sub-proses kegiatan</b> di kanvas ini (mis. Penetapan HGU) — bernomor otomatis saat <b>Simpan Alur</b>. Lalu pilih kotaknya → <b>Kegiatan &amp; Peta Relasi</b> untuk mengisi lembaga terkait dan <b>Daftar Proses Level 3</b> (otomatis masuk Daftar Usulan BPMN).</>}
      </div>

      {/* Modal Properti Sub-Proses (integrasi Level N → N+1) */}
      {showProps && selectedEl && (
        <div className="fixed inset-0 z-300 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowProps(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-bold text-slate-800">Properti Sub-Proses · Level {model.level}</h3>
              <button onClick={() => setShowProps(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            {propsLoading ? (
              <div className="p-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Nama Proses</label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                    {selectedEl.name || <span className="italic text-slate-400">tanpa nama — klik-ganda elemen di kanvas untuk menamai</span>}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Nama ini otomatis menjadi judul Peta Level {model.level + 1} turunannya.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Nomor / Kode Proses Bisnis</label>
                  <input value={propsForm.kode} onChange={e => setPropsForm(f => ({ ...f, kode: e.target.value }))}
                    placeholder={model.level === 0 ? 'mis. 01.03' : 'mis. 01.03.01'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono focus:border-blue-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">{unitLabel}</label>
                  <select value={propsForm.unit} onChange={e => setPropsForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white focus:border-blue-400 focus:outline-none">
                    <option value="">-- Pilih Unit Kerja --</option>
                    {unitOptions.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {model.level === 1 && unitOptions.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">Peta ini belum punya Unit Kerja L1 (atur dari properti sub-proses di peta Level 0 induknya), sehingga daftar Unit L2 kosong.</p>
                  )}
                </div>
                {childMap && (
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-700">
                    Peta Level {model.level + 1} turunan sudah ada: <b>{childMap.process_title}</b>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button
                onClick={async () => {
                  // Auto-save diagram induk dulu agar sub-process yang baru digambar tidak hilang.
                  await saveDiagramRef.current?.();
                  const c = await savePropsAndLink();
                  if (c) router.push(`/peta-proses-bisnis/studio?id=${c.id}`);
                }}
                disabled={propsSaving || propsLoading}
                className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                <ArrowUpRight className="w-4 h-4" /> {childMap ? 'Buka' : 'Buat & Buka'} Peta Level {model.level + 1}
              </button>
              <button onClick={async () => { await saveDiagramRef.current?.(); const c = await savePropsAndLink(); if (c) setShowProps(false); }} disabled={propsSaving || propsLoading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-300">
                {propsSaving ? 'Menyimpan…' : 'Simpan Properti'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kegiatan (L2): Peta Relasi + Daftar Proses Level 3 → usulan BPMN */}
      {showKegiatan && (
        <div className="fixed inset-0 z-300 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowKegiatan(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-800">Kegiatan · {kegiatan?.process_title || selectedEl?.name || 'Tanpa Nama'}</h3>
                {kegiatan?.kode && <p className="font-mono text-xs font-bold text-violet-600 mt-0.5">{kegiatan.kode} · {kegiatan.unit_l2 || kegiatan.unit_l1 || 'tanpa unit'}</p>}
              </div>
              <button onClick={() => setShowKegiatan(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            {kegiatanLoading ? (
              <div className="p-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : !kegiatan ? (
              <div className="p-6 text-sm text-slate-500">Kegiatan belum terdaftar — beri nama sub-proses lalu tekan <b>Simpan Alur</b> terlebih dahulu.</div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Peta Relasi */}
                <section className="rounded-2xl border border-slate-200 p-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-1">Peta Relasi</h4>
                  <p className="text-[11px] text-slate-400 mb-3">Lembaga/instansi yang terlibat agar kegiatan ini menghasilkan output. Ketik lalu tekan Enter.</p>
                  <div className="space-y-3">
                    <ChipEditor label="🏛️ Internal ATR/BPN" color="text-cyan-700" values={relasiInternal} onChange={setInternal} placeholder="mis. Ditjen SPPR, Kanwil BPN…" />
                    <ChipEditor label="🌐 Eksternal" color="text-amber-700" values={relasiEksternal} onChange={setEksternal} placeholder="mis. Pemerintah Daerah, K/L…" />
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    {relasiSaved && <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan</span>}
                    <button onClick={saveRelasi} disabled={relasiSaving} className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-700 disabled:bg-slate-300">
                      {relasiSaving ? 'Menyimpan…' : 'Simpan Peta Relasi'}
                    </button>
                  </div>
                </section>

                {/* Daftar Proses Level 3 */}
                <section className="rounded-2xl border border-slate-200 p-4">
                  <h4 className="text-sm font-bold text-slate-700 mb-1">Daftar Proses — Level 3 (Peta Lintas Fungsi)</h4>
                  <p className="text-[11px] text-slate-400 mb-3">Setiap proses otomatis masuk <b>Daftar Usulan</b> di menu Buat Proses Bisnis (BPMN), dengan unit kerja &amp; nomor mengikuti kegiatan ini.</p>
                  <div className="space-y-1.5 mb-3">
                    {l3List.length === 0 && <p className="text-xs italic text-slate-400">Belum ada proses.</p>}
                    {l3List.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        {p.probis_kode && <span className="font-mono text-[10px] font-bold text-violet-600 shrink-0">{p.probis_kode}</span>}
                        <span className="text-sm font-semibold text-slate-700 truncate flex-1">{p.process_title}</span>
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${p.status === 'usulan' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span>
                        <button onClick={() => askDeleteL3(p)} title="Hapus usulan" className="text-slate-300 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newProc} onChange={e => setNewProc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addL3Process(); } }}
                      placeholder="mis. Pemberian Hak Guna Usaha…"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                    <button onClick={addL3Process} disabled={addingProc || !newProc.trim()}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:bg-slate-300">
                      <Plus className="w-4 h-4" /> Tambah
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal peringatan hapus proses L3 (di atas modal kegiatan) */}
      {deleteProc && (
        <div className="fixed inset-0 z-400 flex items-center justify-center bg-black/40 p-4" onClick={() => !deletingProc && setDeleteProc(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
              <div className="p-2 rounded-xl bg-red-50 text-red-600"><Trash2 className="w-5 h-5" /></div>
              <h3 className="font-bold text-slate-800">Hapus Proses Level 3?</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-xl border border-slate-200 px-3.5 py-2.5">
                {deleteProc.probis_kode && <span className="font-mono text-xs font-bold text-violet-600 mr-2">{deleteProc.probis_kode}</span>}
                <span className="text-sm font-bold text-slate-800">{deleteProc.process_title}</span>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 space-y-1">
                <p className="font-bold">Yang ikut terhapus:</p>
                <p>• Entri di <b>Daftar Usulan</b> menu Buat Proses Bisnis (BPMN)</p>
                {deleteProc.probis_element_id && <p>• <b>Kotak sub-proses</b>-nya di kanvas peta ini</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDeleteProc(null)} disabled={deletingProc} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">Batal</button>
              <button onClick={confirmDeleteL3} disabled={deletingProc} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300">
                {deletingProc ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tampilan formal PETA RELASI — dokumen lembar penuh sesuai format resmi */}
      {showRelasiView && model.level === 2 && (
        <div className="fixed inset-0 z-300 overflow-y-auto bg-black/50 p-4 sm:p-8" onClick={() => setShowRelasiView(false)}>
          <div className="relative mx-auto max-w-5xl bg-white p-6 font-serif text-slate-900 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowRelasiView(false)}
              className="absolute right-3 top-3 rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 font-sans">
              <X className="w-4 h-4" />
            </button>
            <div className="border-2 border-slate-900">
              {/* Kepala dokumen */}
              <div className="border-b-2 border-slate-900 px-4 py-3 text-center">
                <p className="text-sm font-bold tracking-wide">PETA RELASI</p>
                <p className="text-sm font-bold tracking-wide">ATR/BPN {model.kode || ''}</p>
                <p className="text-sm font-bold uppercase tracking-wide">{model.process_title}</p>
              </div>
              {/* Kolom per kegiatan */}
              <div className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${Math.min(kegiatanList.length, 3)}, minmax(0, 1fr))` }}>
                {kegiatanList.map(k => {
                  let ri: string[] = [], re: string[] = [];
                  try { ri = JSON.parse(k.relasi_internal || '[]'); } catch { /* abaikan */ }
                  try { re = JSON.parse(k.relasi_eksternal || '[]'); } catch { /* abaikan */ }
                  const boxes = [...ri, ...re];
                  return (
                    <div key={k.id} className="border border-slate-900">
                      <div className="border-b border-slate-900 px-2 py-2 text-center">
                        <p className="text-[11px] font-bold">ATR/BPN {k.kode || ''}</p>
                        <p className="text-[11px] leading-snug">{k.process_title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 p-2.5">
                        {boxes.length === 0 ? (
                          <p className="col-span-2 py-6 text-center text-[10px] italic text-slate-400 font-sans">belum diisi — pilih kotak kegiatan di kanvas lalu isi lewat <b>Kegiatan &amp; Peta Relasi</b></p>
                        ) : boxes.map((b, i) => (
                          <div key={`${b}-${i}`} className="flex min-h-11 items-center justify-center border border-slate-900 px-1.5 py-1 text-center text-[10px] leading-tight">
                            {b}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PetaStudioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Memuat…</div>}>
      <StudioInner />
    </Suspense>
  );
}
