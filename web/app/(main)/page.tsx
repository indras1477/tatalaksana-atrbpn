"use client";
import React, { Suspense, useState, useMemo, useEffect, useCallback } from 'react';
import {
  ChevronRight, ArrowLeft, Download, FileText,
  Activity, BookOpen, Filter, X, Search, ChevronLeft,
  RefreshCw, ExternalLink, FolderOpen, Layers,
  UploadCloud, Globe, Folder, Plus, CheckCircle2, AlertCircle, FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import { useRouter, useSearchParams } from 'next/navigation';
import { useAppContext } from '@/lib/app-context';
import SearchableSelect from '@/components/SearchableSelect';
import DOMPurify from 'dompurify';
import { HIERARKI_UNIT } from '@/lib/constants';

interface UnitNode { id: string; nama: string; level: number; parent_id: string | null; children: UnitNode[]; }

const API_BASE = '/e-sop-atrbpn/api';

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  }).then(res => {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.replace(window.location.origin + '/e-sop-atrbpn/login/');
    }
    return res;
  });
}


const CHART_LABELS: Record<string, string> = {
  "Sekretariat Jenderal": "SETJEN",
  "Direktorat Jenderal Tata Ruang": "TARU",
  "Direktorat Jenderal Survei dan Pemetaan Pertanahan dan Ruang": "SPPR",
  "Direktorat Jenderal Penetapan Hak dan Pendaftaran Tanah": "PHPT",
  "Direktorat Jenderal Penataan Agraria": "PENTAG",
  "Direktorat Jenderal Pengadaan Tanah dan Pengembangan Pertanahan": "PENGADAAN",
  "Direktorat Jenderal Pengendalian dan Penertiban Tanah dan Ruang": "PENGENDALIAN",
  "Direktorat Jenderal Penanganan Sengketa dan Konflik Pertanahan": "PSKP",
  "Inspektorat Jenderal": "ITJEN",
  "Badan Pengembangan Sumber Daya Manusia": "BPSDM",
};

const listL1 = Object.keys(HIERARKI_UNIT);
const getListL2 = (l1: string) => l1 && HIERARKI_UNIT[l1] ? Object.keys(HIERARKI_UNIT[l1]) : [];

const PROBIS_L1_MAP: Record<string, string> = {
  '1. Sekretariat Jenderal': 'Sekretariat Jenderal',
  '2. Inspektorat Jenderal': 'Inspektorat Jenderal',
  '3. Direktorat Jenderal Tata Ruang': 'Direktorat Jenderal Tata Ruang',
  '4. Direktorat Jenderal SPPR': 'Direktorat Jenderal Survei dan Pemetaan Pertanahan dan Ruang',
  '5. Direktorat Jenderal PHPT': 'Direktorat Jenderal Penetapan Hak dan Pendaftaran Tanah',
  '6. Direktorat Jenderal Penataan Agraria': 'Direktorat Jenderal Penataan Agraria',
  '7. Direktorat Jenderal PTPP': 'Direktorat Jenderal Pengadaan Tanah dan Pengembangan Pertanahan',
  '8. Direktorat Jenderal PPTR': 'Direktorat Jenderal Pengendalian dan Penertiban Tanah dan Ruang',
  '9. Direktorat Jenderal PSKP': 'Direktorat Jenderal Penanganan Sengketa dan Konflik Pertanahan',
};

interface ImportRow {
  _key: string;
  nama: string; jenis: string; tahun: string;
  unitL1: string; unitL2: string; unitL3: string;
  link: string; sumber: string;
}
interface CrawlFile { name: string; ext: string; url: string; }
interface CrawlDir { name: string; path: string; }
interface CrawlItem {
  _key: string;
  nama: string; ext: string; url: string;
  jenis: string; tahun: string;
  unitL1: string; unitL2: string; unitL3: string;
  sumber: string;
}
interface DriveFolder { id: string; name: string; }
interface DriveFile { id: string; name: string; webViewLink: string; }
interface DriveItem {
  _key: string;
  fileId: string;
  nama: string; link: string;
  jenis: string; tahun: string;
  unitL1: string; unitL2: string; unitL3: string;
}

interface Dokumen {
  id: number; nama: string; jenis: string; tahun: string;
  unitL1: string; unitL2: string; unitL3: string; link: string; sumber: string;
  status?: string; catatan?: string; 
  unit_l1?: string; unit_l2?: string; unit_l3?: string;
  l1_id?: number; l2_id?: number; l3_id?: number;
}

function mapApiDoc(d: Record<string, unknown>): Dokumen {
  return {
    id: d.id as number,
    nama: d.nama as string,
    jenis: d.jenis as string,
    tahun: d.tahun as string,
    unitL1: (d.unit_l1 as string) || '',
    unitL2: (d.unit_l2 as string) || '',
    unitL3: (d.unit_l3 as string) || '',
    link: (d.link as string) || '',
    sumber: (d.sumber as string) || '',
    status: (d.status as string) || 'draft',
    catatan: (d.catatan as string) || '', 
    l1_id: d.l1_id as number,
    l2_id: d.l2_id as number,
    l3_id: d.l3_id as number,
  };
}

function DashboardBPN() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<{id: number; username: string; role: string; nama_lengkap?: string} | null>(null);
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [unitL1List, setUnitL1List] = useState<{id: number; nama: string}[]>([]);
  const [unitL2List, setUnitL2List] = useState<{id: number; nama: string; l1_id: number}[]>([]);
  const [unitL3List, setUnitL3List] = useState<{id: number; nama: string; l2_id: number}[]>([]);
  // Tree lokal dari DB — dipakai form agar nama persis sama dengan unitL1List/L2List
  const localUnitTree = useMemo<UnitNode[]>(() => unitL1List.map(l1 => ({
    id: l1.id, nama: l1.nama,
    children: unitL2List.filter(l2 => l2.l1_id === l1.id).map(l2 => ({
      id: l2.id, nama: l2.nama,
      children: unitL3List.filter(l3 => l3.l2_id === l2.id).map(l3 => ({
        id: l3.id, nama: l3.nama, children: []
      }))
    }))
  })) as unknown as UnitNode[], [unitL1List, unitL2List, unitL3List]);

  useEffect(() => {
    const initAuth = async () => {
      const tok = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');

      if (!tok || !userStr) {
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.location.replace(window.location.origin + '/e-sop-atrbpn/login/');
        return; 
      }

      try {
        const res = await fetch('/e-sop-atrbpn/api/auth/verify', {
          headers: { Authorization: `Bearer ${tok}` }
        });

        if (!res.ok) {
           throw new Error('Sesi telah kedaluwarsa');
        }

        const user = JSON.parse(userStr);
        // Superadmin = superset admin: berlaku seperti admin di Dashboard (lihat/edit semua dokumen).
        if (user.role === 'superadmin') user.role = 'admin';
        setCurrentUser(user);
        setToken(tok);
        setIsAuthChecking(false); 
      } catch {
        localStorage.removeItem('token'); 
        localStorage.removeItem('user');
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.location.replace(window.location.origin + '/e-sop-atrbpn/login/');
      }
    };
    initAuth();
  }, []);

  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'2026' | 'arsip'>('2026');
  const [level, setLevel] = useState(1);
  const [selectedL1, setSelectedL1] = useState('');
  const [selectedL2, setSelectedL2] = useState('');

  const { isDarkMode } = useAppContext();

  const [dokumenList, setDokumenList] = useState<Dokumen[]>([]);
  const [filterJenis, setFilterJenis] = useState('Semua');
  const [filterTahun, setFilterTahun] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewDoc, setViewDoc] = useState<Dokumen | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string>("");

  // === IMPORT MODAL (Excel + Crawl tabs) ===
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSource, setImportSource] = useState<'arsip' | '2026'>('arsip');
  const [importTab, setImportTab] = useState<'excel' | 'crawl' | 'drive'>('excel');
  // Excel
  const [xlsRows, setXlsRows] = useState<ImportRow[]>([]);
  const [xlsImporting, setXlsImporting] = useState(false);
  const [xlsMsg, setXlsMsg] = useState('');
  // Crawl Probis
  const [crawlPath, setCrawlPath] = useState('');
  const [crawlHistory, setCrawlHistory] = useState<CrawlDir[]>([]);
  const [crawlDirs, setCrawlDirs] = useState<CrawlDir[]>([]);
  const [crawlFiles, setCrawlFiles] = useState<CrawlFile[]>([]);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlErr, setCrawlErr] = useState('');
  const [crawlQueue, setCrawlQueue] = useState<CrawlItem[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  // Google Drive
  const DRIVE_ROOT = '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  const [driveStack, setDriveStack] = useState<DriveFolder[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveErr, setDriveErr] = useState('');
  const [driveQueue, setDriveQueue] = useState<DriveItem[]>([]);
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveMsg, setDriveMsg] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterJenis, filterTahun, selectedL1, selectedL2]);

  useEffect(() => {
    setCurrentPage(1);
    setLevel(1);
    setSelectedL1('');
    setSelectedL2('');
    setFilterJenis('Semua');
    setFilterTahun('Semua');
    setSearchQuery('');
  }, [dashboardTab]);

  useEffect(() => {
    if (!token) return;
    apiFetch('/unit-kerja/l1', token).then(r => r.json()).then(d => setUnitL1List(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/unit-kerja/l2', token).then(r => r.json()).then(d => setUnitL2List(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/unit-kerja/l3', token).then(r => r.json()).then(d => setUnitL3List(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);

  const fetchDokumen = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/dokumen?page=1', token);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDokumenList(data.map(mapApiDoc));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchDokumen(); }, [fetchDokumen]);

  useEffect(() => {
    if (searchParams.get('mode') === 'tambah' && currentUser?.role === 'admin') {
      resetFormTambah();
    }
  }, [searchParams, currentUser]);

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    const lowUrl = url.toLowerCase();
    
    try {
      if (lowUrl.includes('dropbox.com')) {
        return 'BLOCKED_DROPBOX';
      }

      if (lowUrl.includes('drive.google.com') || lowUrl.includes('docs.google.com')) {
        if (lowUrl.includes('/folders/') || lowUrl.includes('folderview')) {
          const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/) || url.match(/id=([a-zA-Z0-9-_]+)/);
          if (match && match[1]) {
            return `https://drive.google.com/embeddedfolderview?id=${match[1]}#grid`;
          }
        }
        if (lowUrl.includes('/file/d/')) {
          const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
          if (match && match[1]) {
            return `https://drive.google.com/file/d/${match[1]}/preview`;
          }
        }
        if (lowUrl.includes('id=')) {
          const match = url.match(/id=([a-zA-Z0-9-_]+)/);
          if (match && match[1]) {
            return `https://drive.google.com/file/d/${match[1]}/preview`;
          }
        }
        if (lowUrl.includes('/document/d/') || lowUrl.includes('/spreadsheets/d/') || lowUrl.includes('/presentation/d/')) {
          return url.replace(/\/edit.*/, '/preview').replace(/\/view.*/, '/preview');
        }
      }
    } catch (e) {
      console.error("Gagal memproses URL", e);
    }
    
    return url;
  };

  const getL1Id = (nama: string) => unitL1List.find(u => u.nama === nama)?.id;
  const getL2Id = (nama: string, l1Id?: number) => unitL2List.find(u => u.nama === nama && (!l1Id || u.l1_id === l1Id))?.id;
  const getL3Id = (nama: string, l2Id?: number) => unitL3List.find(u => u.nama === nama && (!l2Id || u.l2_id === l2Id))?.id;

  const [formData, setFormData] = useState({
    nama: '', jenis: 'Proses Bisnis', tahun: new Date().getFullYear().toString(),
    unitL1: '', unitL2: '', unitL3: '', 
    link: '', sumber: ''
  });

  const dokumenByTab = useMemo(() => {
    if (dashboardTab === '2026') return dokumenList.filter(d => d.tahun === '2026');
    return dokumenList.filter(d => parseInt(d.tahun) <= 2025);
  }, [dokumenList, dashboardTab]);

  // Pencarian & filter kini berlaku di SEMUA level dashboard (rekap unit maupun
  // daftar dokumen), sehingga rekap ikut menyesuaikan apa yang dicari pengguna.
  const cocokTahunCari = (d: Dokumen) => {
    const kw = searchQuery.trim().toLowerCase();
    const matchTahun = filterTahun === 'Semua' || d.tahun === filterTahun;
    const matchSearch = !kw ||
      d.nama.toLowerCase().includes(kw) || d.unitL1.toLowerCase().includes(kw) ||
      d.unitL2.toLowerCase().includes(kw) || d.unitL3.toLowerCase().includes(kw) ||
      (d.sumber || '').toLowerCase().includes(kw);
    return matchTahun && matchSearch;
  };
  const dokumenScope = useMemo(
    () => dokumenByTab.filter(d => cocokTahunCari(d) && (filterJenis === 'Semua' || d.jenis === filterJenis)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dokumenByTab, filterJenis, filterTahun, searchQuery]
  );
  // Kartu total: ikut pencarian & tahun, TIDAK ikut filter jenis (tiap kartu = jenisnya sendiri).
  const dokumenKartu = useMemo(() => dokumenByTab.filter(cocokTahunCari),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dokumenByTab, filterTahun, searchQuery]);
  const adaFilterAktif = filterJenis !== 'Semua' || filterTahun !== 'Semua' || searchQuery.trim() !== '';

  const totalProbis = dokumenKartu.filter(d => d.jenis === 'Proses Bisnis').length;
  const totalSOP = dokumenKartu.filter(d => d.jenis === 'SOP').length;
  const totalSP = dokumenKartu.filter(d => d.jenis === 'Standar Pelayanan').length;

  const rekapL1 = useMemo(() => {
    return listL1.map(unitL1 => {
      const docs = dokumenScope.filter(d => d.unitL1.toLowerCase() === unitL1.toLowerCase());
      return {
        nama: unitL1, 
        labelChart: CHART_LABELS[unitL1] || unitL1.substring(0, 5),
        probis: docs.filter(d => d.jenis === 'Proses Bisnis').length,
        sop: docs.filter(d => d.jenis === 'SOP').length,
        sp: docs.filter(d => d.jenis === 'Standar Pelayanan').length,
      };
    // Saat ada pencarian/filter, tampilkan hanya unit yang punya hasil.
    }).filter(r => !adaFilterAktif || (r.probis + r.sop + r.sp) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumenScope, adaFilterAktif]);

  // Di layar lebar (xl+) halaman dikunci setinggi viewport supaya TIDAK pernah muncul
  // scroll halaman; bila isi tabel kepanjangan, yang bergulir hanya badan tabel.
  // Level 1 & 2 barisnya sedikit (11 unit / belasan sub-unit) → dirapatkan agar muat utuh.
  const barisRapat = level !== 3;

  // Total kolom untuk baris kaki tabel rekapitulasi
  const rekapTotal = useMemo(() => rekapL1.reduce(
    (acc, r) => ({ probis: acc.probis + r.probis, sop: acc.sop + r.sop, sp: acc.sp + r.sp }),
    { probis: 0, sop: 0, sp: 0 }
  ), [rekapL1]);

  const rekapL2 = useMemo(() => {
    if (!selectedL1) return [];
    return getListL2(selectedL1).map(unitL2 => {
      const docs = dokumenScope.filter(d => d.unitL1.toLowerCase() === selectedL1.toLowerCase() && d.unitL2 === unitL2);
      return {
        nama: unitL2,
        probis: docs.filter(d => d.jenis === 'Proses Bisnis').length,
        sop: docs.filter(d => d.jenis === 'SOP').length,
        sp: docs.filter(d => d.jenis === 'Standar Pelayanan').length,
      };
    }).filter(r => !adaFilterAktif || (r.probis + r.sop + r.sp) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedL1, dokumenScope, adaFilterAktif]);

  const dokumenFiltered = useMemo(() => {
    const filtered = dokumenByTab.filter(d => {
      const matchUnit = (!selectedL1 || d.unitL1.toLowerCase() === selectedL1.toLowerCase()) && (!selectedL2 || d.unitL2 === selectedL2);
      const matchJenis = filterJenis === 'Semua' || d.jenis === filterJenis;
      const matchTahun = filterTahun === 'Semua' || d.tahun === filterTahun;

      const keyword = searchQuery.toLowerCase();
      const matchSearch =
        d.nama.toLowerCase().includes(keyword) ||
        d.unitL3.toLowerCase().includes(keyword) ||
        d.unitL2.toLowerCase().includes(keyword) ||
        d.sumber.toLowerCase().includes(keyword);

      return matchUnit && matchJenis && matchTahun && matchSearch;
    });

    return [...filtered].sort((a, b) => {
      if (b.tahun !== a.tahun) {
        return parseInt(b.tahun) - parseInt(a.tahun);
      }
      const urutanL3 = HIERARKI_UNIT[a.unitL1]?.[a.unitL2] || [];
      const indexA = urutanL3.indexOf(a.unitL3);
      const indexB = urutanL3.indexOf(b.unitL3);
      return indexA - indexB;
    });
  }, [dokumenByTab, selectedL1, selectedL2, filterJenis, filterTahun, searchQuery]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = dokumenFiltered.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(dokumenFiltered.length / itemsPerPage);
  const uniqueTahunList = Array.from(new Set(
    dokumenByTab.filter(d => d.unitL1.toLowerCase() === selectedL1.toLowerCase() && (!selectedL2 || d.unitL2 === selectedL2)).map(d => d.tahun)
  )).sort();

  const handleExportExcel = () => {
    if (dokumenFiltered.length === 0) { alert("Tidak ada data dokumen."); return; }
    const dataToExport = dokumenFiltered.map((doc, index) => ({
      "No": index + 1, "Nama Dokumen": doc.nama, "Unit Kerja L2": doc.unitL2, "Unit Kerja L3": doc.unitL3,
      "Jenis": doc.jenis, "Tahun": doc.tahun, "Status": doc.status, "Sumber": doc.sumber, "Link": doc.link
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dokumen");
    const fileNameSuffix = selectedL2 ? selectedL2 : `SEMUA_${selectedL1}`;
    XLSX.writeFile(workbook, `Rekap_Dokumen_${fileNameSuffix.replace(/ /g, "_")}.xlsx`);
  };

  const resetFormTambah = () => {
    setEditingId(null); setSaveError('');
    setFormData({
      nama: '', jenis: 'Proses Bisnis', tahun: new Date().getFullYear().toString(),
      unitL1: '', unitL2: '', unitL3: '',
      link: '', sumber: ''
    });
    setActiveMenu('tambah');
  };

  const backToDashboard = () => {
    setActiveMenu('dashboard');
    setEditingId(null);
    setSaveError('');
    router.replace('/');
  };
   
  const handleApproval = async (doc: Dokumen, targetStatus: string) => {
    let catatan = "";
    if (targetStatus === 'rejected') {
      catatan = window.prompt("Tolak Pengajuan: Masukkan alasan/catatan revisi untuk unit kerja:") || "";
      if (!catatan) return alert("Catatan revisi wajib diisi jika menolak pengajuan.");
    }

    try {
      const res = await apiFetch(`/dokumen/${doc.id}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus, catatan })
      });
      
      if (res.ok) {
        if (doc.jenis === 'Proses Bisnis' && doc.link.includes('id=')) {
          const bpmnId = doc.link.split('id=')[1].split('&')[0];
          await apiFetch(`/bpmn/models/status/${bpmnId}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ status: targetStatus, catatan })
          }).catch(() => console.warn("Endpoint BPMN status belum ada, update dashboard sukses.")); 
        }

        alert(`Status dokumen berhasil diperbarui menjadi ${targetStatus.toUpperCase()}`);
        fetchDokumen();
      } else {
        alert("Gagal memperbarui status dokumen.");
      }
    } catch (err) {
      console.error(err); 
      alert("Terjadi kesalahan pada server saat memperbarui status.");
    }
  };
   
  const handleSimpanDokumen = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!formData.unitL1) {
      setSaveError('Unit Kerja Level 1 wajib dipilih.');
      return;
    }
    setSaving(true);
    try {
      const l1Id = getL1Id(formData.unitL1);
      const l2Id = formData.unitL2 ? getL2Id(formData.unitL2, l1Id) : undefined;
      const l3Id = formData.unitL3 ? getL3Id(formData.unitL3, l2Id) : undefined;
      const body = JSON.stringify({
        nama: formData.nama, jenis: formData.jenis, tahun: formData.tahun,
        l1_id: l1Id, l2_id: l2Id || null, l3_id: l3Id || null,
        link: formData.link, sumber: formData.sumber,
      });
      let res;
      if (editingId !== null) {
        res = await apiFetch(`/dokumen/${editingId}`, token, { method: 'PUT', body });
      } else {
        res = await apiFetch('/dokumen', token, { method: 'POST', body });
      }
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }
      await fetchDokumen();
      backToDashboard();
    } catch { setSaveError('Tidak dapat terhubung ke server'); }
    finally { setSaving(false); }
  };
   
  const handleEdit = (doc: Dokumen) => {
    if (doc.jenis === 'Proses Bisnis' && doc.link.includes('/bpmn?id=')) {
      router.push(doc.link);
      return;
    }

    setSaveError('');
    setFormData({ 
      nama: doc.nama, 
      jenis: doc.jenis, 
      tahun: doc.tahun, 
      unitL1: doc.unitL1, 
      unitL2: doc.unitL2, 
      unitL3: doc.unitL3, 
      link: doc.link, 
      sumber: doc.sumber 
    });
    setEditingId(doc.id); 
    setActiveMenu('tambah');
  };
   
  const handleDelete = async (id: number) => {
    if (!window.confirm('Hapus dokumen ini?')) return;
    try {
      await apiFetch(`/dokumen/${id}`, token, { method: 'DELETE' });
      setDokumenList(prev => prev.filter(d => d.id !== id));
    } catch { alert('Gagal menghapus dokumen.'); }
  };
   

  // === EXCEL IMPORT HANDLERS ===
  const downloadXlsTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Template isian
    const ws = XLSX.utils.json_to_sheet([
      {
        'Nama Proses/Layanan': 'Contoh: Evaluasi AKIP',
        'Jenis': 'Proses Bisnis',
        'Tahun': '2025',
        'Unit Kerja L1': 'INSPEKTORAT JENDERAL',
        'Unit Kerja L2': 'Sekretariat Inspektorat Jenderal',
        'Unit Kerja L3': '',
        'Link Dokumen': 'https://orpeg.atrbpn.go.id/probis/...',
        'Sumber/Dasar Hukum': '',
      },
      {
        'Nama Proses/Layanan': 'Contoh: Pengukuran dan Pemetaan Bidang Tanah',
        'Jenis': 'SOP',
        'Tahun': '2025',
        'Unit Kerja L1': 'DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG',
        'Unit Kerja L2': 'Direktorat Pengukuran dan Pemetaan Kadastral',
        'Unit Kerja L3': '',
        'Link Dokumen': '',
        'Sumber/Dasar Hukum': '',
      },
    ]);
    // Lebar kolom
    ws['!cols'] = [{ wch: 60 }, { wch: 18 }, { wch: 8 }, { wch: 65 }, { wch: 50 }, { wch: 30 }, { wch: 50 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    // Sheet 2: Daftar Unit Kerja L1 resmi (nama harus persis seperti ini)
    const unitL1Rows = [
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Sekretariat Jenderal', 'Singkatan': 'SETJEN' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Tata Ruang', 'Singkatan': 'TARU' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Survei dan Pemetaan Pertanahan dan Ruang', 'Singkatan': 'SPPR' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Penetapan Hak dan Pendaftaran Tanah', 'Singkatan': 'PHPT' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Penataan Agraria', 'Singkatan': 'PENTAG' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Pengadaan Tanah dan Pengembangan Pertanahan', 'Singkatan': 'PTPP' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Pengendalian dan Penertiban Tanah dan Ruang', 'Singkatan': 'PPTR' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Direktorat Jenderal Penanganan Sengketa dan Konflik Pertanahan', 'Singkatan': 'PSKP' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Inspektorat Jenderal', 'Singkatan': 'ITJEN' },
      { 'Unit Kerja L1 (salin persis ke kolom Template)': 'Badan Pengembangan Sumber Daya Manusia', 'Singkatan': 'BPSDM' },
    ];
    const wsL1 = XLSX.utils.json_to_sheet(unitL1Rows);
    wsL1['!cols'] = [{ wch: 70 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsL1, 'Daftar Unit L1');

    XLSX.writeFile(wb, 'Template_Import_Dokumen_2023-2025.xlsx');
  };

  const handleXlsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        if (json.length === 0) { setXlsMsg('✗ File kosong atau tidak ada data'); return; }

        // Flexible column aliases — map any known variant to canonical key
        const COL: Record<string, string[]> = {
          nama:   ['Nama Proses/Layanan','Nama Proses','Nama Layanan','Nama SOP','Nama','Proses/Layanan','nama sop','nama proses'],
          jenis:  ['Jenis','Tipe','Type'],
          tahun:  ['Tahun','Year'],
          unitL1: ['Unit Kerja L1','Unit L1','Direktorat Jenderal','Ditjen','L1','Unit Eselon I'],
          unitL2: ['Unit Kerja L2','Unit L2','Direktorat','L2','Unit Eselon II'],
          unitL3: ['Unit Kerja L3','Unit L3','L3','Unit Eselon III','Subdirektorat'],
          link:   ['Link Dokumen','Link','URL','Tautan','Hyperlink','Link SOP','Link Dokumen/SOP'],
          sumber: ['Sumber/Dasar Hukum','Sumber','Dasar Hukum','Referensi','Keterangan'],
        };

        const headers = Object.keys(json[0]);
        // case-insensitive header matching
        const resolve = (aliases: string[]) => {
          for (const alias of aliases) {
            const found = headers.find(h => h.trim().toLowerCase() === alias.toLowerCase());
            if (found) return found;
          }
          return '';
        };
        const colMap = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, resolve(v)]));

        const pick = (r: Record<string, string>, col: string, fallback = '') =>
          col ? String(r[col] ?? '').trim() : fallback;

        const rows: ImportRow[] = json.map((r, i) => ({
          _key: `xls-${i}`,
          nama: pick(r, colMap.nama),
          jenis: pick(r, colMap.jenis) || 'Proses Bisnis',
          tahun: String(pick(r, colMap.tahun) || '2023'),
          unitL1: pick(r, colMap.unitL1),
          unitL2: pick(r, colMap.unitL2),
          unitL3: pick(r, colMap.unitL3),
          link: pick(r, colMap.link),
          sumber: pick(r, colMap.sumber),
        }));

        const validCount = rows.filter(r => r.nama.trim()).length;
        if (validCount === 0) {
          setXlsMsg(`✗ Tidak ada baris valid. Kolom terdeteksi: [${headers.join(', ')}]. Pastikan ada kolom "Nama Proses/Layanan" atau download template.`);
          return;
        }
        const noL1Count = rows.filter(r => r.nama.trim() && !r.unitL1.trim()).length;
        const noL2Count = rows.filter(r => r.nama.trim() && !r.unitL2.trim()).length;
        const detectedCols = Object.entries(colMap).filter(([,v]) => v).map(([k]) => k).join(', ');
        let msg = `✓ ${validCount} baris terbaca dari "${wb.SheetNames[0]}" (kolom terdeteksi: ${detectedCols})`;
        if (noL1Count > 0) msg += ` — ⚠ ${noL1Count} baris tanpa Unit L1`;
        if (noL2Count > 0) msg += `, ${noL2Count} tanpa Unit L2`;
        setXlsRows(rows.filter(r => r.nama.trim()));
        setXlsMsg(msg);
      } catch (err) {
        setXlsMsg(`✗ Gagal membaca file: ${err instanceof Error ? err.message : 'format tidak dikenali'}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleXlsImport = async () => {
    if (xlsRows.length === 0) return;
    setXlsImporting(true); setXlsMsg('');
    try {
      const res = await apiFetch('/dokumen/import', token, {
        method: 'POST',
        body: JSON.stringify({ items: xlsRows }),
      });
      const data = await res.json();
      if (res.ok) {
        let msg = `✓ Berhasil mengimport ${data.imported} dokumen.`;
        if (data.errors?.length) {
          msg += ` ${data.errors.length} baris gagal — contoh: ${data.errors.slice(0,2).join(' | ')}`;
        }
        setXlsMsg(msg);
        if (data.imported > 0) { setXlsRows([]); await fetchDokumen(); }
      } else {
        setXlsMsg(`✗ ${data.error || 'Gagal import'}`);
      }
    } catch { setXlsMsg('✗ Tidak dapat terhubung ke server'); }
    finally { setXlsImporting(false); }
  };

  // === CRAWL PROBIS HANDLERS ===
  const fetchCrawlDir = async (path: string) => {
    setCrawlLoading(true); setCrawlErr('');
    try {
      const res = await apiFetch(`/dokumen/crawl-probis?path=${encodeURIComponent(path)}`, token);
      const data = await res.json();
      if (!res.ok) { setCrawlErr(data.error || 'Gagal memuat'); return; }
      setCrawlPath(path);
      setCrawlDirs(data.dirs || []);
      setCrawlFiles(data.files || []);
    } catch { setCrawlErr('Tidak dapat terhubung ke server'); }
    finally { setCrawlLoading(false); }
  };

  const crawlNavigateTo = (dir: CrawlDir) => {
    setCrawlHistory(h => [...h, { name: dir.name, path: crawlPath }]);
    fetchCrawlDir(dir.path);
  };

  const crawlGoBack = () => {
    const h = [...crawlHistory];
    const prev = h.pop();
    setCrawlHistory(h);
    fetchCrawlDir(prev?.path ?? '');
  };

  const crawlAddFile = (f: CrawlFile) => {
    if (crawlQueue.find(q => q.url === f.url)) return;
    // Auto-detect L1 from first item in history (root-level dir name)
    const l1Raw = crawlHistory[0]?.name || '';
    const l1Mapped = PROBIS_L1_MAP[l1Raw] || '';
    // Auto-detect L2: second breadcrumb if it looks like a unit name (not "Proses Utama")
    const l2Raw = crawlHistory[1]?.name || '';
    const skipL2 = ['Proses Utama', 'Proses Pendukung', 'Sesitjen'].includes(l2Raw);
    setCrawlQueue(prev => [...prev, {
      _key: `cq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nama: f.name, ext: f.ext, url: f.url,
      jenis: f.ext === 'pdf' ? 'SOP' : 'Proses Bisnis',
      tahun: '2023',
      unitL1: l1Mapped,
      unitL2: skipL2 ? '' : l2Raw,
      unitL3: '',
      sumber: '',
    }]);
  };

  const handleBulkImport = async () => {
    if (crawlQueue.length === 0) return;
    setBulkImporting(true); setBulkMsg('');
    try {
      const items = crawlQueue.map(q => ({
        nama: q.nama, jenis: q.jenis, tahun: q.tahun,
        unitL1: q.unitL1, unitL2: q.unitL2, unitL3: q.unitL3,
        link: q.url, sumber: q.sumber,
      }));
      const res = await apiFetch('/dokumen/import', token, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkMsg(`✓ Berhasil mengimport ${data.imported} dokumen.${data.errors?.length ? ` ${data.errors.length} gagal.` : ''}`);
        setCrawlQueue([]);
        await fetchDokumen();
      } else {
        setBulkMsg(`✗ ${data.error || 'Gagal import'}`);
      }
    } catch { setBulkMsg('✗ Tidak dapat terhubung ke server'); }
    finally { setBulkImporting(false); }
  };

  const fetchDriveFolder = async (folderId: string) => {
    setDriveLoading(true); setDriveErr('');
    try {
      const res = await apiFetch(`/dokumen/drive-browse?folderId=${encodeURIComponent(folderId)}`, token);
      const data = await res.json();
      if (!res.ok) { setDriveErr(data.error || 'Gagal memuat folder'); return; }
      setDriveFolders(data.folders || []);
      setDriveFiles(data.files || []);
    } catch { setDriveErr('Tidak dapat terhubung ke server'); }
    finally { setDriveLoading(false); }
  };

  const driveNavigateTo = (folder: DriveFolder) => {
    setDriveStack(prev => [...prev, folder]);
    fetchDriveFolder(folder.id);
  };

  const driveGoBack = () => {
    const newStack = driveStack.slice(0, -1);
    setDriveStack(newStack);
    fetchDriveFolder(newStack.length > 0 ? newStack[newStack.length - 1].id : DRIVE_ROOT);
  };

  const driveAddFile = (f: DriveFile) => {
    const nama = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    setDriveQueue(prev => [...prev, {
      _key: `drive-${f.id}`,
      fileId: f.id,
      nama,
      link: f.webViewLink,
      jenis: 'SOP',
      tahun: String(new Date().getFullYear()),
      unitL1: '', unitL2: '', unitL3: '',
    }]);
  };

  const handleDriveImport = async () => {
    if (driveQueue.length === 0) return;
    setDriveImporting(true); setDriveMsg('');
    try {
      const items = driveQueue.map(q => ({
        nama: q.nama, jenis: q.jenis, tahun: q.tahun,
        unitL1: q.unitL1, unitL2: q.unitL2, unitL3: q.unitL3,
        link: q.link, sumber: '',
      }));
      const res = await apiFetch('/dokumen/import', token, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (res.ok) {
        setDriveMsg(`✓ Berhasil mengimport ${data.imported} dokumen.${data.errors?.length ? ` ${data.errors.length} gagal.` : ''}`);
        setDriveQueue([]);
        await fetchDokumen();
      } else {
        setDriveMsg(`✗ ${data.error || 'Gagal import'}`);
      }
    } catch { setDriveMsg('✗ Tidak dapat terhubung ke server'); }
    finally { setDriveImporting(false); }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] text-[#002855]">
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-600" />
          <h2 className="text-xl font-extrabold tracking-widest animate-pulse">MEMVERIFIKASI AKSES</h2>
          <p className="text-sm font-medium text-slate-500">Menyiapkan Ruang Kerja Anda...</p>
        </div>
      </div>
    );
  }

  return (
    <>

      {/* VIEWER MODAL (VERSI 7.0 - UI BLOCKED KHUSUS DROPBOX & GDrive FOLDER) */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity p-4 md:p-10">
          <div 
            className={`w-full max-w-6xl h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ${
              isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'
            }`}
          >
            {/* Header Modal */}
            <div className={`flex justify-between items-center p-5 border-b ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex-1 min-w-0 pr-4">
                <h3 className={`font-bold text-xl truncate ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                  {viewDoc?.nama}
                </h3>
                <div className="flex flex-wrap items-center text-xs text-slate-500 mt-1.5 gap-x-2 gap-y-1">
                  <span className={`px-2 py-0.5 rounded font-bold ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                    {viewDoc?.jenis}
                  </span>
                  <span>•</span>
                  <span className="truncate">{viewDoc?.unitL3 || viewDoc?.unitL2 || viewDoc?.unitL1}</span>
                  <span>•</span>
                  <span className="shrink-0">Tahun {viewDoc?.tahun}</span>
                </div>
              </div>
              <button 
                onClick={() => setViewDoc(null)} 
                className={`p-2.5 rounded-full transition-all shadow-sm ${isDarkMode ? 'hover:bg-red-900/30 text-red-400 bg-slate-800' : 'hover:bg-red-100 text-red-600 bg-white border border-slate-100'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Konten Utama Modal */}
            <div className={`flex-1 overflow-auto flex justify-center items-center relative ${isDarkMode ? 'bg-[#0B1121]' : 'bg-slate-200/50'}`}>
              {viewDoc?.jenis === 'Proses Bisnis' && viewDoc?.link.includes('id=') ? (
                previewSvg ? (
                  <div className="bg-white p-8 rounded-xl shadow-xl max-w-full max-h-full overflow-auto animate-in fade-in duration-500" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewSvg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-500 font-bold">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500"/>
                    <span>Memuat Diagram Alir...</span>
                  </div>
                )
              ) : (() => {
                const embedUrl = getEmbedUrl(viewDoc?.link || '');
                
                // --- UI KHUSUS JIKA TERDETEKSI DROPBOX ---
                if (embedUrl === 'BLOCKED_DROPBOX') {
                  return (
                    <div className={`text-center p-12 rounded-3xl shadow-2xl border-2 max-w-lg mx-4 animate-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#151F32] border-blue-900/30' : 'bg-white border-blue-50'}`}>
                      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg ${isDarkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                        <ExternalLink className="w-12 h-12" />
                      </div>
                      <h3 className={`text-2xl font-black mb-3 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Pratinjau Dropbox Dibatasi</h3>
                      <p className={`text-sm mb-8 leading-relaxed font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Kebijakan keamanan sistem Dropbox saat ini tidak mengizinkan dokumen untuk dirender langsung di aplikasi eksternal. Silakan buka dokumen melalui tab baru.
                      </p>
                      <a href={viewDoc?.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-600/20 transition-all hover:-translate-y-1 active:scale-95">
                        Buka Dropbox di Tab Baru <ChevronRight className="w-5 h-5"/>
                      </a>
                    </div>
                  );
                }

                // UI Jika Terdeteksi Folder Google Drive
                if (embedUrl.includes('embeddedfolderview')) {
                  return (
                    <div className="w-full h-full flex flex-col items-center bg-white">
                      <div className="w-full bg-blue-600 p-2 flex items-center justify-center gap-2">
                         <FolderOpen className="w-4 h-4 text-white" />
                         <span className="text-[10px] font-bold text-white uppercase tracking-widest">Penampil Folder Google Drive</span>
                      </div>
                      <iframe 
                        src={embedUrl} 
                        className="w-full h-full border-none" 
                        title="Folder Viewer" 
                        allow="autoplay"
                      />
                    </div>
                  );
                }

                // Default Iframe untuk GDrive File (Aman dari pemblokiran)
                return (
                  <iframe 
                    src={embedUrl} 
                    className="w-full h-full bg-white border-none" 
                    title="File Viewer" 
                    allow="autoplay"
                  />
                );
              })()}
            </div>
            
            {/* Footer Modal */}
            <div className={`p-5 border-t flex flex-col sm:flex-row justify-between items-center gap-4 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                   <ExternalLink className={`w-5 h-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Masalah Pratinjau?</p>
                  <p className="text-[11px] text-slate-500 font-medium">Klik tombol samping untuk membuka berkas asli di sumber eksternal.</p>
                </div>
              </div>
              <a 
                href={(() => {
                  if (!viewDoc?.link) return '#';
                  // Tautan internal aplikasi (studio BPMN/SOP/SP atau popup ?doc=) perlu
                  // basePath /e-sop-atrbpn; tanpa itu tab baru menuju root domain → 404.
                  const internal = viewDoc.link.replace(/^\/e-sop-atrbpn/, '');
                  // ?doc= memakai penanda sekali-pakai di halaman tujuan → beri nonce
                  // agar membuka dokumen yang sama berkali-kali tetap menampilkan popup.
                  if (/^\/(bpmn|sop|sp)(\/|\?)/.test(internal)) return `/e-sop-atrbpn${internal}${internal.includes('doc=') ? `&n=${Date.now()}` : ''}`;
                  return viewDoc.link;
                })()}
                target="_blank" 
                rel="noreferrer" 
                className="w-full sm:w-auto px-10 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-lg transition-all flex justify-center items-center gap-2"
              >
                Buka di Tab Baru <ChevronRight className="w-4 h-4"/>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL IMPORT DATA 2023-2025 ===== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            {/* Header */}
            <div className={`flex justify-between items-center p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
              <div>
                <h3 className={`font-extrabold text-xl ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{importSource === '2026' ? 'Import Data 2026' : 'Import Data 2023–2025'}</h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{importSource === '2026' ? 'Import via Excel atau ambil langsung dari Google Drive' : 'Import via Excel atau ambil langsung dari orpeg.atrbpn.go.id'}</p>
              </div>
              <button onClick={() => { setShowImportModal(false); setCrawlQueue([]); setXlsRows([]); setXlsMsg(''); setBulkMsg(''); setDriveQueue([]); setDriveMsg(''); setImportTab('excel'); }}
                className={`p-2.5 rounded-full ${isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'}`}>
                <X className="w-6 h-6" />
              </button>
            </div>
            {/* Tab switcher */}
            <div className={`flex flex-wrap gap-1 p-3 border-b shrink-0 ${isDarkMode ? 'border-slate-800 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <button onClick={() => setImportTab('excel')}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${importTab === 'excel' ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-[#002855] text-white') : (isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}>
                <FileSpreadsheet className="w-4 h-4" /> Import Excel
              </button>
              {importSource === 'arsip' && (
                <button onClick={() => { setImportTab('crawl'); if (crawlDirs.length === 0 && !crawlLoading) fetchCrawlDir(''); }}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${importTab === 'crawl' ? (isDarkMode ? 'bg-amber-600 text-white' : 'bg-[#A29061] text-white') : (isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}>
                  <Globe className="w-4 h-4" /> Crawl orpeg.atrbpn.go.id
                </button>
              )}
              <button onClick={() => { setImportTab('drive'); if (driveFolders.length === 0 && driveFiles.length === 0 && !driveLoading) fetchDriveFolder(DRIVE_ROOT); }}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all ${importTab === 'drive' ? (isDarkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-700 text-white') : (isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M1.9 17.4l2.1 3.6c.4.7 1 1 1.7 1h12.6c.7 0 1.3-.3 1.7-1l2.1-3.6H1.9zm10.1-14L8 9.8H4L1.9 13.4l.3.6h19.6l.3-.6L20.1 9.8H16l-4-6.4zM9.5 15l-1.5-2.6 6-2.6L15.5 15H9.5z"/></svg> Google Drive
              </button>
            </div>

            {/* ─── TAB: EXCEL ─── */}
            {importTab === 'excel' && (
              <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-5">
                <div className="flex flex-wrap gap-3">
                  <button onClick={downloadXlsTemplate}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border transition-all ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
                    <Download className="w-4 h-4" /> Download Template Excel
                  </button>
                  <label className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all ${isDarkMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                    <UploadCloud className="w-4 h-4" /> Upload File Excel
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXlsUpload} />
                  </label>
                </div>
                {xlsRows.length === 0 && (
                  <div className={`flex-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed gap-3 py-16 ${isDarkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                    <FileSpreadsheet className="w-12 h-12 opacity-30" />
                    <p className="font-bold text-sm">Download template, isi data, lalu upload kembali</p>
                    <p className="text-xs">Kolom: Nama · Jenis · Tahun · Unit L1 · Unit L2 · Unit L3 · Link · Sumber</p>
                  </div>
                )}
                {xlsRows.length > 0 && (
                  <div className="flex-1 overflow-auto rounded-xl border">
                    <table className={`w-full text-xs text-left ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      <thead className={`text-[10px] uppercase font-bold ${isDarkMode ? 'bg-[#0F172A] text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                        <tr>
                          {['No','Nama','Jenis','Tahun','Unit L1','Unit L2','Link',''].map(h => (
                            <th key={h} className="px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xlsRows.map((r, i) => (
                          <tr key={r._key} className={`border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                            <td className="px-4 py-2 text-slate-400">{i+1}</td>
                            <td className="px-4 py-2 font-medium max-w-48 truncate">{r.nama || <span className="text-red-400">kosong</span>}</td>
                            <td className="px-4 py-2">{r.jenis}</td>
                            <td className="px-4 py-2">{r.tahun}</td>
                            <td className={`px-4 py-2 max-w-36 truncate ${r.unitL1 ? 'text-slate-500' : 'text-red-500 font-bold'}`}>{r.unitL1 || '⚠ kosong'}</td>
                            <td className={`px-4 py-2 max-w-36 truncate ${r.unitL2 ? 'text-slate-500' : 'text-amber-500'}`}>{r.unitL2 || '-'}</td>
                            <td className="px-4 py-2 max-w-32 truncate text-blue-500">{r.link ? '✓ ada' : '-'}</td>
                            <td className="px-4 py-2">
                              <button onClick={() => setXlsRows(prev => prev.filter(x => x._key !== r._key))}
                                className="text-red-400 hover:text-red-600 font-bold">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {xlsMsg && (
                  <p className={`text-sm font-bold ${xlsMsg.startsWith('✓') ? 'text-emerald-500' : 'text-red-500'}`}>{xlsMsg}</p>
                )}
                {xlsRows.length > 0 && (
                  <button onClick={handleXlsImport} disabled={xlsImporting}
                    className="flex items-center justify-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg disabled:opacity-60 self-end">
                    {xlsImporting && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Import {xlsRows.length} Dokumen
                  </button>
                )}
              </div>
            )}

            {/* ─── TAB: CRAWL PROBIS ─── */}
            {importTab === 'crawl' && (
              <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row gap-0">
                {/* Kiri: directory browser */}
                <div className={`w-full md:w-1/2 flex flex-col border-r overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  {/* Breadcrumb */}
                  <div className={`px-4 py-2.5 flex items-center gap-1 text-xs font-bold border-b shrink-0 ${isDarkMode ? 'border-slate-800 text-slate-400 bg-[#0F172A]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
                    <button onClick={() => { setCrawlHistory([]); fetchCrawlDir(''); }} className="hover:underline text-amber-500">Root</button>
                    {crawlHistory.map((h, i) => (
                      <React.Fragment key={i}>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <button onClick={() => {
                          const newHist = crawlHistory.slice(0, i + 1);
                          setCrawlHistory(newHist);
                          fetchCrawlDir(h.path);
                        }} className="hover:underline">{h.name}</button>
                      </React.Fragment>
                    ))}
                    {crawlPath && <><ChevronRight className="w-3 h-3 opacity-50" /><span className={isDarkMode ? 'text-white' : 'text-[#002855]'}>{crawlPath.split('/').pop()}</span></>}
                  </div>
                  {/* Back button */}
                  {crawlHistory.length > 0 && (
                    <button onClick={crawlGoBack}
                      className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b ${isDarkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                      <ArrowLeft className="w-3 h-3" /> Kembali
                    </button>
                  )}
                  {/* Content */}
                  <div className="flex-1 overflow-y-auto">
                    {crawlLoading && (
                      <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-medium">Memuat dari orpeg.atrbpn.go.id...</span>
                      </div>
                    )}
                    {crawlErr && (
                      <div className="p-4">
                        <div className={`p-4 rounded-xl flex gap-3 items-start ${isDarkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-sm">{crawlErr}</p>
                            <button onClick={() => fetchCrawlDir(crawlPath)} className="text-xs underline mt-1">Coba lagi</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {!crawlLoading && !crawlErr && (
                      <>
                        {crawlDirs.map(d => (
                          <button key={d.path} onClick={() => crawlNavigateTo(d)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium border-b transition-colors ${isDarkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-50 text-slate-700 hover:bg-slate-50'}`}>
                            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="truncate text-left">{d.name}</span>
                            <ChevronRight className="w-4 h-4 ml-auto text-slate-400 shrink-0" />
                          </button>
                        ))}
                        {crawlFiles.map(f => {
                          const alreadyAdded = crawlQueue.some(q => q.url === f.url);
                          return (
                            <div key={f.url} className={`flex items-center gap-3 px-4 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-50'}`}>
                              <FileText className={`w-4 h-4 shrink-0 ${f.ext === 'pdf' ? 'text-red-400' : 'text-blue-400'}`} />
                              <span className={`flex-1 truncate text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{f.name}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${f.ext === 'pdf' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{f.ext}</span>
                              <button onClick={() => alreadyAdded ? setCrawlQueue(prev => prev.filter(q => q.url !== f.url)) : crawlAddFile(f)}
                                className={`shrink-0 p-1.5 rounded-lg transition-all ${alreadyAdded ? 'bg-emerald-100 text-emerald-600 hover:bg-red-100 hover:text-red-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white'}`}>
                                {alreadyAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </button>
                            </div>
                          );
                        })}
                        {crawlDirs.length === 0 && crawlFiles.length === 0 && !crawlLoading && (
                          <p className="text-center text-slate-400 text-sm py-10">Folder kosong atau tidak ada file SVG/PDF</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Kanan: antrian file terpilih */}
                <div className="w-full md:w-1/2 flex flex-col overflow-hidden">
                  <div className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b shrink-0 ${isDarkMode ? 'border-slate-800 text-slate-400 bg-[#0F172A]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
                    Dipilih ({crawlQueue.length}) — klik + pada file untuk menambahkan
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {crawlQueue.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <Plus className="w-10 h-10 opacity-20" />
                        <p className="text-sm font-medium">Belum ada file dipilih</p>
                      </div>
                    )}
                    {crawlQueue.map((item) => (
                      <div key={item._key} className={`p-3 rounded-xl border space-y-2 text-xs ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-bold text-sm leading-tight ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{item.nama}</p>
                          <button onClick={() => setCrawlQueue(prev => prev.filter(q => q._key !== item._key))}
                            className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-slate-500 font-bold">Jenis</label>
                            <select value={item.jenis} onChange={e => setCrawlQueue(prev => prev.map(q => q._key === item._key ? { ...q, jenis: e.target.value } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                              <option>Proses Bisnis</option><option>SOP</option><option>Standar Pelayanan</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold">Tahun</label>
                            <input type="number" value={item.tahun} onChange={e => setCrawlQueue(prev => prev.map(q => q._key === item._key ? { ...q, tahun: e.target.value } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
                          </div>
                        </div>
                        <div>
                          <label className="text-slate-500 font-bold">Unit Kerja L1</label>
                          <select value={item.unitL1} onChange={e => setCrawlQueue(prev => prev.map(q => q._key === item._key ? { ...q, unitL1: e.target.value, unitL2: '', unitL3: '' } : q))}
                            className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                            <option value="">-- Pilih L1 --</option>
                            {listL1.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        {item.unitL1 && (
                          <div>
                            <label className="text-slate-500 font-bold">Unit Kerja L2</label>
                            <select value={item.unitL2} onChange={e => setCrawlQueue(prev => prev.map(q => q._key === item._key ? { ...q, unitL2: e.target.value, unitL3: '' } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                              <option value="">-- Pilih L2 --</option>
                              {getListL2(item.unitL1).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {crawlQueue.length > 0 && (
                    <div className={`p-3 border-t shrink-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                      {bulkMsg && <p className={`text-xs font-bold mb-2 ${bulkMsg.startsWith('✓') ? 'text-emerald-500' : 'text-red-500'}`}>{bulkMsg}</p>}
                      <button onClick={handleBulkImport} disabled={bulkImporting}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-sm disabled:opacity-60">
                        {bulkImporting && <RefreshCw className="w-4 h-4 animate-spin" />}
                        Import {crawlQueue.length} File Terpilih
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── TAB: GOOGLE DRIVE ─── */}
            {importTab === 'drive' && (
              <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row gap-0">
                {/* Kiri: folder browser */}
                <div className={`w-full md:w-1/2 flex flex-col border-r overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  {/* Breadcrumb */}
                  <div className={`px-4 py-2.5 flex items-center gap-1 text-xs font-bold border-b shrink-0 flex-wrap ${isDarkMode ? 'border-slate-800 text-slate-400 bg-[#0F172A]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
                    <button onClick={() => { setDriveStack([]); fetchDriveFolder(DRIVE_ROOT); }} className="hover:underline text-emerald-500">Root</button>
                    {driveStack.map((f, i) => (
                      <React.Fragment key={f.id}>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <button onClick={() => {
                          const newStack = driveStack.slice(0, i + 1);
                          setDriveStack(newStack);
                          fetchDriveFolder(f.id);
                        }} className="hover:underline truncate max-w-24">{f.name}</button>
                      </React.Fragment>
                    ))}
                  </div>
                  {/* Back button */}
                  {driveStack.length > 0 && (
                    <button onClick={driveGoBack}
                      className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b ${isDarkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                      <ArrowLeft className="w-3 h-3" /> Kembali
                    </button>
                  )}
                  {/* Content */}
                  <div className="flex-1 overflow-y-auto">
                    {driveLoading && (
                      <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-medium">Memuat dari Google Drive...</span>
                      </div>
                    )}
                    {driveErr && (
                      <div className="p-4">
                        <div className={`p-4 rounded-xl flex gap-3 items-start ${isDarkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-sm">{driveErr}</p>
                            <button onClick={() => fetchDriveFolder(driveStack.length > 0 ? driveStack[driveStack.length - 1].id : DRIVE_ROOT)} className="text-xs underline mt-1">Coba lagi</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {!driveLoading && !driveErr && (
                      <>
                        {driveFolders.map(f => (
                          <button key={f.id} onClick={() => driveNavigateTo(f)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium border-b transition-colors ${isDarkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-50 text-slate-700 hover:bg-slate-50'}`}>
                            <Folder className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="truncate text-left">{f.name}</span>
                            <ChevronRight className="w-4 h-4 ml-auto text-slate-400 shrink-0" />
                          </button>
                        ))}
                        {driveFiles.map(f => {
                          const alreadyAdded = driveQueue.some(q => q.fileId === f.id);
                          return (
                            <div key={f.id} className={`flex items-center gap-3 px-4 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-50'}`}>
                              <FileText className="w-4 h-4 shrink-0 text-red-400" />
                              <span className={`flex-1 truncate text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{f.name}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-red-100 text-red-600">PDF</span>
                              <button onClick={() => alreadyAdded ? setDriveQueue(prev => prev.filter(q => q.fileId !== f.id)) : driveAddFile(f)}
                                className={`shrink-0 p-1.5 rounded-lg transition-all ${alreadyAdded ? 'bg-emerald-100 text-emerald-600 hover:bg-red-100 hover:text-red-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white'}`}>
                                {alreadyAdded ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </button>
                            </div>
                          );
                        })}
                        {driveFolders.length === 0 && driveFiles.length === 0 && !driveLoading && (
                          <p className="text-center text-slate-400 text-sm py-10">Tidak ada folder atau file PDF</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Kanan: antrian file terpilih */}
                <div className="w-full md:w-1/2 flex flex-col overflow-hidden">
                  <div className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b shrink-0 ${isDarkMode ? 'border-slate-800 text-slate-400 bg-[#0F172A]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
                    Dipilih ({driveQueue.length}) — klik + pada file untuk menambahkan
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {driveQueue.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <Plus className="w-10 h-10 opacity-20" />
                        <p className="text-sm font-medium">Belum ada file dipilih</p>
                      </div>
                    )}
                    {driveQueue.map((item) => (
                      <div key={item._key} className={`p-3 rounded-xl border space-y-2 text-xs ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-bold text-sm leading-tight ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{item.nama}</p>
                          <button onClick={() => setDriveQueue(prev => prev.filter(q => q._key !== item._key))}
                            className="text-red-400 hover:text-red-600 shrink-0">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-slate-500 font-bold">Jenis</label>
                            <select value={item.jenis} onChange={e => setDriveQueue(prev => prev.map(q => q._key === item._key ? { ...q, jenis: e.target.value } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                              <option>Proses Bisnis</option><option>SOP</option><option>Standar Pelayanan</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-slate-500 font-bold">Tahun</label>
                            <input type="number" value={item.tahun} onChange={e => setDriveQueue(prev => prev.map(q => q._key === item._key ? { ...q, tahun: e.target.value } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
                          </div>
                        </div>
                        <div>
                          <label className="text-slate-500 font-bold">Unit Kerja L1</label>
                          <select value={item.unitL1} onChange={e => setDriveQueue(prev => prev.map(q => q._key === item._key ? { ...q, unitL1: e.target.value, unitL2: '', unitL3: '' } : q))}
                            className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                            <option value="">-- Pilih L1 --</option>
                            {listL1.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                        {item.unitL1 && (
                          <div>
                            <label className="text-slate-500 font-bold">Unit Kerja L2</label>
                            <select value={item.unitL2} onChange={e => setDriveQueue(prev => prev.map(q => q._key === item._key ? { ...q, unitL2: e.target.value, unitL3: '' } : q))}
                              className={`w-full mt-0.5 px-2 py-1 rounded-lg border text-xs ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                              <option value="">-- Pilih L2 --</option>
                              {getListL2(item.unitL1).map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="text-slate-500 font-bold">Link</label>
                          <p className="text-blue-500 truncate mt-0.5">{item.link}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {driveQueue.length > 0 && (
                    <div className={`p-3 border-t shrink-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                      {driveMsg && <p className={`text-xs font-bold mb-2 ${driveMsg.startsWith('✓') ? 'text-emerald-500' : 'text-red-500'}`}>{driveMsg}</p>}
                      <button onClick={handleDriveImport} disabled={driveImporting}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-sm disabled:opacity-60">
                        {driveImporting && <RefreshCw className="w-4 h-4 animate-spin" />}
                        Import {driveQueue.length} File dari Drive
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <div className="overflow-auto p-4 md:p-6 lg:p-8 xl:py-5 scroll-smooth h-full">
        {activeMenu === 'dashboard' && (
          <div className={"max-w-400 mx-auto space-y-6 animate-in fade-in duration-500 pb-12 xl:h-full xl:min-h-0 xl:flex xl:flex-col xl:space-y-3 xl:pb-0"}>

            {/* Judul + tab tahun — sebaris di layar lebar agar hemat tinggi */}
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-8 xl:mb-0 shrink-0">
              <div className="order-2 xl:order-1 min-w-0">
                <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                  {level === 1
                    ? dashboardTab === '2026' ? 'Dashboard Monitoring 2026' : 'Arsip Probis & SOP 2023–2025'
                    : level === 2 ? selectedL1 : (selectedL2 || selectedL1 || `Semua Dokumen${filterJenis !== 'Semua' ? ` — ${filterJenis}` : ''}`)}
                </h2>
                <p className={`mt-2 xl:mt-1 font-medium transition-colors text-sm md:text-base xl:hidden 2xl:block ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {level === 1
                    ? dashboardTab === '2026'
                      ? 'Rekapitulasi Dokumen Ketatalaksanaan Tahun 2026'
                      : 'Dokumen Proses Bisnis dan SOP yang Telah Ditetapkan Tahun 2023–2025'
                    : level === 2 ? 'Rincian Rekapitulasi per Unit Kerja' : (selectedL2 ? 'Daftar Dokumen Detail' : selectedL1 ? `Semua Dokumen di ${selectedL1}` : 'Seluruh unit kerja')}
                </p>
              </div>
              <div className="order-1 xl:order-2 flex flex-wrap items-center gap-3 shrink-0">
                {level > 1 && <button onClick={() => { setLevel(level === 3 && !selectedL1 ? 1 : level - 1); setFilterJenis('Semua'); setFilterTahun('Semua'); setSearchQuery(''); }} className={`flex items-center px-4 py-2.5 border rounded-xl shadow-sm transition-all font-semibold text-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}><ArrowLeft className="w-4 h-4 mr-2" /> Kembali</button>}
                <div className={`flex flex-wrap gap-1 p-1 rounded-2xl w-fit max-w-full ${isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-100'}`}>
                  <button
                    onClick={() => setDashboardTab('2026')}
                    className={`px-5 py-3 xl:py-2 rounded-xl text-sm font-extrabold transition-all duration-200 ${
                      dashboardTab === '2026'
                        ? isDarkMode ? 'bg-blue-600 text-white shadow-lg' : 'bg-[#002855] text-white shadow-md'
                        : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    2026 — Terbaru
                  </button>
                  <button
                    onClick={() => setDashboardTab('arsip')}
                    className={`px-5 py-3 xl:py-2 rounded-xl text-sm font-extrabold transition-all duration-200 ${
                      dashboardTab === 'arsip'
                        ? isDarkMode ? 'bg-amber-600 text-white shadow-lg' : 'bg-[#A29061] text-white shadow-md'
                        : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    2023 – 2025
                  </button>
                </div>
              </div>
            </div>

            <div className={"flex flex-col xl:flex-row gap-5 items-start xl:items-stretch xl:flex-1 xl:min-h-0"}>

            {/* ── KOLOM KIRI: tabel rekapitulasi ── */}
            <div className={"w-full min-w-0 flex-1 order-2 xl:order-1 space-y-4 xl:flex xl:flex-col xl:min-h-0 xl:space-y-3"}>

            {loading && <div className="flex items-center justify-center py-4 gap-2 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Memuat data...</span></div>}

            <div className={`rounded-2xl border shadow-sm overflow-hidden transition-colors xl:flex xl:flex-col xl:max-h-full xl:min-h-0 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className={`p-4 md:p-5 xl:p-4 border-b flex flex-col 2xl:flex-row justify-between items-stretch 2xl:items-center gap-3 xl:gap-2.5 shrink-0 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
                <h3 className={`text-base md:text-lg font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{level === 1 ? 'Rekapitulasi Total Masing-Masing Unit Kerja' : level === 2 ? `Sub-Unit: ${selectedL1}` : `Data Detail: ${selectedL2 || selectedL1 || 'Seluruh Unit Kerja'}`}</h3>
                {(
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center w-full 2xl:w-auto gap-2.5">
                    <div className="relative w-full sm:flex-1 sm:min-w-48 2xl:w-72 2xl:flex-none"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-400" /></div><input type="text" placeholder="Cari nama dokumen, unit kerja, atau sumber..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#151F32]' : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'}`} /></div>
                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}><Filter className="w-4 h-4 text-slate-400 ml-2" /><select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}><option value="Semua">Semua Jenis</option><option value="Proses Bisnis">Proses Bisnis</option><option value="SOP">SOP</option><option value="Standar Pelayanan">Standar Pelayanan</option></select></div>
                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}><select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}><option value="Semua">Semua Tahun</option>{uniqueTahunList.map(thn => <option key={thn} value={thn}>{thn}</option>)}</select></div>
                    {level === 2 && <button onClick={() => { setLevel(3); setSelectedL2(''); }} className="flex justify-center items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-md w-full sm:w-auto shrink-0 whitespace-nowrap"><Layers className="w-4 h-4 mr-2" /> Lihat Semua Dokumen</button>}
                    {level === 3 && <button onClick={handleExportExcel} className="flex justify-center items-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition shadow-md w-full sm:w-auto shrink-0 whitespace-nowrap"><Download className="w-4 h-4 mr-2" /> Unduh Excel</button>}
                    {level === 1 && currentUser?.role === 'admin' && (
                      <button
                        onClick={() => { setShowImportModal(true); setImportSource(dashboardTab === '2026' ? '2026' : 'arsip'); setImportTab('excel'); }}
                        className={`flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition shadow-md w-full sm:w-auto shrink-0 whitespace-nowrap ${dashboardTab === '2026'
                          ? (isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#003580] text-white')
                          : (isDarkMode ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-[#A29061] hover:bg-[#8c7a4b] text-white')}`}>
                        <UploadCloud className="w-4 h-4" /> {dashboardTab === '2026' ? 'Import Data 2026' : 'Import Data 2023–2025'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto xl:overflow-auto xl:min-h-0">
                <table className={`w-full text-xs md:text-sm text-left max-md:[&_th]:px-3 max-md:[&_td]:px-3 max-md:[&_th]:py-3 max-md:[&_td]:py-3 max-md:[&_tfoot_td]:py-4 ${level === 3 ? 'min-w-200' : 'min-w-150'} ${barisRapat ? 'md:[&_th]:px-5 md:[&_td]:px-5 md:[&_th]:py-2.5 md:[&_td]:py-2.5 md:[&_tfoot_td]:py-4' : ''}`}>
                  <thead className={`text-[10px] md:text-[11px] font-bold uppercase tracking-wider sticky top-0 z-20 [&_th]:bg-inherit ${isDarkMode ? 'bg-[#0F172A] text-slate-400 shadow-[inset_0_-1px_0_0_#1e293b]' : 'bg-slate-50 text-slate-400 shadow-[inset_0_-1px_0_0_#e2e8f0]'}`}>
                    <tr>
                      <th className="px-6 py-4 w-12 text-center">No</th>
                      <th className="px-6 py-4 min-w-48">{level === 3 ? 'Nama Dokumen / Layanan' : 'Unit Kerja'}</th>
                      {level === 3 && !selectedL1 && <th className="px-6 py-4">Unit Kerja (Level 1)</th>}
                      {level === 3 && <th className="px-6 py-4">Unit Kerja (Level 2)</th>}
                      {level === 3 && <th className="px-6 py-4">Unit Kerja (Level 3)</th>}
                      <th className={`px-6 py-4 ${level === 3 ? '' : 'text-right w-20'}`}>{level === 3 ? 'Jenis Dokumen' : 'Probis'}</th>
                      <th className={`px-6 py-4 ${level === 3 ? '' : 'text-right w-20'}`}>{level === 3 ? 'Tahun' : 'SOP'}</th>
                      <th className={`px-6 py-4 ${level === 3 ? '' : 'text-right w-28'}`}>{level === 3 ? 'Sumber Hukum' : 'Standar Pelayanan'}</th>
                      {level === 3 && <th className="px-6 py-4 text-center">Status</th>}
                      <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {level === 1 && rekapL1.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() => { setLevel(2); setSelectedL1(row.nama); }}
                        title={`Lihat sub-unit ${row.nama}`}
                        className={`border-b transition-colors group cursor-pointer ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-50 hover:bg-blue-50/60'}`}
                      >
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className={`px-6 py-4 font-bold whitespace-normal ${isDarkMode ? 'text-blue-100 group-hover:text-blue-300' : 'text-[#002855] group-hover:text-blue-700'}`}>{row.nama}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.probis === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.probis === 0 ? '–' : row.probis}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.sop === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sop === 0 ? '–' : row.sop}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.sp === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sp === 0 ? '–' : row.sp}</td>
                        <td className="px-6 py-4 text-center"><button onClick={(e) => { e.stopPropagation(); setLevel(2); setSelectedL1(row.nama); }} className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all opacity-80 group-hover:opacity-100 ${isDarkMode ? 'bg-blue-900/40 text-blue-400 group-hover:bg-blue-600 group-hover:text-white' : 'bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white'}`}>Detail <ChevronRight className="w-3.5 h-3.5 ml-1" /></button></td>
                      </tr>
                    ))}
                    {level === 2 && rekapL2.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() => { setLevel(3); setSelectedL2(row.nama); }}
                        title={`Lihat dokumen ${row.nama}`}
                        className={`border-b transition-colors group cursor-pointer ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-50 hover:bg-[#A29061]/10'}`}
                      >
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className={`px-6 py-4 font-bold whitespace-normal ${isDarkMode ? 'text-blue-100 group-hover:text-amber-300' : 'text-[#002855] group-hover:text-[#8c7a4b]'}`}>{row.nama}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.probis === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.probis === 0 ? '–' : row.probis}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.sop === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sop === 0 ? '–' : row.sop}</td>
                        <td className={`px-6 py-4 font-semibold text-right tabular-nums ${row.sp === 0 ? 'text-slate-400 font-normal' : isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sp === 0 ? '–' : row.sp}</td>
                        <td className="px-6 py-4 text-center"><button onClick={(e) => { e.stopPropagation(); setLevel(3); setSelectedL2(row.nama); }} className={`inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all opacity-80 group-hover:opacity-100 whitespace-nowrap ${isDarkMode ? 'bg-amber-900/30 text-amber-500 group-hover:bg-amber-600 group-hover:text-white' : 'bg-[#A29061]/10 text-[#A29061] group-hover:bg-[#A29061] group-hover:text-white'}`}>Lihat Dokumen <ChevronRight className="w-3.5 h-3.5 ml-1" /></button></td>
                      </tr>
                    ))}
                    {level === 3 && currentItems.map((doc, idx) => (
                      <tr key={doc.id} className={`border-b transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-blue-900/20' : 'border-slate-50 hover:bg-blue-50/30'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{indexOfFirstItem + idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}><button onClick={async () => { const _lnk = doc.link || ''; const _internal = _lnk.replace(/^\/e-sop-atrbpn/, ''); if (/^\/(bpmn|sop|sp)(\/|\?)/.test(_internal)) { router.push(_internal.includes('doc=') ? `${_internal}&n=${Date.now()}` : _internal); return; } setViewDoc(doc); setPreviewSvg(""); if (doc.jenis === 'Proses Bisnis' && doc.link.includes('id=')) { try { const bpmnId = doc.link.split('id=')[1].split('&')[0]; const res = await apiFetch(`/bpmn/models/${bpmnId}`, token); if (!res.ok) throw new Error("Gagal"); const data = await res.json(); if (data && data.svg_xml) setPreviewSvg(data.svg_xml); else setPreviewSvg(`<div class="p-6 text-center text-red-500 font-bold border border-red-200 bg-red-50 rounded-xl m-4">Diagram kosong.</div>`); } catch { setPreviewSvg(`<div class="p-6 text-center text-amber-600 font-bold border border-amber-200 bg-amber-50 rounded-xl m-4">Gagal memuat diagram secara otomatis. Silakan klik "Buka di Tab Baru".</div>`); } } }} className={`hover:underline text-left wrap-break-word ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}>{doc.nama}</button></td>
                        {!selectedL1 && <td className="px-6 py-4 text-slate-500">{doc.unitL1 || '-'}</td>}
                        <td className="px-6 py-4 text-slate-500">{doc.unitL2 || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{doc.unitL3 || '-'}</td>
                        <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${doc.jenis === 'Proses Bisnis' ? (isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700') : doc.jenis === 'SOP' ? (isDarkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700') : (isDarkMode ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>{doc.jenis}</span></td>
                        <td className="px-6 py-4 text-slate-500">{doc.tahun}</td>
                        <td className="px-6 py-4 italic text-slate-400 max-w-64 wrap-break-word">{doc.sumber}</td>
                        <td className="px-6 py-4 text-center">
                          {currentUser?.role === 'admin' ? (
                            <select value={doc.status || 'draft'} onChange={(e) => handleApproval(doc, e.target.value)} className={`px-2 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider cursor-pointer outline-none shadow-sm border transition-all ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : doc.status === 'pending' ? 'bg-blue-100 text-blue-700 border-blue-200' : doc.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              <option value="draft">DRAFT</option><option value="pending">PENDING</option><option value="approved">APPROVED</option><option value="rejected">REJECTED</option>
                            </select>
                          ) : <span className={`px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : doc.status === 'pending' ? 'bg-blue-100 text-blue-700' : doc.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{doc.status || 'DRAFT'}</span>}
                        </td>
                        <td className="px-6 py-4 text-center space-x-3">{currentUser?.role === 'admin' ? <div className="flex gap-3 justify-center items-center"><button onClick={() => handleEdit(doc)} className="inline-flex items-center min-h-11 px-3 text-blue-500 hover:text-blue-600 font-bold text-xs transition-colors">Edit</button><button onClick={() => handleDelete(doc.id)} className="inline-flex items-center min-h-11 px-3 text-red-500 hover:text-red-600 font-bold text-xs transition-colors">Hapus</button></div> : <span className="text-slate-400 text-xs italic">hanya lihat</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  {level === 1 && rekapL1.length > 0 && (
                    <tfoot className={`sticky bottom-0 z-20 [&_td]:bg-inherit ${isDarkMode ? 'bg-[#0F172A] shadow-[inset_0_2px_0_0_#334155]' : 'bg-slate-50 shadow-[inset_0_2px_0_0_#e2e8f0]'}`}>
                      <tr>
                        <td className="px-6 py-4"></td>
                        <td className={`px-6 py-4 text-[11px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-slate-300' : 'text-[#002855]'}`}>Total Keseluruhan</td>
                        <td className={`px-6 py-4 font-extrabold text-right tabular-nums ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{rekapTotal.probis}</td>
                        <td className={`px-6 py-4 font-extrabold text-right tabular-nums ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{rekapTotal.sop}</td>
                        <td className={`px-6 py-4 font-extrabold text-right tabular-nums ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{rekapTotal.sp}</td>
                        <td className="px-6 py-4"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* BAGIAN PAGINASI */}
              {level === 3 && dokumenFiltered.length > 0 && (
                <div className={`flex flex-col sm:flex-row justify-between items-center p-4 border-t gap-3 shrink-0 ${isDarkMode ? 'border-slate-800 bg-[#0F172A]/50' : 'border-slate-100 bg-slate-50/50'}`}>
                  <div className={`flex items-center text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Menampilkan
                    <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className={`mx-2 border rounded-lg px-2 py-1 outline-none font-bold focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-200 text-[#002855]'}`}>
                      <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                    </select>
                    dari total {dokumenFiltered.length} data
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className={`p-3 rounded-xl border disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ChevronLeft className="w-5 h-5" /></button>
                    <span className={`px-4 py-2 text-sm font-bold rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-200 text-[#002855]'}`}>Hal {currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className={`p-3 rounded-xl border disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ChevronRight className="w-5 h-5" /></button>
                  </div>
                </div>
              )}
            </div>

            </div>
            {/* ── akhir kolom kiri ── */}

            {/* ── KOLOM KANAN: kartu ringkasan ── */}
            {level === 1 && (
              <div className="w-full xl:w-72 shrink-0 xl:self-start order-1 xl:order-2 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-4">
                {[
                  { key: 'Proses Bisnis',      label: 'Total Proses Bisnis', nilai: totalProbis, Icon: Activity, ikonKelas: isDarkMode ? 'bg-blue-900/30 text-blue-400'    : 'bg-blue-50 text-blue-600' },
                  { key: 'SOP',               label: 'Total SOP',           nilai: totalSOP,    Icon: BookOpen, ikonKelas: isDarkMode ? 'bg-amber-900/30 text-amber-500'  : 'bg-amber-50 text-[#A29061]' },
                  { key: 'Standar Pelayanan', label: 'Standar Pelayanan',   nilai: totalSP,     Icon: FileText, ikonKelas: isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600' },
                ].map(({ key, label, nilai, Icon, ikonKelas }) => (
                  <button
                    key={key}
                    onClick={() => { setFilterJenis(key); setSelectedL1(''); setSelectedL2(''); setCurrentPage(1); setLevel(3); }}
                    title={`Lihat seluruh dokumen ${label}`}
                    className={`text-left w-full p-5 rounded-2xl border shadow-sm transition-all flex items-center gap-4 cursor-pointer hover:-translate-y-0.5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}
                  >
                    <div className={`p-3.5 rounded-2xl shrink-0 ${ikonKelas}`}><Icon className="w-7 h-7" /></div>
                    <div className="min-w-0">
                      <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
                      <p className={`text-3xl font-extrabold tabular-nums leading-none ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{nilai}</p>
                      <p className={`text-[10px] font-medium mt-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Klik untuk lihat semua</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            </div>
            {/* ── akhir grid 2 kolom ── */}
          </div>
        )}

        {/* FORM TAMBAH/EDIT */}
        {activeMenu === 'tambah' && currentUser?.role === 'admin' && (
          <div className={`max-w-4xl mx-auto p-4 sm:p-6 md:p-10 rounded-2xl border shadow-lg animate-in fade-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-3xl font-extrabold mb-2 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{editingId ? 'Edit Data Dokumen' : 'Form Tambah Dokumen Baru'}</h2>
            <p className={`font-medium mb-10 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{editingId ? 'Perbarui informasi dokumen secara akurat.' : 'Silakan lengkapi form di bawah ini. Pastikan unit kerja dipilih secara berjenjang.'}</p>
            <form onSubmit={handleSimpanDokumen} className="space-y-8">
              <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nama Proses / Layanan <span className="text-red-500">*</span></label><input required type="text" value={formData.nama} onChange={(e) => setFormData({...formData, nama: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20 focus:border-[#A29061]'}`} placeholder="Cth: Penyusunan Rencana Strategis Tahunan" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Dokumen</label><select value={formData.jenis} onChange={(e) => setFormData({...formData, jenis: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20'}`}><option>Proses Bisnis</option><option>SOP</option><option>Standar Pelayanan</option></select></div>
                <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tahun Terbit</label><input required type="number" value={formData.tahun} onChange={(e) => setFormData({...formData, tahun: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20'}`} /></div>
              </div>
              <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50/80 border-slate-200/60'}`}>
                <h4 className={`text-sm font-extrabold mb-4 uppercase tracking-wider ${isDarkMode ? 'text-blue-400' : 'text-[#002855]'}`}>Pemetaan Unit Kerja</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">Level 1 (Unit Utama) <span className="text-red-500">*</span></label>
                    <SearchableSelect
                      options={localUnitTree.map(n => n.nama)}
                      value={formData.unitL1}
                      onChange={v => setFormData({ ...formData, unitL1: v, unitL2: '', unitL3: '' })}
                      placeholder="Cari dan pilih unit utama..."
                      dm={isDarkMode}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">Level 2 (Direktorat/Biro)</label>
                    <SearchableSelect
                      options={localUnitTree.find(n => n.nama === formData.unitL1)?.children.map(c => c.nama) || []}
                      value={formData.unitL2}
                      onChange={v => setFormData({ ...formData, unitL2: v, unitL3: '' })}
                      placeholder={formData.unitL1 ? 'Cari sub-unit...' : 'Pilih Level 1 dahulu'}
                      disabled={!formData.unitL1}
                      dm={isDarkMode}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">Level 3 (Subdit/Bagian)</label>
                    <SearchableSelect
                      options={localUnitTree.find(n => n.nama === formData.unitL1)?.children.find(c => c.nama === formData.unitL2)?.children.map(c => c.nama) || []}
                      value={formData.unitL3}
                      onChange={v => setFormData({ ...formData, unitL3: v })}
                      placeholder={formData.unitL2 ? 'Cari sub-sub-unit...' : 'Pilih Level 2 dahulu'}
                      disabled={!formData.unitL2}
                      dm={isDarkMode}
                    />
                  </div>
                </div>
              </div>
              <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Link Dokumen Terlampir</label><input type="url" value={formData.link} onChange={(e) => setFormData({...formData, link: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Tempel link Google Drive atau sumber lainnya..." /></div>
              <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sumber Dokumen/Dasar Hukum Terkait</label><textarea rows={3} value={formData.sumber} onChange={(e) => setFormData({...formData, sumber: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all resize-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Cth: Keputusan Menteri ATR/BPN No..."></textarea></div>
              {saveError && <div className="p-3 bg-red-500/10 border border-red-400/30 rounded-xl"><p className="text-red-500 text-sm font-medium">{saveError}</p></div>}
              <div className={`pt-8 border-t flex flex-wrap justify-end gap-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <button type="button" onClick={backToDashboard} className={`px-6 py-3 font-extrabold rounded-xl transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Batal</button>
                <button type="submit" disabled={saving} className={`px-8 py-3 font-extrabold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center gap-2 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>{saving && <RefreshCw className="w-4 h-4 animate-spin" />}{editingId ? 'Simpan Perubahan Data' : 'Simpan Dokumen Baru'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
export default function Page() {
  return (
    <Suspense>
      <DashboardBPN />
    </Suspense>
  );
}
