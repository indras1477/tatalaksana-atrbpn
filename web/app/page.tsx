"use client";
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Home, FilePlus, ChevronRight, ArrowLeft, Download, FileText, 
  Activity, BookOpen, Filter, X, Eye, EyeOff, Search, ChevronLeft, 
  Settings, Sun, Moon, LogOut, Users, RefreshCw, Layers, ExternalLink, FolderOpen,
  GitBranch, FileSignature
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';

import { useRouter } from 'next/navigation';

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

// --- DATA HIERARKI UNIT KERJA (L1 -> L2 -> L3) ---
const HIERARKI_UNIT: Record<string, Record<string, string[]>> = {
  "SEKRETARIAT JENDERAL": {
    "Biro Perencanaan dan Kerja Sama": ["Bagian Perencanaan Program", "Bagian Penganggaran", "Bagian Pemantauan, Evaluasi, dan Pelaporan Kinerja", "Bagian Kerja Sama dan Tata Usaha"],
    "Biro Sumber Daya Manusia": ["Bagian Pengadaan dan Kesejahteraan", "Bagian Kinerja dan Manajemen Talenta", "Bagian Mutasi"],
    "Biro Organisasi, Tata Laksana, dan Manajemen Risiko": ["Bagian Organisasi", "Bagian Tata Laksana dan Reformasi Birokrasi", "Bagian Analisis Jabatan", "Bagian Manajemen Risiko"],
    "Biro Keuangan dan Barang Milik Negara": ["Bagian Penerimaan Negara Bukan Pajak", "Bagian Perbendaharaan", "Bagian Akuntansi dan Pelaporan", "Bagian Administrasi Pengelolaan BMN"],
    "Biro Hukum": ["Bagian Perundang-undangan I", "Bagian Perundang-undangan II", "Bagian Advokasi dan Dokumentasi Hukum"],
    "Biro Hubungan Masyarakat dan Protokol": ["Bagian Pemberitaan, Media, dan Hubungan Antar Lembaga", "Bagian Informasi Publik dan Pengaduan Masyarakat", "Bagian Tata Usaha Pimpinan dan Protokol"],
    "Biro Umum dan Layanan Pengadaan": ["Bagian Tata Naskah, Kearsipan, dan Tata Usaha", "Bagian Rumah Tangga dan Perlengkapan", "Bagian Layanan Pengadaan Barang/Jasa"],
    "Pusat Data dan Informasi Pertanahan dan Tata Ruang": ["Bidang Tata Kelola dan Infrastruktur TI", "Bidang Inovasi dan Pengembangan Sistem Informasi", "Bidang Pengelolaan Data dan Penyajian Informasi"]
  },
  "DIREKTORAT JENDERAL TATA RUANG": {
    "Sekretariat Direktorat Jenderal Tata Ruang": ["Bagian Program, Keuangan, dan Umum", "Bagian Hukum dan Kepegawaian", "Bagian Manajemen Risiko"],
    "Direktorat Perencanaan Tata Ruang": ["Subdirektorat Perencanaan Tata Ruang Nasional", "Subdirektorat Pedoman Tata Ruang", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional I", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional II", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional III"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah I": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.C", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.D", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.E"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah II": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.C", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.D", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.E"],
    "Direktorat Sinkronisasi Pemanfaatan Ruang": ["Subdirektorat Sinkronisasi Pemanfaatan Ruang Wilayah A", "Subdirektorat Sinkronisasi Pemanfaatan Ruang Wilayah B", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang C", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang D", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang E"]
  },
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": {
    "Sekretariat Direktorat Jenderal Survei dan Pemetaan": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengukuran dan Pemetaan Kadastral": ["Subdirektorat Pengukuran dan Pemetaan Bidang", "Subdirektorat Pengukuran dan Pemetaan Ruang", "Subdirektorat Penanganan Masalah dan Peningkatan Kualitas Kadastral"],
    "Direktorat Pengukuran dan Pemetaan Dasar": ["Subdirektorat Pemetaan dan Pengelolaan Data Dasar", "Subdirektorat Pengukuran Dasar dan Peralatan", "Subdirektorat Pemetaan dan Pengelolaan Model Dasar dan Ruang"],
    "Direktorat Survei dan Pemetaan Tematik": ["Subdirektorat Tematik Pertanahan dan Ruang", "Subdirektorat Tematik Kawasan", "Subdirektorat Layanan Informasi Geospasial Tematik Multiguna"]
  },
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": {
    "Sekretariat Direktorat Jenderal PENETAPAN HAK DAN PENDAFTARAN TANAH": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengaturan dan Penetapan Hak Atas Tanah": ["Subdirektorat Penetapan Hak Guna Usaha", "Subdirektorat Penetapan Hak Guna Bangunan", "Subdirektorat Penetapan Hak Pakai, Ruang Atas Tanah, dan Ruang Bawah Tanah"],
    "Direktorat Pengaturan Pendaftaran Tanah dan Ruang, Pejabat Pembuat Akta Tanah, dan Mitra Kerja": ["Subdirektorat Pengaturan Pendaftaran Tanah dan Ruang", "Subdirektorat Pengembangan Pemeliharaan Hak atas Tanah dan Ruang", "Subdirektorat Pengelolaan Pejabat Pembuah Akta Tanah dan Mitra Kerja"],
    "Direktorat Hubungan Kelembagaan": ["Subdirektorat Hubungan Kelembagaan", "Subdirektorat Pengembangan Layanan Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENATAAN AGRARIA": {
    "Sekretariat Direktorat Jenderal Penataan Agraria": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Landreform": ["Subdirektorat Pengelolaan Penguasaan Tanah, Pemilikan, Penggunaan dan Pemanfataan Tanah", "Subdirektorat Penetapan Potensi Redistribusi", "Subdirektorat Pengaturan Redistribusi Tanah"],
    "Direktorat Pemberdayaan Tanah Masyarakat": ["Subdirektorat Pengembangan Model Akses Reforma Agraria", "Subdirektorat Fasilitasi dan Kerja Sama Akses Reformasi Agraria", "Subdirektorat Pengaturan dan Pengelolaan Akses Reforma Agraria"],
    "Direktorat Penatagunaan Tanah": ["Subdirektorat Penataan dan Koodinasi Sektoral dan Regional", "Subdirektorat Penataan Wilayah Pesisir Kecil, Perbatasan, dan Wilayah Tertentu", "Subdirektorat Layanan dan Pengembangan Penatagunaan Tanah"]
  },
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": {
    "Sekretariat Direktorat Jenderal Pengadaan Tanah": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Bina Pengadaan and Pencadangan Tanah": ["Subdirektorat Bina Pengadaan Tanah Wilayah I", "Subdirektorat Bina Pengadaan Tanah Wilayah II", "Subdirektorat Pencadangan Tanah dan Kerjasama Pengadaan Lintas Rektor"],
    "Direktorat Konsolidasi Tanah dan Pengembangan": ["Subdirektorat Penyelenggaraan Konsolidasi Tanah Wilayah I", "Subdirektorat Penyelenggaraan Konsolidasi Tanah Wilayah II", "Subdirektorat Pengembangan Pertanahan dan Pemanfaatan Tanah"],
    "Direktorat Penilaian Tanah dan Ekonomi Pertanahan": ["Subdirektorat Penyediaan dan Pemanfaatan Nilai Tanah", "Subdirektorat Penilaian Tanah dan Dampak Sosial", "Subdirektorat Pendayagunaan Ekonomi Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": {
    "Sekretariat Direktorat Jenderal Pengendalian dan Penertiban Tanah dan Ruang": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Pengendalian Pemanfaatan Ruang": ["Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah I", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah II", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah III", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah IV", "Subdirektorat Pengawasan Penataan Ruang"],
    "Direktorat Penertiban Pemanfaatan Ruang": ["Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah I", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah II", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah III", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah IV"],
    "Direktorat Pengendalian Hak Tanah, Alih Fungsi Lahan, Kepulauan, dan Wilayah Tertentu": ["Subdirektorat Pengendalian Hak Tanah, Kepulauan, dan Wilayah Tertentu Wilayah I", "Subdirektorat Pengendalian Hak Tanah, Kepulauan, dan Wilayah Tertentu Wilayah II", "Subdirektorat Pengendalian Alih Fungsi Lahan"],
    "Direktorat Penertiban Penguasaan, Pemilikan, dan Penggunaan Tanah": ["Subdirektorat Potensi Penertiban Tanah", "Subdirektorat Penertiban Penguasaan dan Pemilikan Tanah", "Subdirektorat Penertiban Penggunaan dan Pemanfaatan Tanah"]
    
  },
  "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": {
    "Sekretariat Direktorat Jenderal Penanganan Sengketa": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Penanganan Sengketa Pertanahan": ["Subdirektorat Penanganan Sengketa Penetapan Hak dan Pendaftaran Tanah", "Subdirektorat Penanganan Sengketa Batas Bidang Tanah", "Subdirektorat Penanganan Sengketa Penguasaan dan Pemilikan Tanah"],
    "Direktorat Penanganan Perkara Pertanahan": ["Subdirektorat Penanganan Perkara Wilayah I", "Subdirektorat Penanganan Perkara Wilayah II", "Subdirektorat Penanganan Perkara Wilayah III"],
    "Direktorat Pencegahan dan Penanganan Konflik Pertanahan": ["Subdirektorat Penanganan Konflik Kelompok Masyarakat dan Tanah Ulayat", "Subdirektorat Penanganan Konflik Instansi Pemerintah/Badan Usaha Milik Negara/Badan Usaha Milik Daerah", "Subdirektorat Pencegahan dan Hubungan Kelembagaan"]
  
  },
  "INSPEKTORAT JENDERAL": {
    "Sekretariat Inspektorat Jenderal": ["Bagian Program, Hukum, dan Tata Kelola", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Inspektur Wilayah I": ["Auditor Wilayah I"],
    "Inspektur Bidang Investigasi": ["Auditor Investigasi"]
  },
  "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA": {
    "Sekretariat Badan Pengembangan SDM": ["Bagian Perencanaan dan Umum"],
    "Pusat Pembinaan Jabatan Fungsional": ["Bidang Jabatan Fungsional"],
    "Pusat Pengembangan Kompetensi SDM": ["Bidang Pengembangan SDM"]
  },
  "SEKOLAH TINGGI PERTANAHAN NASIONAL": {
    "Sekolah Tinggi Pertanahan Nasional": ["Bagian Akademik", "Bagian Administrasi Umum"]
  }
};

const CHART_LABELS: Record<string, string> = {
  "SEKRETARIAT JENDERAL": "SETJEN", 
  "DIREKTORAT JENDERAL TATA RUANG": "TARU", 
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": "SPPR",
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": "PHPT", 
  "DIREKTORAT JENDERAL PENATAAN AGRARIA": "PENTAG", 
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": "PENGADAAN",
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": "PENGENDALIAN", 
  "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": "PSKP",
  "INSPEKTORAT JENDERAL": "ITJEN", 
  "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA": "BPSDM", 
  "SEKOLAH TINGGI PERTANAHAN NASIONAL": "STPN"
};

const listL1 = Object.keys(HIERARKI_UNIT);
const getListL2 = (l1: string) => l1 && HIERARKI_UNIT[l1] ? Object.keys(HIERARKI_UNIT[l1]) : [];
const getListL3 = (l1: string, l2: string) => l1 && l2 && HIERARKI_UNIT[l1]?.[l2] ? HIERARKI_UNIT[l1][l2] : [];

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

export default function DashboardBPN() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{id: number; username: string; role: string; nama_lengkap?: string} | null>(null);
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  
  const [unitL1List, setUnitL1List] = useState<{id: number; nama: string}[]>([]);
  const [unitL2List, setUnitL2List] = useState<{id: number; nama: string; l1_id: number}[]>([]);
  const [unitL3List, setUnitL3List] = useState<{id: number; nama: string; l2_id: number}[]>([]);

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
  const [level, setLevel] = useState(1);
  const [selectedL1, setSelectedL1] = useState('');
  const [selectedL2, setSelectedL2] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const [dokumenList, setDokumenList] = useState<Dokumen[]>([]);
  const [filterJenis, setFilterJenis] = useState('Semua');
  const [filterTahun, setFilterTahun] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewDoc, setViewDoc] = useState<Dokumen | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string>(""); 
  const [showChart, setShowChart] = useState(true);
  const [chartFilterSatker, setChartFilterSatker] = useState('Semua');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterJenis, filterTahun, selectedL1, selectedL2]);

  useEffect(() => {
    if (!token) return;
    apiFetch('/unit-kerja/l1', token)
      .then(r => r.json())
      .then(data => setUnitL1List(Array.isArray(data) ? data : []))
      .catch(() => {});
    apiFetch('/unit-kerja/l2', token)
      .then(r => r.json())
      .then(data => setUnitL2List(Array.isArray(data) ? data : []))
      .catch(() => {});
    apiFetch('/unit-kerja/l3', token)
      .then(r => r.json())
      .then(data => setUnitL3List(Array.isArray(data) ? data : []))
      .catch(() => {});
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

  const totalProbis = dokumenList.filter(d => d.jenis === 'Proses Bisnis').length;
  const totalSOP = dokumenList.filter(d => d.jenis === 'SOP').length;
  const totalSP = dokumenList.filter(d => d.jenis === 'Standar Pelayanan').length;

  const rekapL1 = useMemo(() => {
    return listL1.map(unitL1 => {
      const docs = dokumenList.filter(d => d.unitL1 === unitL1);
      return {
        nama: unitL1, 
        labelChart: CHART_LABELS[unitL1] || unitL1.substring(0, 5),
        probis: docs.filter(d => d.jenis === 'Proses Bisnis').length,
        sop: docs.filter(d => d.jenis === 'SOP').length,
        sp: docs.filter(d => d.jenis === 'Standar Pelayanan').length,
      };
    });
  }, [dokumenList]);

  const chartData = useMemo(() => {
    if (chartFilterSatker === 'Semua') return rekapL1;
    return rekapL1.filter((item) => item.nama === chartFilterSatker);
  }, [rekapL1, chartFilterSatker]);

  const rekapL2 = useMemo(() => {
    if (!selectedL1) return [];
    return getListL2(selectedL1).map(unitL2 => {
      const docs = dokumenList.filter(d => d.unitL1 === selectedL1 && d.unitL2 === unitL2);
      return {
        nama: unitL2,
        probis: docs.filter(d => d.jenis === 'Proses Bisnis').length,
        sop: docs.filter(d => d.jenis === 'SOP').length,
        sp: docs.filter(d => d.jenis === 'Standar Pelayanan').length,
      };
    });
  }, [selectedL1, dokumenList]);

  const dokumenFiltered = useMemo(() => {
    const filtered = dokumenList.filter(d => {
      const matchUnit = d.unitL1 === selectedL1 && (!selectedL2 || d.unitL2 === selectedL2);
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
  }, [dokumenList, selectedL1, selectedL2, filterJenis, filterTahun, searchQuery]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = dokumenFiltered.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(dokumenFiltered.length / itemsPerPage);
  const uniqueTahunList = Array.from(new Set(
    dokumenList.filter(d => d.unitL1 === selectedL1 && (!selectedL2 || d.unitL2 === selectedL2)).map(d => d.tahun)
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
   
  const handleL1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newL1 = e.target.value; 
    setFormData({ ...formData, unitL1: newL1, unitL2: '', unitL3: '' });
  };
   
  const handleL2Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newL2 = e.target.value;
    setFormData({ ...formData, unitL2: newL2, unitL3: '' });
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
      setActiveMenu('dashboard'); setEditingId(null);
      setFormData({ 
        nama: '', jenis: 'Proses Bisnis', tahun: new Date().getFullYear().toString(), 
        unitL1: '', unitL2: '', unitL3: '', 
        link: '', sumber: '' 
      });
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
   
  const handleLogout = async () => {
    try { if (token) await apiFetch('/auth/logout', token, { method: 'POST' }); } catch { /* ignore */ }
    localStorage.removeItem('token'); localStorage.removeItem('user');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    
    window.location.replace(window.location.origin + '/e-sop-atrbpn/login/');
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
    <div 
      className={`flex h-screen font-sans overflow-hidden transition-colors duration-500 ease-in-out ${
        isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'
      }`}
    >

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
                <div className="flex items-center text-xs text-slate-500 mt-1.5 space-x-2">
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
                  <div className="bg-white p-8 rounded-xl shadow-xl max-w-full max-h-full overflow-auto animate-in fade-in duration-500" dangerouslySetInnerHTML={{ __html: previewSvg }} />
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
                  let finalLink = viewDoc.link;
                  if (viewDoc.jenis === 'Proses Bisnis' && finalLink.includes('bpmn?id=')) {
                    finalLink = finalLink.startsWith('/bpmn') ? `/e-sop-atrbpn${finalLink}` : finalLink.replace('.my.id/bpmn', '.my.id/e-sop-atrbpn/bpmn');
                    return `${finalLink}&mode=view`;
                  }
                  return finalLink;
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

      {/* SIDEBAR */}
      <div className="w-72 bg-linear-to-b from-[#001F43] to-[#000F24] text-white flex flex-col shadow-2xl z-10 shrink-0 m-4 rounded-3xl border border-white/10 relative overflow-hidden ring-1 ring-black/5">
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-[#A29061] rounded-full mix-blend-screen filter blur-[70px] opacity-40 pointer-events-none"></div>
        <div className="p-8 border-b border-white/10 relative z-10">
          <div className="w-12 h-12 bg-linear-to-br from-[#A29061] to-[#807047] rounded-2xl flex items-center justify-center shadow-lg shadow-[#A29061]/30 mb-4">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-wide">TATA LAKSANA</h1>
          <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-[0.2em] font-semibold">Kementerian ATR/BPN</p>
        </div>

        <div className="flex-1 py-6 px-4 relative z-10 overflow-y-auto">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">Menu Utama</p>
          
          <button
            onClick={() => { setActiveMenu('dashboard'); setLevel(1); setSearchQuery(''); setIsSettingsOpen(false); setIsStudioOpen(false); }}
            className={`w-full flex items-center px-4 py-3.5 mb-3 rounded-2xl transition-all duration-300 group ${
              activeMenu === 'dashboard' 
                ? 'bg-linear-to-r from-[#A29061] to-[#8c7a4b] text-white shadow-lg shadow-[#A29061]/25 font-bold scale-[1.02]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <Home className={`w-5 h-5 mr-3 transition-colors ${activeMenu === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} />
            Dashboard Monitoring
          </button>

          <button
            onClick={() => { resetFormTambah(); setIsSettingsOpen(false); setIsStudioOpen(false); }}
            className={`w-full flex items-center px-4 py-3.5 mb-3 rounded-2xl transition-all duration-300 group ${
              activeMenu === 'tambah' && editingId === null 
                ? 'bg-linear-to-r from-[#A29061] to-[#8c7a4b] text-white shadow-lg shadow-[#A29061]/25 font-bold scale-[1.02]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <FilePlus className={`w-5 h-5 mr-3 transition-colors ${activeMenu === 'tambah' && editingId === null ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} />
            Tambah Dokumen
          </button>

          {currentUser?.role === 'admin' && (
            <button
              onClick={() => window.location.href = '/e-sop-atrbpn/users'}
              className="w-full flex items-center px-4 py-3.5 mb-3 rounded-2xl transition-all duration-300 group text-slate-400 hover:bg-white/5 hover:text-white font-medium"
            >
              <Users className="w-5 h-5 mr-3 text-slate-500 group-hover:text-white" />
              Manajemen User
            </button>
          )}

          {/* ================================================================= */}
          {/* MENU DROPDOWN STUDIO PEMODELAN (BPMN & SOP)                       */}
          {/* ================================================================= */}
          <button
            onClick={() => setIsStudioOpen(!isStudioOpen)}
            className={`w-full flex items-center justify-between px-4 py-3.5 mb-1 rounded-2xl transition-all duration-300 group ${
              isStudioOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'
            }`}
          >
            <div className="flex items-center">
              <Layers className={`w-5 h-5 mr-3 transition-colors ${isStudioOpen ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} />
              Studio Pemodelan
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isStudioOpen ? 'rotate-90' : ''}`} />
          </button>

          <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isStudioOpen ? 'max-h-32 opacity-100 mb-3' : 'max-h-0 opacity-0'}`}>
            <div className="mx-2 p-2 bg-black/20 rounded-2xl border border-white/5 backdrop-blur-sm shadow-inner flex flex-col gap-1">
              <button
                onClick={() => router.push('/bpmn')}
                className="w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
              >
                <GitBranch className="w-4 h-4 mr-3 text-blue-400 group-hover:scale-110 transition-transform" />
                BPMN Modeling
              </button>
              <button
                onClick={() => router.push('/sop')}
                className="w-full flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
              >
                <FileSignature className="w-4 h-4 mr-3 text-emerald-400 group-hover:scale-110 transition-transform" />
                SOP Modeling
              </button>
            </div>
          </div>
          {/* ================================================================= */}

          <div className="mt-8">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">Sistem</p>
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group mb-2 ${isSettingsOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}`}
            >
              <div className="flex items-center">
                <Settings className={`w-5 h-5 mr-3 transition-colors ${isSettingsOpen ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} /> 
                Pengaturan
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSettingsOpen ? 'rotate-90' : ''}`} />
            </button>

            <button onClick={handleLogout} className="w-full flex items-center px-4 py-3.5 rounded-2xl transition-all duration-300 group text-red-400 hover:bg-red-900/30 font-medium">
              <LogOut className="w-5 h-5 mr-3" /> Keluar
            </button>

            <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isSettingsOpen ? 'max-h-32 opacity-100 mb-4' : 'max-h-0 opacity-0'}`}>
              <div className="mx-2 p-3 bg-black/20 rounded-2xl border border-white/5 backdrop-blur-sm shadow-inner">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">Tema Tampilan</p>
                <div className="relative flex items-center bg-black/40 rounded-xl p-1">
                  <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out shadow-md ${isDarkMode ? 'translate-x-[calc(100%+0px)] bg-linear-to-r from-indigo-500 to-purple-500' : 'translate-x-0 bg-linear-to-r from-amber-400 to-orange-400'}`}></div>
                  <button onClick={() => setIsDarkMode(false)} className={`relative z-10 flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-lg transition-colors duration-300 ${!isDarkMode ? 'text-white' : 'text-slate-400 hover:text-white'}`}><Sun className="w-3.5 h-3.5 mr-1.5" /> Terang</button>
                  <button onClick={() => setIsDarkMode(true)} className={`relative z-10 flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-lg transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-slate-400 hover:text-white'}`}><Moon className="w-3.5 h-3.5 mr-1.5" /> Gelap</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 relative z-10 border-t border-white/5 bg-black/10 mt-auto">
          <div className="flex items-center p-3 rounded-2xl cursor-default transition-colors">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-blue-600 to-blue-800 flex justify-center items-center font-bold text-white shadow-inner text-sm">
              {(currentUser?.nama_lengkap || currentUser?.username || 'U').substring(0, 2).toUpperCase()}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">{currentUser?.nama_lengkap || currentUser?.username || 'Pengguna'}</p>
              <p className="text-[10px] text-slate-400 font-medium capitalize">{currentUser?.role || 'viewer'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KONTEN UTAMA */}
      <div className="flex-1 overflow-auto p-4 md:p-8 md:pl-2 scroll-smooth">
        {activeMenu === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className={`text-3xl md:text-4xl font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{level === 1 ? 'Dashboard Monitoring' : level === 2 ? selectedL1 : (selectedL2 || 'Semua Dokumen')}</h2>
                <p className={`mt-2 font-medium transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{level === 1 ? 'Rekapitulasi Dokumen Ketatalaksanaan Seluruh Unit Kerja' : level === 2 ? 'Rincian Rekapitulasi per Unit Kerja' : (selectedL2 ? 'Daftar Dokumen Detail' : `Semua Dokumen di ${selectedL1}`)}</p>
              </div>
              {level > 1 && <button onClick={() => { setLevel(level - 1); setFilterJenis('Semua'); setFilterTahun('Semua'); setSearchQuery(''); }} className={`flex items-center px-5 py-2.5 border rounded-xl shadow-sm transition-all font-semibold ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}><ArrowLeft className="w-4 h-4 mr-2" /> Kembali</button>}
            </div>

            {level === 1 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><Activity className="w-8 h-8" /></div>
                    <div><p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Proses Bisnis</p><p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalProbis}</p></div>
                  </div>
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-amber-900/30 text-amber-500' : 'bg-amber-50 text-[#A29061]'}`}><BookOpen className="w-8 h-8" /></div>
                    <div><p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total SOP</p><p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalSOP}</p></div>
                  </div>
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><FileText className="w-8 h-8" /></div>
                    <div><p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Standar Pelayanan</p><p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalSP}</p></div>
                  </div>
                </div>

                <div className={`p-6 rounded-2xl border shadow-sm transition-all duration-300 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <h3 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Distribusi Dokumen</h3>
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                      {showChart && <div className={`flex items-center border rounded-xl px-3 shadow-sm transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}><Filter className="w-4 h-4 text-slate-400" /><select value={chartFilterSatker} onChange={(e) => setChartFilterSatker(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 cursor-pointer max-w-50 truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}><option value="Semua">Semua Unit Kerja</option>{listL1.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></div>}
                      <button onClick={() => setShowChart(!showChart)} className={`flex items-center px-4 py-2 text-sm font-bold rounded-xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{showChart ? <><EyeOff className="w-4 h-4 mr-2"/> Sembunyikan</> : <><Eye className="w-4 h-4 mr-2"/> Tampilkan</>}</button>
                    </div>
                  </div>
                  {showChart && <div className="h-72 min-h-75 w-full animate-in fade-in slide-in-from-top-4 duration-500"><ResponsiveContainer width="100%" height="100%" aspect={isDarkMode ? 2 : undefined}><BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} /><XAxis dataKey="labelChart" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 500 }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b' }} /><Tooltip cursor={{ fill: isDarkMode ? '#1e293b' : '#f8fafc' }} contentStyle={{ backgroundColor: isDarkMode ? '#0F172A' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', borderRadius: '12px', color: isDarkMode ? '#f8fafc' : '#002855' }}/><Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle"/><Bar dataKey="probis" fill="#3b82f6" name="Proses Bisnis" radius={[6, 6, 0, 0]} /><Bar dataKey="sop" fill="#A29061" name="SOP" radius={[6, 6, 0, 0]} /><Bar dataKey="sp" fill="#10b981" name="Standar Pelayanan" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
                </div>
              </>
            )}

            {loading && <div className="flex items-center justify-center py-4 gap-2 text-slate-400"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Memuat data...</span></div>}

            <div className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className={`p-5 md:p-6 border-b flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
                <h3 className={`text-lg font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{level === 1 ? 'Rekapitulasi Total Masing-Masing Unit Kerja' : level === 2 ? `Sub-Unit: ${selectedL1}` : `Data Detail: ${selectedL2 || 'Semua Unit'}`}</h3>
                {level === 2 && <button onClick={() => { setLevel(3); setSelectedL2(''); }} className="flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition shadow-md w-full sm:w-auto shrink-0"><Layers className="w-4 h-4 mr-2" /> Lihat Semua Dokumen</button>}
                {level === 3 && (
                  <div className="flex flex-col sm:flex-row items-center w-full xl:w-auto gap-3">
                    <div className="relative w-full sm:w-72"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-400" /></div><input type="text" placeholder="Cari nama, unit, atau sumber..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#151F32]' : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'}`} /></div>
                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}><Filter className="w-4 h-4 text-slate-400 ml-2" /><select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}><option value="Semua">Semua Jenis</option><option value="Proses Bisnis">Proses Bisnis</option><option value="SOP">SOP</option><option value="Standar Pelayanan">Standar Pelayanan</option></select></div>
                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}><select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}><option value="Semua">Semua Tahun</option>{uniqueTahunList.map(thn => <option key={thn} value={thn}>{thn}</option>)}</select></div>
                    <button onClick={handleExportExcel} className="flex justify-center items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition shadow-md w-full sm:w-auto shrink-0"><Download className="w-4 h-4 mr-2" /> Unduh Excel</button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${isDarkMode ? 'bg-[#0F172A] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                    <tr>
                      <th className="px-6 py-4 w-16 text-center">No</th>
                      <th className="px-6 py-4">{level === 3 ? 'Nama Dokumen / Layanan' : 'Unit Kerja'}</th>
                      {level === 3 && <th className="px-6 py-4">Unit Kerja (Level 2)</th>}
                      {level === 3 && <th className="px-6 py-4">Unit Kerja (Level 3)</th>}
                      <th className="px-6 py-4">{level === 3 ? 'Jenis Dokumen' : 'Probis'}</th>
                      <th className="px-6 py-4">{level === 3 ? 'Tahun' : 'SOP'}</th>
                      <th className="px-6 py-4">{level === 3 ? 'Sumber Hukum' : 'Standar Pelayanan'}</th>
                      {level === 3 && <th className="px-6 py-4 text-center">Status</th>}
                      <th className="px-6 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {level === 1 && rekapL1.map((row, idx) => (
                      <tr key={idx} className={`border-b transition-colors group ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-50 hover:bg-slate-50/80'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}>{row.nama}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.probis === 0 ? '-' : row.probis}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sop === 0 ? '-' : row.sop}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sp === 0 ? '-' : row.sp}</td>
                        <td className="px-6 py-4 text-center"><button onClick={() => { setLevel(2); setSelectedL1(row.nama); }} className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold transition-all opacity-80 group-hover:opacity-100 ${isDarkMode ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'}`}>Detail <ChevronRight className="w-4 h-4 ml-1" /></button></td>
                      </tr>
                    ))}
                    {level === 2 && rekapL2.map((row, idx) => (
                      <tr key={idx} className={`border-b transition-colors group ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-50 hover:bg-slate-50/80'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}>{row.nama}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.probis === 0 ? '-' : row.probis}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sop === 0 ? '-' : row.sop}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sp === 0 ? '-' : row.sp}</td>
                        <td className="px-6 py-4 text-center"><button onClick={() => { setLevel(3); setSelectedL2(row.nama); }} className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold transition-all opacity-80 group-hover:opacity-100 ${isDarkMode ? 'bg-amber-900/30 text-amber-500 hover:bg-amber-600 hover:text-white' : 'bg-[#A29061]/10 text-[#A29061] hover:bg-[#A29061] hover:text-white'}`}>Lihat Dokumen <ChevronRight className="w-4 h-4 ml-1" /></button></td>
                      </tr>
                    ))}
                    {level === 3 && currentItems.map((doc, idx) => (
                      <tr key={doc.id} className={`border-b transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-blue-900/20' : 'border-slate-50 hover:bg-blue-50/30'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{indexOfFirstItem + idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}><button onClick={async () => { setViewDoc(doc); setPreviewSvg(""); if (doc.jenis === 'Proses Bisnis' && doc.link.includes('id=')) { try { const bpmnId = doc.link.split('id=')[1].split('&')[0]; const res = await apiFetch(`/bpmn/models/${bpmnId}`, token); if (!res.ok) throw new Error("Gagal"); const data = await res.json(); if (data && data.svg_xml) setPreviewSvg(data.svg_xml); else setPreviewSvg(`<div class="p-6 text-center text-red-500 font-bold border border-red-200 bg-red-50 rounded-xl m-4">Diagram kosong.</div>`); } catch { setPreviewSvg(`<div class="p-6 text-center text-amber-600 font-bold border border-amber-200 bg-amber-50 rounded-xl m-4">Gagal memuat diagram secara otomatis. Silakan klik "Buka di Tab Baru".</div>`); } } }} className={`hover:underline text-left line-clamp-2 ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}>{doc.nama}</button></td>
                        <td className="px-6 py-4 text-slate-500">{doc.unitL2 || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{doc.unitL3 || '-'}</td>
                        <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${doc.jenis === 'Proses Bisnis' ? (isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700') : doc.jenis === 'SOP' ? (isDarkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700') : (isDarkMode ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>{doc.jenis}</span></td>
                        <td className="px-6 py-4 text-slate-500">{doc.tahun}</td>
                        <td className="px-6 py-4 italic text-slate-400 truncate max-w-50">{doc.sumber}</td>
                        <td className="px-6 py-4 text-center">
                          {currentUser?.role === 'admin' ? (
                            <select value={doc.status || 'draft'} onChange={(e) => handleApproval(doc, e.target.value)} className={`px-2 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider cursor-pointer outline-none shadow-sm border transition-all ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : doc.status === 'pending' ? 'bg-blue-100 text-blue-700 border-blue-200' : doc.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              <option value="draft">DRAFT</option><option value="pending">PENDING</option><option value="approved">APPROVED</option><option value="rejected">REJECTED</option>
                            </select>
                          ) : <span className={`px-2 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${doc.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : doc.status === 'pending' ? 'bg-blue-100 text-blue-700' : doc.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{doc.status || 'DRAFT'}</span>}
                        </td>
                        <td className="px-6 py-4 text-center space-x-3">{currentUser?.role === 'admin' ? <div className="flex gap-3 justify-center items-center"><button onClick={() => handleEdit(doc)} className="text-blue-500 hover:text-blue-600 font-bold text-xs transition-colors">Edit</button><button onClick={() => handleDelete(doc.id)} className="text-red-500 hover:text-red-600 font-bold text-xs transition-colors">Hapus</button></div> : <span className="text-slate-400 text-xs italic">hanya lihat</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* BAGIAN PAGINASI */}
              {level === 3 && dokumenFiltered.length > 0 && (
                <div className={`flex flex-col sm:flex-row justify-between items-center p-5 border-t gap-4 ${isDarkMode ? 'border-slate-800 bg-[#0F172A]/50' : 'border-slate-100 bg-slate-50/50'}`}>
                  <div className={`flex items-center text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Menampilkan
                    <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className={`mx-2 border rounded-lg px-2 py-1 outline-none font-bold focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-200 text-[#002855]'}`}>
                      <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
                    </select>
                    dari total {dokumenFiltered.length} data
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className={`p-2 rounded-xl border disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ChevronLeft className="w-5 h-5" /></button>
                    <span className={`px-4 py-2 text-sm font-bold rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white' : 'bg-white border-slate-200 text-[#002855]'}`}>Hal {currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className={`p-2 rounded-xl border disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ChevronRight className="w-5 h-5" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM TAMBAH/EDIT */}
        {activeMenu === 'tambah' && currentUser && (
          <div className={`max-w-4xl mx-auto p-8 md:p-10 rounded-2xl border shadow-lg animate-in fade-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
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
                  <div><label className="block text-xs font-bold mb-2 text-slate-500">Level 1 (Unit Utama) <span className="text-red-500">*</span></label><select required value={formData.unitL1} onChange={handleL1Change} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium cursor-pointer ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}><option value="" disabled>-- Pilih Level 1 --</option>{listL1.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></div>
                  <div><label className="block text-xs font-bold mb-2 text-slate-500">Level 2 (Direktorat/Biro)</label><select value={formData.unitL2} onChange={handleL2Change} disabled={!formData.unitL1} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium truncate cursor-pointer disabled:opacity-50 ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}><option value="">-- Kosong / Tidak Ada --</option>{getListL2(formData.unitL1).map(subUnit => <option key={subUnit} value={subUnit}>{subUnit}</option>)}</select></div>
                  <div><label className="block text-xs font-bold mb-2 text-slate-500">Level 3 (Subdit/Bagian)</label><select value={formData.unitL3} onChange={(e) => setFormData({...formData, unitL3: e.target.value})} disabled={!formData.unitL2} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium truncate cursor-pointer disabled:opacity-50 ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}><option value="">-- Kosong / Tidak Ada --</option>{getListL3(formData.unitL1, formData.unitL2).map(subUnit3 => <option key={subUnit3} value={subUnit3}>{subUnit3}</option>)}</select></div>
                </div>
              </div>
              <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Link Dokumen Terlampir</label><input type="url" value={formData.link} onChange={(e) => setFormData({...formData, link: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Tempel link Google Drive atau sumber lainnya..." /></div>
              <div><label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sumber Dokumen/Dasar Hukum Terkait</label><textarea rows={3} value={formData.sumber} onChange={(e) => setFormData({...formData, sumber: e.target.value})} className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all resize-none ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Cth: Keputusan Menteri ATR/BPN No..."></textarea></div>
              {saveError && <div className="p-3 bg-red-500/10 border border-red-400/30 rounded-xl"><p className="text-red-500 text-sm font-medium">{saveError}</p></div>}
              <div className={`pt-8 border-t flex justify-end space-x-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <button type="button" onClick={() => { setActiveMenu('dashboard'); setEditingId(null); setSaveError(''); }} className={`px-6 py-3 font-extrabold rounded-xl transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Batal</button>
                <button type="submit" disabled={saving} className={`px-8 py-3 font-extrabold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 flex items-center gap-2 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>{saving && <RefreshCw className="w-4 h-4 animate-spin" />}{editingId ? 'Simpan Perubahan Data' : 'Simpan Dokumen Baru'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}