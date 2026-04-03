"use client";
import React, { useState, useMemo, useEffect } from 'react';
import { Home, FilePlus, ChevronRight, ArrowLeft, Download, FileText, Activity, BookOpen, Filter, X, Eye, EyeOff, Search, ChevronLeft, Settings, Sun, Moon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import * as XLSX from 'xlsx';

// --- DATA HIERARKI UNIT KERJA (L1 -> L2 -> L3) ---
const HIERARKI_UNIT: Record<string, Record<string, string[]>> = {
  "SEKRETARIAT JENDERAL": {
    "Biro Perencanaan dan Kerja Sama": ["Bagian Perencanaan Program", "Bagian Penganggaran", "Bagian Pemantauan, Evaluasi, dan Pelaporan Kinerja", "Bagian Kerja Sama dan Tata Usaha"],
    "Biro Sumber Daya Manusia": ["Bagian Pengadaan dan Kesejahteraan", "Bagian Kinerja dan Manajemen Talenta", "Bagian Mutasi"],
    "Biro Organisasi, Tata Laksana, dan Manajemen Risiko": ["Bagian Organisasi", "Bagian Tata Laksana dan Reformasi Birokrasi", "Bagian Analisis Jabatan", "Bagian Manajemen Risiko"],
    "Biro Keuangan dan Barang Milik Negara": ["Bagian Penerimaan Negara Bukan Pajak", "Bagian Perbendaharaan", "Bagian Akuntansi dan Pelaporan", "Bagian Administrasi Pengelolaan BMN"],
    "Biro Hukum": ["Bagian Perundang-undangan I", "Bagian Perundang-undangan II", "Bagian Advokasi dan Dokumentasi Hukum"],
    "Biro Hubungan Masyarakat dan Protokol": ["Bagian Pemberitaan, Media, dan Hubungan Antar Lembaga", "Bagian Informasi Publik dan Pengaduan Masyarakat", "Bagian Tata Usaha Pimpinan dan Protokol"],
    "Biro Umum dan Layanan PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": ["Bagian Tata Naskah, Kearsipan, dan Tata Usaha", "Bagian Rumah Tangga dan Perlengkapan", "Bagian Layanan Pengadaan Barang/Jasa"],
    "Pusat Data dan Informasi Pertanahan dan Tata Ruang": ["Bidang Tata Kelola dan Infrastruktur TI", "Bidang Inovasi dan Pengembangan Sistem Informasi", "Bidang Pengelolaan Data dan Penyajian Informasi"]
  },
  "DIREKTORAT JENDERAL TATA RUANG": {
    "Sekretariat Direktorat Jenderal Tata Ruang": ["Bagian Program, Keuangan, dan Umum", "Bagian Hukum dan Kepegawaian", "Bagian Manajemen Risiko"],
    "Direktorat Perencanaan Tata Ruang": ["Subdirektorat Perencanaan Tata Ruang Nasional", "Subdirektorat Pedoman Tata Ruang", "Subdirektorat KSN I", "Subdirektorat KSN II", "Subdirektorat KSN III"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah I": ["Subdirektorat Wilayah I.A", "Subdirektorat Wilayah I.B", "Subdirektorat Wilayah I.C"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah II": ["Subdirektorat Wilayah II.A", "Subdirektorat Wilayah II.B", "Subdirektorat Wilayah II.C"],
    "Direktorat Sinkronisasi Pemanfaatan Ruang": ["Subdirektorat Wilayah A", "Subdirektorat Wilayah B", "Subdirektorat Wilayah C"]
  },
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": {
    "Sekretariat Direktorat Jenderal Survei dan Pemetaan": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengukuran dan Pemetaan Kadastral": ["Subdirektorat Pengukuran dan Pemetaan Bidang", "Subdirektorat Pengukuran dan Pemetaan Ruang", "Subdirektorat Penanganan Masalah"],
    "Direktorat Pengukuran dan Pemetaan Dasar": ["Subdirektorat Pemetaan dan Pengelolaan Data Dasar", "Subdirektorat Pengukuran Dasar dan Peralatan"],
    "Direktorat Survei dan Pemetaan Tematik": ["Subdirektorat Tematik Pertanahan dan Ruang", "Subdirektorat Tematik Kawasan", "Subdirektorat Layanan Informasi"]
  },
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": {
    "Sekretariat Direktorat Jenderal PENETAPAN HAK DAN PENDAFTARAN TANAH": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengaturan dan Penetapan Hak Atas Tanah": ["Subdirektorat Penetapan HGU", "Subdirektorat Penetapan HGB", "Subdirektorat Penetapan Hak Pakai"],
    "Direktorat Hubungan Kelembagaan": ["Subdirektorat Hubungan Kelembagaan", "Subdirektorat Pengembangan Layanan Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENATAAN AGRARIA": {
    "Sekretariat Direktorat Jenderal Penataan Agraria": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Landreform": ["Subdirektorat Pengelolaan Penguasaan Tanah", "Subdirektorat Penetapan Potensi Redistribusi", "Subdirektorat Pengaturan Redistribusi Tanah"],
    "Direktorat Pemberdayaan Tanah Masyarakat": ["Subdirektorat Pengembangan Model Akses RA", "Subdirektorat Fasilitasi Akses RA"]
  },
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": {
    "Sekretariat Direktorat Jenderal Pengadaan Tanah": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Bina Pengadaan dan Pencadangan Tanah": ["Subdirektorat Bina Pengadaan Tanah Wilayah I", "Subdirektorat Bina Pengadaan Tanah Wilayah II"]
  },
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": {
    "Sekretariat Direktorat Jenderal PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Pengendalian Pemanfaatan Ruang": ["Subdirektorat Wilayah I", "Subdirektorat Wilayah II", "Subdirektorat Wilayah III"]
  },
  "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": {
    "Sekretariat Direktorat Jenderal Penanganan Sengketa": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Penanganan Sengketa Pertanahan": ["Subdirektorat Penanganan Sengketa Penetapan Hak", "Subdirektorat Batas Bidang Tanah"]
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
  "SEKRETARIAT JENDERAL": "SETJEN", "DIREKTORAT JENDERAL TATA RUANG": "TARU", "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": "SPPR",
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": "PHPT", "DIREKTORAT JENDERAL PENATAAN AGRARIA": "PENTAG", "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": "PENGADAAN",
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": "PENGENDALIAN", "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": "PSKP",
  "INSPEKTORAT JENDERAL": "ITJEN", "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA": "BPSDM", "SEKOLAH TINGGI PERTANAHAN NASIONAL": "STPN"
};

interface Dokumen {
  id: number; nama: string; jenis: string; tahun: string;
  unitL1: string; unitL2: string; unitL3: string; link: string; sumber: string;
}

// Immediate auth check - runs before React renders  
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  if (!token || !userStr) {
    window.location.href = '/e-sop-atrbpn/login';
  }
}

export default function DashboardBPN() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<{username: string; role: string} | null>(null);
  const [dbHierarchy, setDbHierarchy] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      window.location.href = '/e-sop-atrbpn/login';
      return;
    }
    try {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      setIsAuthenticated(true);
      fetchHierarchy(token);
    } catch {
      window.location.href = '/e-sop-atrbpn/login';
    }
    setLoading(false);
  }, []);

  const fetchHierarchy = async (token: string) => {
    try {
      const res = await fetch('/e-sop-atrbpn/api/hierarchy', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: any = {};
      data.forEach((item: any) => {
        if (!grouped[item.l1_nama]) grouped[item.l1_nama] = {};
        if (item.l2_nama && !grouped[item.l1_nama][item.l2_nama]) {
          grouped[item.l1_nama][item.l2_nama] = [];
        }
        if (item.l3_nama && grouped[item.l1_nama][item.l2_nama]) {
          grouped[item.l1_nama][item.l2_nama].push(item.l3_nama);
        }
      });
      // Use static data as fallback always
      if (data && data.length > 0) {
        setDbHierarchy(grouped);
      } else {
        setDbHierarchy(HIERARKI_UNIT);
      }
    } catch (err) {
      // Fallback to static data on error
      setDbHierarchy(HIERARKI_UNIT);
    }
  };

  // Check auth immediately on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      window.location.href = '/e-sop-atrbpn/login';
      return;
    }
    try {
      const user = JSON.parse(userStr);
      setCurrentUser(user);
      setIsAuthenticated(true);
      fetchHierarchy(token);
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/e-sop-atrbpn/login';
    }
    setLoading(false);
  }, []);

  // Not authenticated - redirect is already handled
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="text-center">
          <p className="text-blue-300">Mengalihkan ke login...</p>
        </div>
      </div>
    );
  }

  // STATE NAVIGASI & THEME
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [level, setLevel] = useState(1);
  const [selectedL1, setSelectedL1] = useState('');
  const [selectedL2, setSelectedL2] = useState('');
  
  // STATE TEMA & PENGATURAN
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // STATE DOKUMEN & FILTER
  const [dokumenList, setDokumenList] = useState<Dokumen[]>([]);
  const [filterJenis, setFilterJenis] = useState('Semua');
  const [filterTahun, setFilterTahun] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  
  // PAGINASI
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewDoc, setViewDoc] = useState<Dokumen | null>(null);
  const [showChart, setShowChart] = useState(true);
  const [chartFilterSatker, setChartFilterSatker] = useState('Semua');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterJenis, filterTahun, selectedL1, selectedL2]);

  const getEmbedUrl = (url: string) => {
    if (!url || !url.includes('drive.google.com')) return url;
    if (url.includes('/folders/')) {
      const folderId = url.split('/folders/')[1].split('?')[0];
      return `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    }
    if (url.includes('/file/d/')) {
      return url.split('?')[0].replace('/view', '/preview').replace('/edit', '/preview');
    }
    return url;
  };

  const listL1 = Object.keys(HIERARKI_UNIT);
  const getListL2 = (l1: string) => l1 && HIERARKI_UNIT[l1] ? Object.keys(HIERARKI_UNIT[l1]) : [];
  const getListL3 = (l1: string, l2: string) => l1 && l2 && HIERARKI_UNIT[l1]?.[l2] ? HIERARKI_UNIT[l1][l2] : ["- Belum Ada Data Level 3 -"];

  const [formData, setFormData] = useState({
    nama: '', jenis: 'Proses Bisnis', tahun: '2024',
    unitL1: listL1[0], unitL2: getListL2(listL1[0])[0], unitL3: getListL3(listL1[0], getListL2(listL1[0])[0])[0],
    link: '', sumber: ''
  });

  const totalProbis = dokumenList.filter(d => d.jenis === 'Proses Bisnis').length;
  const totalSOP = dokumenList.filter(d => d.jenis === 'SOP').length;
  const totalSP = dokumenList.filter(d => d.jenis === 'Standar Pelayanan').length;

  const rekapL1 = useMemo(() => {
    return listL1.map(unitL1 => {
      const docs = dokumenList.filter(d => d.unitL1 === unitL1);
      return {
        nama: unitL1, labelChart: CHART_LABELS[unitL1],
        probis: docs.filter(d => d.jenis === 'Proses Bisnis').length,
        sop: docs.filter(d => d.jenis === 'SOP').length,
        sp: docs.filter(d => d.jenis === 'Standar Pelayanan').length,
      };
    });
  }, [dokumenList]);

  const chartData = useMemo(() => {
    if (chartFilterSatker === 'Semua') return rekapL1;
    return rekapL1.filter(item => item.nama === chartFilterSatker);
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

  // --- LOGIKA PENCARIAN & PENGURUTAN BERTINGKAT ---
  const dokumenFiltered = useMemo(() => {
    // 1. Filter berdasarkan Unit, Jenis, Tahun, dan Search
    const filtered = dokumenList.filter(d => {
      const matchUnit = d.unitL1 === selectedL1 && d.unitL2 === selectedL2;
      const matchJenis = filterJenis === 'Semua' || d.jenis === filterJenis;
      const matchTahun = filterTahun === 'Semua' || d.tahun === filterTahun;
      
      const keyword = searchQuery.toLowerCase();
      const matchSearch = 
        d.nama.toLowerCase().includes(keyword) || 
        d.unitL3.toLowerCase().includes(keyword) || 
        d.sumber.toLowerCase().includes(keyword);

      return matchUnit && matchJenis && matchTahun && matchSearch;
    });

    // 2. Lakukan Pengurutan (Sorting)
    return [...filtered].sort((a, b) => {
      // Prioritas 1: Tahun Terbaru ke Terlama (Descending)
      if (b.tahun !== a.tahun) {
        return parseInt(b.tahun) - parseInt(a.tahun);
      }

      // Prioritas 2: Urutan Unit Kerja Level 3 (Berdasarkan Hierarki Data)
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
  const uniqueTahunList = Array.from(new Set(dokumenList.filter(d => d.unitL1 === selectedL1 && d.unitL2 === selectedL2).map(d => d.tahun))).sort();

  const handleExportExcel = () => {
    if (dokumenFiltered.length === 0) { alert("Tidak ada data dokumen."); return; }
    const dataToExport = dokumenFiltered.map((doc, index) => ({
      "No": index + 1, "Nama Dokumen": doc.nama, "Unit Kerja": doc.unitL3,
      "Jenis": doc.jenis, "Tahun": doc.tahun, "Sumber": doc.sumber, "Link": doc.link
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dokumen");
    XLSX.writeFile(workbook, `Rekap_Dokumen_${selectedL2.replace(/ /g, "_")}.xlsx`);
  };

  const handleL1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newL1 = e.target.value; const newL2List = getListL2(newL1); const newL2 = newL2List[0] || '';
    setFormData({ ...formData, unitL1: newL1, unitL2: newL2, unitL3: getListL3(newL1, newL2)[0] || '' });
  };

  const handleL2Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newL2 = e.target.value;
    setFormData({ ...formData, unitL2: newL2, unitL3: getListL3(formData.unitL1, newL2)[0] || '' });
  };

  const handleSimpanDokumen = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId !== null) {
      setDokumenList(dokumenList.map(doc => doc.id === editingId ? { ...formData, id: editingId } : doc));
    } else {
      setDokumenList([{ ...formData, id: Date.now() }, ...dokumenList]);
    }
    setActiveMenu('dashboard'); setEditingId(null);
    setFormData({ ...formData, nama: '', link: '', sumber: '' });
  };

  const handleEdit = (doc: Dokumen) => {
    setFormData({ ...doc }); setEditingId(doc.id); setActiveMenu('tambah');
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Hapus dokumen ini?")) setDokumenList(dokumenList.filter(doc => doc.id !== id));
  };

  const resetFormTambah = () => {
    setEditingId(null);
    setFormData({
      nama: '', jenis: 'Proses Bisnis', tahun: '2024',
      unitL1: listL1[0], unitL2: getListL2(listL1[0])[0], unitL3: getListL3(listL1[0], getListL2(listL1[0])[0])[0],
      link: '', sumber: ''
    });
    setActiveMenu('tambah');
  };

  return (
    // LOGIKA TEMA GLOBAL (Root Container)
    <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-500 ease-in-out ${isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'}`}>
      
      {/* MODAL POPUP */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity">
          <div className={`w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 m-4 ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            <div className={`flex justify-between items-center p-4 border-b ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
              <div>
                <h3 className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{viewDoc.nama}</h3>
                <div className="flex items-center text-xs text-slate-500 mt-1 space-x-2">
                  <span className={`px-2 py-0.5 rounded font-semibold ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>{viewDoc.jenis}</span>
                  <span>•</span><span>{viewDoc.unitL3}</span><span>•</span><span>Tahun {viewDoc.tahun}</span>
                </div>
              </div>
              <button onClick={() => setViewDoc(null)} className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'}`}><X className="w-6 h-6" /></button>
            </div>
            <div className={`flex-1 p-4 ${isDarkMode ? 'bg-[#0B1121]' : 'bg-slate-200'}`}>
              <iframe src={getEmbedUrl(viewDoc.link)} className="w-full h-full rounded-xl border-none bg-white shadow-sm" title="Viewer" />
            </div>
            <div className={`p-4 border-t flex justify-between items-center ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-white'}`}>
              <p className="text-sm text-slate-500 italic">Gunakan tombol di samping jika dokumen diblokir.</p>
              <a href={viewDoc.link} target="_blank" rel="noreferrer" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow transition">Buka di Tab Baru</a>
            </div>
          </div>
        </div>
      )}

      {/* --- KIRI: FLOATING PREMIUM SIDEBAR --- */}
      <div className="w-72 bg-gradient-to-b from-[#001F43] to-[#000F24] text-white flex flex-col shadow-2xl z-10 shrink-0 m-4 rounded-3xl border border-white/10 relative overflow-hidden ring-1 ring-black/5">
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-[#A29061] rounded-full mix-blend-screen filter blur-[70px] opacity-40 pointer-events-none"></div>
        
        {/* Header Logo */}
        <div className="p-8 border-b border-white/10 relative z-10">
          <div className="w-12 h-12 bg-gradient-to-br from-[#A29061] to-[#807047] rounded-2xl flex items-center justify-center shadow-lg shadow-[#A29061]/30 mb-4">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-wide">TATA LAKSANA</h1>
          <p className="text-[10px] text-slate-400 mt-1.5 uppercase tracking-[0.2em] font-semibold">Kementerian ATR/BPN</p>
        </div>

        {/* Menu Navigasi Utama */}
        <div className="flex-1 py-6 px-4 relative z-10 overflow-y-auto">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">Menu Utama</p>
          
          <button 
            onClick={() => { setActiveMenu('dashboard'); setLevel(1); setSearchQuery(''); setIsSettingsOpen(false); }}
            className={`w-full flex items-center px-4 py-3.5 mb-3 rounded-2xl transition-all duration-300 group
              ${activeMenu === 'dashboard' 
                ? 'bg-gradient-to-r from-[#A29061] to-[#8c7a4b] text-white shadow-lg shadow-[#A29061]/25 font-bold scale-[1.02]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}`}
          >
            <Home className={`w-5 h-5 mr-3 transition-colors ${activeMenu === 'dashboard' ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} /> 
            Dashboard Monitoring
          </button>
          
          <button 
            onClick={() => { resetFormTambah(); setIsSettingsOpen(false); }}
            className={`w-full flex items-center px-4 py-3.5 mb-3 rounded-2xl transition-all duration-300 group
              ${activeMenu === 'tambah' && editingId === null
                ? 'bg-gradient-to-r from-[#A29061] to-[#8c7a4b] text-white shadow-lg shadow-[#A29061]/25 font-bold scale-[1.02]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}`}
          >
            <FilePlus className={`w-5 h-5 mr-3 transition-colors ${activeMenu === 'tambah' && editingId === null ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} /> 
            Tambah Dokumen
          </button>

          <div className="mt-8">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 px-3">Sistem</p>
            
            {/* TOMBOL PENGATURAN YANG BISA DI-KLIK */}
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-300 group mb-2
                ${isSettingsOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}`}
            >
              <div className="flex items-center">
                <Settings className={`w-5 h-5 mr-3 transition-colors ${isSettingsOpen ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} /> 
                Pengaturan
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSettingsOpen ? 'rotate-90' : ''}`} />
            </button>

            {/* EXPANDABLE TOGGLE LIGHT/DARK MODE */}
            <div className={`overflow-hidden transition-all duration-400 ease-in-out ${isSettingsOpen ? 'max-h-32 opacity-100 mb-4' : 'max-h-0 opacity-0'}`}>
              <div className="mx-2 p-3 bg-black/20 rounded-2xl border border-white/5 backdrop-blur-sm shadow-inner">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">Tema Tampilan</p>
                <div className="relative flex items-center bg-black/40 rounded-xl p-1">
                  
                  {/* Animasi Pil Bergerak */}
                  <div 
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-out shadow-md ${
                      isDarkMode 
                        ? 'translate-x-[calc(100%+0px)] bg-gradient-to-r from-indigo-500 to-purple-500' 
                        : 'translate-x-0 bg-gradient-to-r from-amber-400 to-orange-400'
                    }`}
                  ></div>

                  <button 
                    onClick={() => setIsDarkMode(false)}
                    className={`relative z-10 flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-lg transition-colors duration-300 ${!isDarkMode ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Sun className="w-3.5 h-3.5 mr-1.5" /> Terang
                  </button>
                  <button 
                    onClick={() => setIsDarkMode(true)}
                    className={`relative z-10 flex-1 flex justify-center items-center py-2 text-xs font-bold rounded-lg transition-colors duration-300 ${isDarkMode ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                  >
                    <Moon className="w-3.5 h-3.5 mr-1.5" /> Gelap
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Profil Pengguna */}
        <div className="p-4 relative z-10 border-t border-white/5 bg-black/10 mt-auto">
          <div className="flex items-center p-3 rounded-2xl cursor-default transition-colors">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex justify-center items-center font-bold text-white shadow-inner">
              AD
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-bold text-white leading-tight">Admin Pusat</p>
              <p className="text-[10px] text-slate-400 font-medium">Biro Organisasi & TL</p>
            </div>
          </div>
        </div>
      </div>

      {/* --- KANAN: KONTEN UTAMA --- */}
      <div className="flex-1 overflow-auto p-4 md:p-8 md:pl-2 scroll-smooth">
        
        {/* VIEW: DASHBOARD */}
        {activeMenu === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
            
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className={`text-3xl md:text-4xl font-extrabold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                  {level === 1 ? 'Dashboard Monitoring' : level === 2 ? selectedL1 : selectedL2}
                </h2>
                <p className={`mt-2 font-medium transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {level === 1 ? 'Rekapitulasi Dokumen Tata Laksana Seluruh Unit Kerja' : 
                   level === 2 ? 'Rincian Rekapitulasi per Unit Kerja Level 2' : 'Daftar Dokumen Detail'}
                </p>
              </div>
              {level > 1 && (
                <button 
                  onClick={() => { setLevel(level - 1); setFilterJenis('Semua'); setFilterTahun('Semua'); setSearchQuery(''); }}
                  className={`flex items-center px-5 py-2.5 border rounded-xl shadow-sm transition-all font-semibold
                    ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Kembali
                </button>
              )}
            </div>

            {level === 1 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><Activity className="w-8 h-8" /></div>
                    <div>
                      <p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Proses Bisnis</p>
                      <p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalProbis}</p>
                    </div>
                  </div>
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-amber-900/30 text-amber-500' : 'bg-amber-50 text-[#A29061]'}`}><BookOpen className="w-8 h-8" /></div>
                    <div>
                      <p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total SOP</p>
                      <p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalSOP}</p>
                    </div>
                  </div>
                  <div className={`p-6 rounded-2xl border shadow-sm transition-all flex items-center space-x-5 ${isDarkMode ? 'bg-[#151F32] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-100 hover:shadow-md'}`}>
                    <div className={`p-4 rounded-2xl ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><FileText className="w-8 h-8" /></div>
                    <div>
                      <p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Standar Pelayanan</p>
                      <p className={`text-4xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{totalSP}</p>
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-2xl border shadow-sm transition-all duration-300 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                    <h3 className={`text-xl font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Distribusi Dokumen</h3>
                    
                    <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                      {showChart && (
                        <div className={`flex items-center border rounded-xl px-3 shadow-sm transition-colors ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                          <Filter className="w-4 h-4 text-slate-400" />
                          <select value={chartFilterSatker} onChange={(e) => setChartFilterSatker(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pl-2 pr-6 cursor-pointer max-w-[200px] truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            <option value="Semua">Semua Unit Kerja</option>
                            {listL1.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                      )}
                      <button onClick={() => setShowChart(!showChart)} className={`flex items-center px-4 py-2 text-sm font-bold rounded-xl transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        {showChart ? <><EyeOff className="w-4 h-4 mr-2"/> Sembunyikan</> : <><Eye className="w-4 h-4 mr-2"/> Tampilkan</>}
                      </button>
                    </div>
                  </div>

                  {showChart && (
                    <div className="h-[350px] w-full animate-in fade-in slide-in-from-top-4 duration-500">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                          <XAxis dataKey="labelChart" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b', fontWeight: 500 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#94a3b8' : '#64748b' }} />
                          <Tooltip cursor={{ fill: isDarkMode ? '#1e293b' : '#f8fafc' }} contentStyle={{ backgroundColor: isDarkMode ? '#0F172A' : '#ffffff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', borderRadius: '12px', color: isDarkMode ? '#f8fafc' : '#002855' }}/>
                          <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle"/>
                          <Bar dataKey="probis" fill={isDarkMode ? '#3b82f6' : '#3b82f6'} name="Proses Bisnis" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="sop" fill={isDarkMode ? '#fbbf24' : '#A29061'} name="SOP" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="sp" fill={isDarkMode ? '#10b981' : '#10b981'} name="Standar Pelayanan" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* TABEL AREA */}
            <div className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className={`p-5 md:p-6 border-b flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
                <h3 className={`text-lg font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                  {level === 1 ? 'Rekapitulasi Unit Kerja Level 1' : level === 2 ? `Sub-Unit: ${selectedL1}` : `Data Detail: ${selectedL2}`}
                </h3>
                
                {level === 3 && (
                  <div className="flex flex-col sm:flex-row items-center w-full xl:w-auto gap-3">
                    <div className="relative w-full sm:w-72">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-400" /></div>
                      <input type="text" placeholder="Cari nama, unit, atau sumber..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
                        className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all
                          ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#151F32]' : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white'}`} />
                    </div>

                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                      <Filter className="w-4 h-4 text-slate-400 ml-2" />
                      <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <option value="Semua">Semua Jenis</option><option value="Proses Bisnis">Proses Bisnis</option><option value="SOP">SOP</option><option value="Standar Pelayanan">Standar Pelayanan</option>
                      </select>
                    </div>
                    <div className={`flex items-center border rounded-xl px-2 w-full sm:w-auto ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                      <select value={filterTahun} onChange={(e) => setFilterTahun(e.target.value)} className={`w-full bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pl-2 pr-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <option value="Semua">Semua Tahun</option>
                        {uniqueTahunList.map(thn => <option key={thn} value={thn}>{thn}</option>)}
                      </select>
                    </div>
                    
                    <button onClick={handleExportExcel} className="flex justify-center items-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition shadow-md w-full sm:w-auto shrink-0">
                      <Download className="w-4 h-4 mr-2" /> Unduh Excel
                    </button>
                  </div>
                )}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${isDarkMode ? 'bg-[#0F172A] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                    <tr>
                      <th className="px-6 py-4 w-16 text-center">No</th>
                      <th className="px-6 py-4">{level === 3 ? 'Nama Dokumen / Layanan' : 'Unit Kerja'}</th>
                      {level === 3 && <th className="px-6 py-4">Unit Kerja (Level 3)</th>}
                      <th className="px-6 py-4">{level === 3 ? 'Jenis Dokumen' : 'Probis'}</th>
                      <th className="px-6 py-4">{level === 3 ? 'Tahun' : 'SOP'}</th>
                      <th className="px-6 py-4">{level === 3 ? 'Sumber Hukum' : 'Standar Pelayanan'}</th>
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
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => { setLevel(2); setSelectedL1(row.nama); }} className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold transition-all opacity-80 group-hover:opacity-100 ${isDarkMode ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'}`}>
                            Detail <ChevronRight className="w-4 h-4 ml-1" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {level === 2 && rekapL2.map((row, idx) => (
                      <tr key={idx} className={`border-b transition-colors group ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-50 hover:bg-slate-50/80'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}>{row.nama}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.probis === 0 ? '-' : row.probis}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sop === 0 ? '-' : row.sop}</td>
                        <td className={`px-6 py-4 font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.sp === 0 ? '-' : row.sp}</td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => { setLevel(3); setSelectedL2(row.nama); }} className={`inline-flex items-center justify-center px-4 py-2 rounded-lg font-bold transition-all opacity-80 group-hover:opacity-100 ${isDarkMode ? 'bg-amber-900/30 text-amber-500 hover:bg-amber-600 hover:text-white' : 'bg-[#A29061]/10 text-[#A29061] hover:bg-[#A29061] hover:text-white'}`}>
                            Lihat Dokumen <ChevronRight className="w-4 h-4 ml-1" />
                          </button>
                        </td>
                      </tr>
                    ))}

                    {level === 3 && currentItems.length === 0 && (
                      <tr><td colSpan={7} className="px-6 py-16 text-center"><div className="text-slate-400 font-medium">Data dokumen tidak ditemukan.</div></td></tr>
                    )}
                    {level === 3 && currentItems.map((doc, idx) => (
                      <tr key={doc.id} className={`border-b transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-blue-900/20' : 'border-slate-50 hover:bg-blue-50/30'}`}>
                        <td className="px-6 py-4 text-center text-slate-400 font-medium">{indexOfFirstItem + idx + 1}</td>
                        <td className={`px-6 py-4 font-bold ${isDarkMode ? 'text-blue-100' : 'text-[#002855]'}`}>
                          <button onClick={() => setViewDoc(doc)} className={`hover:underline text-left line-clamp-2 ${isDarkMode ? 'hover:text-blue-400' : 'hover:text-blue-600'}`}>
                            {doc.nama}
                          </button>
                        </td>
                        <td className={`px-6 py-4 font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{doc.unitL3}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider
                            ${doc.jenis === 'Proses Bisnis' ? (isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700') : 
                              doc.jenis === 'SOP' ? (isDarkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-700') : 
                              (isDarkMode ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>
                            {doc.jenis}
                          </span>
                        </td>
                        <td className={`px-6 py-4 font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{doc.tahun}</td>
                        {/* --- PERUBAHAN DI SINI: MENGHAPUS TRUNCATE DAN MEMPERLEBAR KOLOM --- */}
                        <td className={`px-6 py-4 italic min-w-[250px] whitespace-normal leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{doc.sumber}</td>
                        {/* ------------------------------------------------------------------ */}
                        <td className="px-6 py-4 text-center space-x-3">
                          <button onClick={() => handleEdit(doc)} className="text-blue-500 hover:text-blue-400 font-bold transition-colors">Edit</button>
                          <button onClick={() => handleDelete(doc.id)} className="text-red-500 hover:text-red-400 font-bold transition-colors">Hapus</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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

        {/* VIEW: TAMBAH / EDIT DOKUMEN */}
        {activeMenu === 'tambah' && (
          <div className={`max-w-4xl mx-auto p-8 md:p-10 rounded-2xl border shadow-lg animate-in fade-in zoom-in-95 duration-300 ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
            <h2 className={`text-3xl font-extrabold mb-2 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{editingId ? 'Edit Data Dokumen' : 'Form Tambah Dokumen Baru'}</h2>
            <p className={`font-medium mb-10 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{editingId ? 'Perbarui informasi dokumen secara akurat.' : 'Silakan lengkapi form di bawah ini. Pastikan unit kerja dipilih secara berjenjang.'}</p>
            
            <form onSubmit={handleSimpanDokumen} className="space-y-8">
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nama Proses / Layanan <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.nama} onChange={(e) => setFormData({...formData, nama: e.target.value})} 
                  className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all
                  ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#1e293b] focus:ring-blue-500/20 focus:border-blue-500' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20 focus:border-[#A29061]'}`} placeholder="Cth: Penyusunan Rencana Strategis Tahunan" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Dokumen</label>
                  <select value={formData.jenis} onChange={(e) => setFormData({...formData, jenis: e.target.value})} 
                    className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all cursor-pointer
                    ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#1e293b] focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20'}`}>
                    <option>Proses Bisnis</option><option>SOP</option><option>Standar Pelayanan</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tahun Terbit</label>
                  <input required type="number" value={formData.tahun} onChange={(e) => setFormData({...formData, tahun: e.target.value})} 
                    className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all
                    ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#1e293b] focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-[#A29061]/20'}`} />
                </div>
              </div>

              <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50/80 border-slate-200/60'}`}>
                <h4 className={`text-sm font-extrabold mb-4 uppercase tracking-wider ${isDarkMode ? 'text-blue-400' : 'text-[#002855]'}`}>Pemetaan Unit Kerja</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 1 (Unit Utama)</label>
                    <select value={formData.unitL1} onChange={handleL1Change} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium cursor-pointer ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}>{listL1.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 2 (Direktorat/Biro)</label>
                    <select value={formData.unitL2} onChange={handleL2Change} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium truncate cursor-pointer ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}>{getListL2(formData.unitL1).map(subUnit => <option key={subUnit} value={subUnit}>{subUnit}</option>)}</select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 3 (Subdit/Bagian)</label>
                    <select value={formData.unitL3} onChange={(e) => setFormData({...formData, unitL3: e.target.value})} className={`w-full px-4 py-2.5 border rounded-xl shadow-sm outline-none text-sm font-medium truncate cursor-pointer ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-white focus:ring-blue-500' : 'border-slate-300 focus:ring-blue-100'}`}>{getListL3(formData.unitL1, formData.unitL2).map(subUnit3 => <option key={subUnit3} value={subUnit3}>{subUnit3}</option>)}</select>
                  </div>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Link Dokumen Terlampir</label>
                <input type="url" value={formData.link} onChange={(e) => setFormData({...formData, link: e.target.value})} 
                  className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all
                  ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#1e293b] focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Tempel link Google Drive atau sumber lainnya..." />
              </div>
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sumber Dokumen/Dasar Hukum Terkait</label>
                <textarea rows={3} value={formData.sumber} onChange={(e) => setFormData({...formData, sumber: e.target.value})} 
                  className={`w-full px-5 py-3 border rounded-xl font-medium focus:ring-4 outline-none transition-all resize-none
                  ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-white focus:bg-[#1e293b] focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-blue-100'}`} placeholder="Cth: Keputusan Menteri ATR/BPN No..."></textarea>
              </div>

              <div className={`pt-8 border-t flex justify-end space-x-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <button type="button" onClick={() => { setActiveMenu('dashboard'); setEditingId(null); }} className={`px-6 py-3 font-extrabold rounded-xl transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Batal</button>
                <button type="submit" className={`px-8 py-3 font-extrabold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                  {editingId ? 'Simpan Perubahan Data' : 'Simpan Dokumen Baru'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      
    </div>
  );
}