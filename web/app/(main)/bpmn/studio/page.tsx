"use client";

import dynamic from 'next/dynamic';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppContext } from '@/lib/app-context';
import SearchableSelect from '@/components/SearchableSelect';
import {
  ArrowLeft, GitBranch, X, Image as ImageIcon, FileText,
  AlertCircle, MessageSquare, Pencil, Lock, Send, FolderOpen, FileCode
} from 'lucide-react';
import { HIERARKI_UNIT } from '@/lib/constants';
import type { BpmnCanvasApi } from '@/components/BPMNModeler';

const Modeler = dynamic(() => import('@/components/BPMNModeler'), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Memuat BPMN Studio...</div>
});

const Viewer = dynamic(() => import('@/components/BPMNViewer'), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Memuat diagram...</div>
});

const API_BASE = '/e-sop-atrbpn/api';

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.replace('/e-sop-atrbpn/login?expired=1');
    throw new Error('Sesi berakhir, silakan login kembali');
  }
  return res;
}

interface BPMNModel {
  id: number; process_title: string; process_key: string; l1_id: number | null; l2_id: number | null;
  description: string | null; bpmn_xml: string | null; svg_xml: string | null;
  status: string; catatan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
}

const JENIS_PROSES_OPTIONS = ['Pusat', 'Kantor Wilayah', 'Kantor Pertanahan'] as const;
const KLASIFIKASI_OPTIONS = [
  'Layanan Administrasi Pemerintah',
  'Layanan Pertanahan',
  'Layanan Tata Ruang',
  'Layanan Pengaduan dan Informasi',
  'Layanan Data, Keamanan, dan Infrastruktur',
] as const;

function BPMNStudioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get('id');

  const mode = searchParams.get('mode');

  const [token, setToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{id: number, username: string, role: string, unit_l1?: string, unit_l2?: string} | null>(null);

  const [unitL1List, setUnitL1List] = useState<{id: number, nama: string}[]>([]);
  const [unitL2List, setUnitL2List] = useState<{id: number, nama: string}[]>([]);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({ processTitle: '', processKey: '', orgUnitL1: '', orgUnitL2: '', description: '', jenisProses: '', klasifikasiProses: '' });

  const [currentModel, setCurrentModel] = useState<BPMNModel | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  // Mode baca bila dibuka via ?mode=view ATAU dokumen sudah dalam penetapan/ditetapkan (terkunci).
  const isViewOnly = mode === 'view' || ['penetapan', 'approved'].includes(currentModel?.status || '');

  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isEditingDocInfo, setIsEditingDocInfo] = useState(false);
  const { isDarkMode } = useAppContext();

  const [currentXml, setCurrentXml] = useState<string>("");
  const [currentSvg, setCurrentSvg] = useState<string>("");
  // API kanvas imperatif (impor .bpmn) + input file tersembunyi utk "Buka .bpmn".
  const canvasApiRef = useRef<BpmnCanvasApi | null>(null);
  const bpmnFileInputRef = useRef<HTMLInputElement | null>(null);
  // SVG tiap plane Sub-Proses yang sudah punya isi — untuk pilihan "sertakan sub-proses" saat unduh.
  const [subPlaneSvgs, setSubPlaneSvgs] = useState<{ id: string; name: string; svg: string; depth?: number; path?: string[] }[]>([]);
  const [exportChecked, setExportChecked] = useState<Record<string, boolean>>({});
  // Popup pilihan sub-proses; muncul saat klik unduh PDF/SVG bila ada sub-proses yang sudah digambar.
  const [exportPick, setExportPick] = useState<null | 'pdf' | 'svg'>(null);
  // The XML used to initialise the BPMN canvas. Only updated when loading a
  // document from the API — NOT after saves — so the canvas never reinitialises
  // mid-session just because currentModel.bpmn_xml changed.
  const [initialXml, setInitialXml] = useState<string | undefined>(undefined);
  // Tracks the ID of a document just saved for the first time so we can skip
  // the redundant re-fetch triggered by router.replace('/bpmn/studio?id=...')
  const justSavedIdRef = useRef<number | null>(null);

  const [unitTree, setUnitTree] = useState<{id: string; nama: string; children: {id: string; nama: string; children: unknown[]}[]}[]>([]);
  const l1Options = unitTree.length ? unitTree.map(n => n.nama) : Object.keys(HIERARKI_UNIT);
  const l2Options = config.orgUnitL1
    ? (unitTree.find(n => n.nama === config.orgUnitL1)?.children.map(c => c.nama) ?? (HIERARKI_UNIT[config.orgUnitL1] ? Object.keys(HIERARKI_UNIT[config.orgUnitL1]) : []))
    : [];

  useEffect(() => {
    if (!token) return;
    fetch(`/e-sop-atrbpn/api/unit-kerja/tree`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setUnitTree(d); }).catch(() => {});
  }, [token]);

  useEffect(() => {
    const initAuth = async () => {
      const tok = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!tok || !userStr) { router.replace('/login'); return; }
      try {
        const parsedUser = JSON.parse(userStr);
        // Superadmin = superset admin: berlaku seperti admin di seluruh halaman ini.
        if (parsedUser.role === 'superadmin') parsedUser.role = 'admin';
        setCurrentUser(parsedUser);
        setToken(tok);
      } catch {
        router.replace('/login');
      }
    };
    initAuth();
  }, [router]);

  useEffect(() => {
    if (!token) return;
    apiFetch('/unit-kerja/l1', token).then(r => r.json()).then(data => setUnitL1List(Array.isArray(data) ? data : []));

    setIsLoadingDocument(true);

    if (documentId) {
      // After first-time save, router.replace fires this effect with the new ID.
      // We already have the model from the save response — skip the redundant fetch
      // so the Modeler never unmounts and the diagram stays intact.
      const docIdNum = parseInt(documentId, 10);
      if (!isNaN(docIdNum) && justSavedIdRef.current === docIdNum) {
        justSavedIdRef.current = null;
        setIsLoadingDocument(false);
        return;
      }

      apiFetch(`/bpmn/models/${documentId}`, token)
        .then(r => {
          if (!r.ok) throw new Error("Data tidak ditemukan");
          return r.json();
        })
        .then((data: BPMNModel) => {
          setCurrentModel(data);
          setInitialXml(data.bpmn_xml || undefined);
          setConfig({
            processTitle: data.process_title,
            processKey: data.process_key || '',
            orgUnitL1: data.unit_l1 || '',
            orgUnitL2: data.unit_l2 || '',
            description: data.description || '',
            jenisProses: data.jenis_proses || '',
            klasifikasiProses: data.klasifikasi_proses || '',
          });
          setHasUnsavedChanges(false);
          // Usulan (baru dilanjutkan) → tampilkan modal info dulu sebelum menyusun.
          if (data.status === 'usulan') setShowConfigModal(true);
        })
        .catch(err => {
          console.error(err);
          alert("Dokumen tidak ditemukan atau Anda tidak memiliki akses.");
          router.replace('/bpmn');
        })
        .finally(() => setIsLoadingDocument(false));
    } else {
      // Dokumen baru — bersihkan semua state sebelumnya
      setCurrentModel(null);
      setInitialXml(undefined);
      const prefillL1 = currentUser?.role === 'user' ? (currentUser.unit_l1 || '') : '';
      setConfig({ processTitle: '', processKey: '', orgUnitL1: prefillL1, orgUnitL2: '', description: '', jenisProses: '', klasifikasiProses: '' });
      setCurrentXml("");
      setCurrentSvg("");
      setSubPlaneSvgs([]);
      setExportChecked({});
      setHasUnsavedChanges(false);
      setIsLoadingDocument(false);
      if (!isViewOnly) setShowConfigModal(true);
    }
  }, [token, documentId, router, isViewOnly, currentUser]);

  useEffect(() => {
    if (config.orgUnitL1) {
      const l1 = unitL1List.find(u => u.nama === config.orgUnitL1);
      if (l1) apiFetch(`/unit-kerja/l2?l1_id=${l1.id}`, token).then(r => r.json()).then(data => setUnitL2List(Array.isArray(data) ? data : []));
    } else setUnitL2List([]);
  }, [config.orgUnitL1, unitL1List, token]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedModal(true);
    } else {
      router.push('/bpmn');
    }
  };

  const validateConfig = () => {
    if (!config.processTitle.trim() || !config.orgUnitL1) {
      alert("Harap lengkapi kolom yang bertanda bintang (*): Judul Proses dan Unit Kerja Level 1.");
      return false;
    }
    return true;
  };

  const handleStartModeling = () => {
    if (validateConfig()) setShowConfigModal(false);
  };

  const handleModelerSave = (xml: string, svg: string, subSvgs?: { id: string; name: string; svg: string; depth?: number; path?: string[] }[]) => {
    setCurrentXml(xml);
    setCurrentSvg(svg);
    const subs = subSvgs || [];
    setSubPlaneSvgs(subs);
    // Default: semua sub-proses yang sudah digambar ikut diunduh (bisa di-uncheck).
    setExportChecked(Object.fromEntries(subs.map(s => [s.id, true])));
    setShowSaveModal(true);
  };

  const checkedSubPlanes = subPlaneSvgs.filter(s => exportChecked[s.id]);
  const slugName = (s: string) => s.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-') || 'Sub-Proses';

  const handleDownloadSVG = async () => {
    if (!currentSvg) return alert('Data SVG kosong.');
    const baseName = config.processKey || config.processTitle || 'BPMN';
    const downloadOne = (svg: string, filename: string) => {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    downloadOne(currentSvg, `${baseName}.svg`);
    for (const sub of checkedSubPlanes) {
      // Jeda kecil agar browser tidak menggabungkan/memblokir unduhan beruntun.
      await new Promise(r => setTimeout(r, 400));
      // Sertakan jalur bersarang pada nama file agar sub-sub-proses tidak bertabrakan.
      const label = sub.path && sub.path.length > 1 ? sub.path.map(slugName).join(' - ') : slugName(sub.name);
      downloadOne(sub.svg, `${baseName} - ${label}.svg`);
    }
  };

  // Unduh diagram sebagai file BPMN 2.0 (.bpmn) untuk disimpan/diedit lokal.
  const handleDownloadBpmn = () => {
    if (!currentXml) return alert('Belum ada diagram untuk diunduh.');
    const blob = new Blob([currentXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${config.processKey || config.processTitle || 'diagram'}.bpmn`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // Buka/impor file .bpmn (BPMN 2.0) dari komputer ke kanvas studio ini.
  const handleOpenBpmnFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(bpmn|xml)$/i.test(file.name)) { alert('Pilih file berformat .bpmn (BPMN 2.0).'); return; }
    let text = '';
    try { text = await file.text(); } catch { alert('Gagal membaca file.'); return; }
    if (!/<(\w+:)?definitions/i.test(text)) { alert('File tidak dikenali sebagai BPMN 2.0 yang valid.'); return; }
    if (currentXml && !window.confirm('Membuka file ini akan MENGGANTI diagram yang sedang tampil. Lanjutkan?')) return;
    const api = canvasApiRef.current;
    if (!api?.importXml) { alert('Kanvas belum siap. Coba lagi sebentar.'); return; }
    const ok = await api.importXml(text);
    if (!ok) { alert('Gagal membuka diagram — pastikan file BPMN 2.0 benar dan tidak rusak.'); return; }
    setHasUnsavedChanges(true);
  };

  // PDF VEKTOR: SVG dikirim ke server (Chrome headless) supaya teks tetap bisa
  // diseleksi/di-blok — bukan lagi raster PNG. Header rapi & diagram menempel di
  // bawah header (tidak lagi terpusat vertikal yang menyisakan jarak besar).
  const handleDownloadPDF = async () => {
    if (!currentSvg) return alert('Data SVG kosong.');
    try {
      const title = config.processTitle || 'Dokumen BPMN';
      const pages = [
        { svg: currentSvg, label: 'PROSES BISNIS', judul: title },
        ...checkedSubPlanes.map(s => {
          // depth 0 = sub-proses; depth ≥ 1 = sub-proses di dalam sub-proses (berjenjang).
          const level = (s.depth || 0) + 1;
          const label = level > 1 ? `SUB-PROSES LV.${level} — ${title.toUpperCase()}` : `SUB-PROSES — ${title.toUpperCase()}`;
          // Judul memakai jalur breadcrumb ("Induk › Anak") agar posisinya jelas.
          const judul = s.path && s.path.length > 1 ? s.path.join(' › ') : s.name;
          return { svg: s.svg, label, judul };
        }),
      ];
      const res = await apiFetch('/bpmn/pdf', token, {
        method: 'POST',
        body: JSON.stringify({
          title,
          unit1: config.orgUnitL1 || '',
          unit2: config.orgUnitL2 || '',
          filename: config.processKey || config.processTitle || 'BPMN',
          pages,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); throw new Error(e.error || 'Gagal membuat PDF'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${config.processKey || config.processTitle || 'BPMN'}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (error) {
      console.error(error);
      alert('Gagal membuat PDF: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const executeSaveToDB = async (targetStatus: string = 'draft') => {
    if (!validateConfig()) return;
    setIsSaving(true);
    try {
      const l1_id = unitL1List.find(u => u.nama === config.orgUnitL1)?.id || null;
      const l2_id = unitL2List.find(u => u.nama === config.orgUnitL2)?.id || null;

      const modelData = {
        process_title: config.processTitle,
        process_key: config.processKey || null,
        l1_id, l2_id,
        unit_l1: config.orgUnitL1,
        unit_l2: config.orgUnitL2,
        description: config.description || null,
        // Fallback ke XML/SVG yang sudah ada di DB jika belum ada perubahan diagram
        bpmn_xml: currentXml || currentModel?.bpmn_xml || '',
        svg_xml: currentSvg || currentModel?.svg_xml || '',
        status: targetStatus,
        jenis_proses: config.jenisProses || null,
        klasifikasi_proses: config.klasifikasiProses || null,
      };

      let response;
      if (currentModel?.id) {
        response = await apiFetch(`/bpmn/models/${currentModel.id}`, token, {
          method: 'PUT',
          body: JSON.stringify(modelData)
        });
      } else {
        response = await apiFetch('/bpmn/models', token, {
          method: 'POST',
          body: JSON.stringify(modelData)
        });
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Server error ${response.status}: ${errBody || 'Tidak ada detail.'}`);
      }

      const savedBpmn = await response.json();
      if (!documentId) {
        // Mark this ID so the useEffect triggered by router.replace below
        // can skip the redundant fetch (the model is already in memory).
        justSavedIdRef.current = savedBpmn.id;
      }
      setCurrentModel(savedBpmn);
      setShowSaveModal(false);
      setHasUnsavedChanges(false);
      alert(`Sukses! Dokumen disimpan sebagai ${targetStatus.toUpperCase()}`);

      if (!documentId) {
          router.replace(`/bpmn/studio?id=${savedBpmn.id}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Gagal menyimpan: ${err instanceof Error ? err.message : 'Kesalahan tidak diketahui.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveMetadataOnly = async () => {
    if (!validateConfig()) return;
    if (!currentModel?.id) {
      // Dokumen baru belum disimpan — tutup modal saja, mark dirty
      setShowConfigModal(false);
      setIsEditingDocInfo(false);
      return;
    }
    try {
      const l1_id = unitL1List.find(u => u.nama === config.orgUnitL1)?.id || null;
      const l2_id = unitL2List.find(u => u.nama === config.orgUnitL2)?.id || null;
      const res = await apiFetch(`/bpmn/models/${currentModel.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          process_title: config.processTitle,
          process_key: config.processKey || null,
          l1_id, l2_id,
          description: config.description || null,
          jenis_proses: config.jenisProses || null,
          klasifikasi_proses: config.klasifikasiProses || null,
          bpmn_xml: currentModel.bpmn_xml || '',
          svg_xml: currentModel.svg_xml || '',
          status: currentModel.status || 'draft',
        }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(e); }
      const updated = await res.json();
      setCurrentModel(updated);
      setShowConfigModal(false);
      setIsEditingDocInfo(false);
    } catch (err) {
      alert(`Gagal menyimpan info: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  if (!token || !currentUser) return null;

  return (
    /* h-[calc(100vh-4rem)] = viewport minus shared header (h-16 = 4rem) */
    <div className={`flex flex-col h-[calc(100vh-4rem)] font-sans overflow-hidden ${isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'}`}>

      {/* Studio toolbar */}
      <div className="h-14 border-b flex items-center justify-between px-4 z-10 shrink-0 overflow-hidden" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <button onClick={handleBack} className="py-2.5 px-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center text-sm font-medium gap-2">
            <ArrowLeft className="w-4 h-4" /> Kembali
            {hasUnsavedChanges && <span className="w-2 h-2 rounded-full bg-orange-400" title="Ada perubahan belum disimpan" />}
          </button>

          <div className="h-6 w-px bg-slate-300 mx-2"></div>

          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="w-5 h-5 text-blue-600 shrink-0" />
            <h1 className="text-lg font-bold shrink-0">Studio Editor</h1>
            {config.processTitle && (
              <span className={`ml-1 sm:ml-3 px-3 py-1 rounded-md text-sm font-extrabold shadow-sm flex items-center gap-2 max-w-25 sm:max-w-xs truncate ${isDarkMode ? 'bg-slate-800 text-blue-300' : 'bg-blue-100 text-[#002855]'}`}>
                <span className="truncate">{config.processTitle}</span>
                {isViewOnly && <span className="text-red-500 font-bold ml-2 shrink-0">(Mode Baca)</span>}
                {currentModel?.status && (
                    <span className={`shrink-0 ml-2 px-1.5 py-0.5 rounded text-[11px] sm:text-xs uppercase tracking-wide border ${
                        currentModel.status === 'approved' ? 'bg-emerald-500 text-white border-emerald-600' :
                        currentModel.status === 'pending' ? 'bg-blue-500 text-white border-blue-600' :
                        currentModel.status === 'rejected' ? 'bg-red-500 text-white border-red-600' :
                        'bg-slate-500 text-white border-slate-600'
                    }`}>{currentModel.status}</span>
                )}
              </span>
            )}
            {!isViewOnly && (
              <button
                onClick={() => { setIsEditingDocInfo(true); setShowConfigModal(true); }}
                title="Edit Informasi Dokumen"
                className={`shrink-0 p-2.5 min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isViewOnly && (
            <div className="flex items-center gap-2 shrink-0">
              <input ref={bpmnFileInputRef} type="file" accept=".bpmn,.xml" onChange={handleOpenBpmnFile} className="hidden" />
              <button
                onClick={() => bpmnFileInputRef.current?.click()}
                title="Buka file .bpmn (BPMN 2.0) dari komputer"
                className={`py-2.5 px-3 rounded-lg text-sm font-medium flex items-center gap-2 border transition-colors ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
              >
                <FolderOpen className="w-4 h-4" /> <span className="hidden sm:inline">Buka .bpmn</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 w-full h-full bg-white relative">
            {!isLoadingDocument && isViewOnly && currentModel && (
                <Viewer xml={initialXml} />
            )}
            {!isLoadingDocument && !isViewOnly && (currentModel || (config.processTitle && !documentId)) && (
                <Modeler
                  xml={initialXml}
                  projectName={config.processTitle}
                  onSave={handleModelerSave}
                  isViewOnly={false}
                  onDirtyChange={setHasUnsavedChanges}
                  registerCanvasApi={(api) => { canvasApiRef.current = api; }}
                />
            )}

            {currentModel?.status === 'rejected' && currentModel?.catatan && (
              <div className="absolute bottom-24 right-4 z-50 w-87.5 max-w-[calc(100vw-2rem)] bg-white border-l-4 border-l-red-500 shadow-2xl rounded-2xl p-5 animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-red-50 rounded-xl text-red-600 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> Catatan Revisi
                    </h4>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed bg-red-50/50 p-3 rounded-lg border border-red-100 whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto">
                      &quot;{currentModel.catatan}&quot;
                    </p>
                    {!isViewOnly && (
                      <p className="text-[10px] sm:text-xs text-slate-400 mt-2 italic font-medium leading-tight">
                        *Catatan otomatis hilang jika Anda Save Draft.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>

      {showConfigModal && !isViewOnly && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl shadow-2xl p-6 border" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold">{isEditingDocInfo ? 'Edit Informasi Dokumen' : 'Informasi Dokumen Baru'}</h3>
                {isEditingDocInfo && currentModel?.id && (
                  <p className="text-xs text-slate-400 mt-1">ID #{currentModel.id} · Perubahan akan langsung disimpan</p>
                )}
              </div>
              <button onClick={() => { setShowConfigModal(false); setIsEditingDocInfo(false); if (!isEditingDocInfo) router.push('/bpmn'); }} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            {!isEditingDocInfo && <p className="text-sm text-slate-500 mb-6">Lengkapi data di bawah ini sebelum mulai mendesain diagram Proses Bisnis.</p>}

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-bold mb-1">Judul Proses <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: Penyusunan Rencana Kerja" value={config.processTitle} onChange={(e) => setConfig({ ...config, processTitle: e.target.value })} className="w-full px-4 py-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Kode Proses <span className="text-xs font-normal text-slate-400">(opsional)</span></label>
                <input type="text" placeholder="Contoh: SOP-PRC-01" value={config.processKey} onChange={(e) => setConfig({ ...config, processKey: e.target.value.toUpperCase().replace(/\s/g, '_') })} className="w-full px-4 py-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold mb-1">Jenis Proses (Kewenangan)</label>
                  <select value={config.jenisProses} onChange={(e) => setConfig({ ...config, jenisProses: e.target.value })} className="w-full px-3 py-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc', color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>
                    <option value="">-- Pilih --</option>
                    {JENIS_PROSES_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1">Klasifikasi Proses</label>
                  <select value={config.klasifikasiProses} onChange={(e) => setConfig({ ...config, klasifikasiProses: e.target.value })} className="w-full px-3 py-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc', color: isDarkMode ? '#e2e8f0' : '#1e293b' }}>
                    <option value="">-- Pilih --</option>
                    {KLASIFIKASI_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">
                  Unit Kerja Utama (Level 1) <span className="text-red-500">*</span>
                  {currentUser?.role === 'user' && (
                    <span className={`ml-2 text-[10px] font-normal inline-flex items-center gap-0.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      <Lock className="w-2.5 h-2.5" /> dikunci sesuai profil
                    </span>
                  )}
                </label>
                {currentUser?.role === 'user' ? (
                  <div className="w-full px-4 py-2.5 text-sm border rounded-xl flex items-center gap-2" style={{ borderColor: isDarkMode ? '#047857' : '#6ee7b7', backgroundColor: isDarkMode ? '#0F172A' : '#ecfdf5', color: isDarkMode ? '#94a3b8' : '#374151' }}>
                    <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-medium truncate">{config.orgUnitL1 || '-'}</span>
                  </div>
                ) : (
                  <SearchableSelect
                    options={l1Options}
                    value={config.orgUnitL1}
                    onChange={v => setConfig({ ...config, orgUnitL1: v, orgUnitL2: '' })}
                    placeholder="Cari dan pilih unit utama..."
                    dm={isDarkMode}
                  />
                )}
              </div>
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Unit (Level 2)</label>
                <select value={config.orgUnitL2} onChange={(e) => setConfig({ ...config, orgUnitL2: e.target.value })} disabled={!config.orgUnitL1} className={`w-full px-4 py-3 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                  <option value="">-- Tidak Ada / Kosong --</option>
                  {l2Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
              <button
                onClick={() => { setShowConfigModal(false); setIsEditingDocInfo(false); if (!isEditingDocInfo) router.push('/bpmn'); }}
                className="px-5 py-3 text-sm font-bold border rounded-xl hover:bg-slate-50 transition-colors"
                style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db' }}
              >
                {isEditingDocInfo ? 'Tutup' : 'Batal'}
              </button>
              {isEditingDocInfo ? (
                <button onClick={saveMetadataOnly} className="px-6 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> Simpan Perubahan
                </button>
              ) : (
                <button onClick={handleStartModeling} className="px-6 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors flex items-center gap-2">
                  Buka Kanvas <ArrowLeft className="w-4 h-4 rotate-180" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showUnsavedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 border" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
            <h3 className="text-lg font-bold mb-2">Perubahan Belum Disimpan</h3>
            <p className="text-sm text-slate-500 mb-6">Diagram ini memiliki perubahan yang belum disimpan ke database. Apakah Anda yakin ingin meninggalkan halaman?</p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <button onClick={() => setShowUnsavedModal(false)} className="flex-1 px-4 py-3 text-sm font-bold border rounded-xl hover:bg-slate-50 transition-colors" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db' }}>
                Batal
              </button>
              <button onClick={() => { setShowUnsavedModal(false); router.push('/bpmn'); }} className="flex-1 px-4 py-3 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">
                Keluar Tanpa Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-60 p-0 sm:p-4" onClick={() => setShowSubmitModal(false)}>
          <div
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200"
            style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className={`p-2.5 rounded-xl shrink-0 ${isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold" style={{ color: isDarkMode ? '#f1f5f9' : '#002855' }}>Ajukan ke Biro Ortala MR?</h3>
                  <p className="text-sm mt-1" style={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                    Dokumen Proses Bisnis ini akan disimpan lalu dikirim ke Biro Ortala MR untuk ditinjau. Pastikan seluruh data sudah benar sebelum melanjutkan.
                  </p>
                </div>
              </div>
              <div className={`rounded-xl px-4 py-3 text-sm mb-5 border ${isDarkMode ? 'bg-blue-900/10 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                Setelah diajukan, dokumen tidak dapat diubah hingga Admin Ortala MR memberikan keputusan.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-bold border rounded-xl transition-colors"
                  style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', color: isDarkMode ? '#cbd5e1' : '#374151' }}
                >
                  Batal
                </button>
                <button
                  onClick={() => { setShowSubmitModal(false); executeSaveToDB('pending'); }}
                  className="flex-1 px-4 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" /> Ya, Ajukan Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && !isViewOnly && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl p-6 border" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
            <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
              <h3 className="text-xl font-bold">Simpan Dokumen Proses Bisnis</h3>
              <button onClick={() => setShowSaveModal(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
              <div className="space-y-4">
                <div className="mb-2">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Ekspor File</p>
                  <p className="text-xs text-slate-400">Unduh gambar ke komputer Anda.</p>
                </div>
                <button onClick={() => subPlaneSvgs.length > 0 ? setExportPick('pdf') : handleDownloadPDF()} className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl flex items-center justify-center border border-red-200 transition-colors shadow-sm">
                  <FileText className="w-5 h-5 mr-2" /> Format PDF (F4)
                </button>
                <button onClick={() => subPlaneSvgs.length > 0 ? setExportPick('svg') : handleDownloadSVG()} className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl flex items-center justify-center border border-orange-200 transition-colors shadow-sm">
                  <ImageIcon className="w-5 h-5 mr-2" /> Format Gambar SVG
                </button>
                <button onClick={handleDownloadBpmn} className="w-full px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl flex items-center justify-center border border-indigo-200 transition-colors shadow-sm">
                  <FileCode className="w-5 h-5 mr-2" /> Format BPMN 2.0 (.bpmn)
                </button>
                <p className="text-[11px] text-slate-400 leading-snug">File .bpmn dapat dibuka kembali di studio ini (tombol <b>Buka .bpmn</b>) atau di aplikasi BPMN lain.</p>
              </div>

              <div className="space-y-4 flex flex-col md:border-l md:pl-8" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
                <div className="mb-2">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Simpan ke Server</p>
                  <p className="text-xs text-slate-400">Pilih tindakan untuk sistem database.</p>
                </div>

                <div className="p-4 rounded-xl border bg-slate-50 text-sm mb-2" style={{ borderColor: isDarkMode ? '#374151' : '#e5e7eb', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }}>
                  <p className="font-bold text-[#002855] mb-1 truncate">{config.processTitle}</p>
                  <div className="flex items-center text-xs mt-2">
                    <span className="text-slate-500">Status Sistem:</span>
                    <span className={`ml-2 px-2 py-0.5 rounded uppercase font-bold border ${
                        currentModel?.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        currentModel?.status === 'pending' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        currentModel?.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                        'bg-slate-200 text-slate-700 border-slate-300'
                    }`}>
                      {currentModel?.status || 'BELUM TERSIMPAN'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-auto">
                  <button
                    onClick={() => executeSaveToDB('draft')}
                    disabled={isSaving || currentModel?.status === 'approved'}
                    className="w-full px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                  >
                    Simpan Draft Sementara
                  </button>
                  <button
                    onClick={() => { setShowSaveModal(false); setShowSubmitModal(true); }}
                    disabled={isSaving || currentModel?.status === 'approved' || currentModel?.status === 'pending'}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                  >
                    Ajukan ke Ortala MR (Final)
                  </button>
                </div>

                {currentModel?.status === 'approved' && (
                  <p className="text-xs text-emerald-600 font-bold text-center mt-2 bg-emerald-50 py-2 rounded-lg">
                    Dokumen ini telah disetujui. Tidak dapat diubah.
                  </p>
                )}
                {currentModel?.status === 'pending' && (
                  <p className="text-xs text-blue-600 font-bold text-center mt-2 bg-blue-50 py-2 rounded-lg">
                    Sedang menunggu persetujuan Admin.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP PILIH SUB-PROSES YANG IKUT DIEKSPOR */}
      {exportPick && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-70 p-4" onClick={() => setExportPick(null)}>
          <div className="w-full max-w-sm rounded-2xl shadow-2xl p-5 border animate-in zoom-in-95 duration-200" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className={`text-base font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Sertakan Sub-Proses?</h3>
                <p className={`text-xs mt-1 leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Proses utama selalu diunduh. Centang sub-proses yang detailnya ingin ikut diekspor ({exportPick === 'pdf' ? 'sebagai halaman tambahan PDF' : 'sebagai file SVG terpisah'}).</p>
              </div>
              <button onClick={() => setExportPick(null)} className={`p-1.5 rounded-lg shrink-0 ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 mb-4">
              {subPlaneSvgs.map(sub => (
                <label key={sub.id} style={{ marginLeft: (sub.depth || 0) * 16 }} className={`flex items-center gap-2.5 cursor-pointer text-sm font-semibold px-3 py-2.5 rounded-xl border ${isDarkMode ? 'text-slate-200 border-slate-700 bg-[#0F172A]' : 'text-slate-700 border-slate-200 bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={!!exportChecked[sub.id]}
                    onChange={e => setExportChecked(prev => ({ ...prev, [sub.id]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  {(sub.depth || 0) > 0 && <span className="text-slate-400 shrink-0">↳</span>}
                  <span className="truncate">{sub.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setExportPick(null)} className={`flex-1 px-4 py-2.5 text-sm font-bold border rounded-xl ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Batal</button>
              <button
                onClick={() => { const kind = exportPick; setExportPick(null); if (kind === 'pdf') handleDownloadPDF(); else handleDownloadSVG(); }}
                className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm flex items-center justify-center gap-2 ${exportPick === 'pdf' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
              >
                {exportPick === 'pdf' ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                Unduh ({1 + checkedSubPlanes.length} {exportPick === 'pdf' ? 'halaman' : 'file'})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BPMNStudioPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center bg-slate-50 text-slate-500 font-medium">Memuat URL Parameter...</div>}>
      <BPMNStudioContent />
    </Suspense>
  );
}
