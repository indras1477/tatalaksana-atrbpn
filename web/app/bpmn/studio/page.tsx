"use client";

import dynamic from 'next/dynamic';
import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, GitBranch, X, Sun, Moon, Image as ImageIcon, FileText, 
  AlertCircle, MessageSquare 
} from 'lucide-react';

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

const Modeler = dynamic(() => import('@/components/BPMNModeler'), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Memuat BPMN Studio...</div>
});

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

interface BPMNModel {
  id: number; process_title: string; process_key: string; l1_id: number | null; l2_id: number | null;
  description: string | null; bpmn_xml: string | null; svg_xml: string | null;
  status: string; catatan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
}

function BPMNStudioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = searchParams.get('id');
  
  // MENDETEKSI MODE DARI URL
  const mode = searchParams.get('mode');
  const isViewOnly = mode === 'view';

  const [token, setToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<{id: number, username: string, role: string} | null>(null);
  
  // (Tetap dipertahankan untuk mendapatkan ID dari database)
  const [unitL1List, setUnitL1List] = useState<{id: number, nama: string}[]>([]);
  const [unitL2List, setUnitL2List] = useState<{id: number, nama: string}[]>([]);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({ processTitle: '', processKey: '', orgUnitL1: '', orgUnitL2: '', description: '' });

  const [currentModel, setCurrentModel] = useState<BPMNModel | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [currentXml, setCurrentXml] = useState<string>("");
  const [currentSvg, setCurrentSvg] = useState<string>("");

  // Mengambil opsi Dropdown berdasarkan Constant HIERARKI_UNIT
  const l1Options = Object.keys(HIERARKI_UNIT);
  const l2Options = config.orgUnitL1 && HIERARKI_UNIT[config.orgUnitL1] ? Object.keys(HIERARKI_UNIT[config.orgUnitL1]) : [];

  useEffect(() => {
    const initAuth = async () => {
      const tok = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!tok || !userStr) { router.replace('/login'); return; }
      try { 
        setCurrentUser(JSON.parse(userStr)); 
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
    
    if (documentId) {
      apiFetch(`/bpmn/models/${documentId}`, token)
        .then(r => {
          if (!r.ok) throw new Error("Data tidak ditemukan");
          return r.json();
        })
        .then((data: BPMNModel) => {
          setCurrentModel(data);
          setConfig({
            processTitle: data.process_title, 
            processKey: data.process_key,
            orgUnitL1: data.unit_l1 || '', 
            orgUnitL2: data.unit_l2 || '', 
            description: data.description || '',
          });
        })
        .catch(err => {
          console.error(err);
          alert("Dokumen tidak ditemukan atau Anda tidak memiliki akses.");
          router.replace('/bpmn');
        });
    } else {
      setCurrentModel(null);
      setConfig({ processTitle: '', processKey: '', orgUnitL1: '', orgUnitL2: '', description: '' });
      setCurrentXml("");
      setCurrentSvg("");
      if (!isViewOnly) setShowConfigModal(true);
    }
  }, [token, documentId, router, isViewOnly]);

  useEffect(() => {
    if (config.orgUnitL1) {
      const l1 = unitL1List.find(u => u.nama === config.orgUnitL1);
      if (l1) apiFetch(`/unit-kerja/l2?l1_id=${l1.id}`, token).then(r => r.json()).then(data => setUnitL2List(Array.isArray(data) ? data : []));
    } else setUnitL2List([]);
  }, [config.orgUnitL1, unitL1List, token]);

  const validateConfig = () => {
    if (!config.processTitle.trim() || !config.processKey.trim() || !config.orgUnitL1) {
      alert("Harap lengkapi kolom yang bertanda bintang (*): Judul, Kode, dan Unit Kerja Level 1.");
      return false;
    }
    return true;
  };

  const handleStartModeling = () => { 
    if (validateConfig()) setShowConfigModal(false); 
  };

  const handleModelerSave = (xml: string, svg: string) => {
    setCurrentXml(xml); 
    setCurrentSvg(svg); 
    setShowSaveModal(true);
  };

  const handleDownloadSVG = () => {
    if (!currentSvg) return alert('Data SVG kosong.');
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${config.processKey || 'BPMN'}.svg`; a.click();
  };

  const handleDownloadPDF = async () => {
    if (!currentSvg) return alert('Data SVG kosong.');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('landscape', 'mm', 'a4');
      doc.setFontSize(16);
      doc.text(config.processTitle || 'Dokumen BPMN', 14, 15);
      doc.setFontSize(10);
      doc.text(`Unit: ${config.orgUnitL1} ${config.orgUnitL2 ? `> ${config.orgUnitL2}` : ''}`, 14, 21);
      const img = new Image();
      const svgBlob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if(ctx) {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = 270;
          const pdfHeight = (img.height * pdfWidth) / img.width;
          doc.addImage(imgData, 'PNG', 14, 26, pdfWidth, pdfHeight);
          doc.save(`${config.processKey || 'BPMN'}.pdf`);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (error) {
      console.error(error); alert("Gagal membuat PDF. Pastikan jspdf terinstal.");
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
        process_key: config.processKey, 
        l1_id, l2_id,
        unit_l1: config.orgUnitL1, // Backup value string jika ID null
        unit_l2: config.orgUnitL2, // Backup value string jika ID null
        description: config.description || null, 
        bpmn_xml: currentXml, 
        svg_xml: currentSvg, 
        status: targetStatus,
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

      if (response.ok) {
        const savedBpmn = await response.json();
        setCurrentModel(savedBpmn); 
        setShowSaveModal(false); 
        alert(`Sukses! Dokumen disimpan sebagai ${targetStatus.toUpperCase()}`);
        
        if (!documentId) {
            router.replace(`/bpmn/studio?id=${savedBpmn.id}`);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan alur.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!token || !currentUser) return null;

  return (
    <div className={`flex flex-col h-screen font-sans overflow-hidden ${isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'}`}>
      
      <div className="h-14 border-b flex items-center justify-between px-4 z-10 shrink-0" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/bpmn')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center text-sm font-medium gap-2">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          
          <div className="h-6 w-px bg-slate-300 mx-2"></div>
          
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold">Studio Editor</h1>
            {config.processTitle && (
              <span className={`ml-3 px-3 py-1 rounded-md text-sm font-extrabold shadow-sm flex items-center gap-2 ${isDarkMode ? 'bg-slate-800 text-blue-300' : 'bg-blue-100 text-[#002855]'}`}>
                {config.processTitle} 
                {isViewOnly && <span className="text-red-500 font-bold ml-2">(Mode Baca)</span>}
                
                {currentModel?.status && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border ${
                        currentModel.status === 'approved' ? 'bg-emerald-500 text-white border-emerald-600' :
                        currentModel.status === 'pending' ? 'bg-blue-500 text-white border-blue-600' :
                        currentModel.status === 'rejected' ? 'bg-red-500 text-white border-red-600' : 
                        'bg-slate-500 text-white border-slate-600'
                    }`}>
                        {currentModel.status}
                    </span>
                )}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 mr-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 w-full h-full bg-white relative">
            {(currentModel || (config.processTitle && !documentId)) && (
                <Modeler xml={currentModel?.bpmn_xml || undefined} onSave={handleModelerSave} isViewOnly={isViewOnly} />
            )}
            
            {/* FLOATING NOTE REVISI DI KANAN BAWAH */}
            {currentModel?.status === 'rejected' && currentModel?.catatan && (
              <div className="absolute bottom-24 right-8 z-50 w-87.5 bg-white border-l-4 border-l-red-500 shadow-2xl rounded-2xl p-5 animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-auto">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-red-50 rounded-xl text-red-600 shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[11px] font-black text-red-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> Catatan Revisi
                    </h4>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed bg-red-50/50 p-3 rounded-lg border border-red-100 whitespace-pre-wrap wrap-break-word max-h-48 overflow-y-auto">
                      &quot;{currentModel.catatan}&quot;
                    </p>
                    {!isViewOnly && (
                      <p className="text-[9px] text-slate-400 mt-2 italic font-medium leading-tight">
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
              <h3 className="text-xl font-bold">Informasi Dokumen Baru</h3>
              <button onClick={() => router.push('/bpmn')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            
            <p className="text-sm text-slate-500 mb-6">Lengkapi data di bawah ini sebelum mulai mendesain diagram Proses Bisnis.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Judul Proses <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: Penyusunan Rencana Kerja" value={config.processTitle} onChange={(e) => setConfig({ ...config, processTitle: e.target.value })} className="w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Kode Proses <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: SOP-PRC-01" value={config.processKey} onChange={(e) => setConfig({ ...config, processKey: e.target.value.toUpperCase().replace(/\s/g, '_') })} className="w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Unit Kerja Utama (Level 1) <span className="text-red-500">*</span></label>
                <select value={config.orgUnitL1} onChange={(e) => setConfig({ ...config, orgUnitL1: e.target.value, orgUnitL2: '' })} className="w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }}>
                  <option value="" disabled>-- Pilih Unit Utama --</option>
                  {l1Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Sub-Unit (Level 2)</label>
                <select value={config.orgUnitL2} onChange={(e) => setConfig({ ...config, orgUnitL2: e.target.value })} disabled={!config.orgUnitL1} className="w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50" style={{ borderColor: isDarkMode ? '#374151' : '#d1d5db', backgroundColor: isDarkMode ? '#0F172A' : '#f8fafc' }}>
                  <option value="">-- Tidak Ada / Kosong --</option>
                  {l2Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8 pt-4 border-t" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
              <button onClick={() => router.push('/bpmn')} className="px-5 py-2.5 text-sm font-bold border rounded-xl hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={handleStartModeling} className="px-6 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-colors flex items-center gap-2">
                 Buka Kanvas <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && !isViewOnly && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl p-6 border" style={{ backgroundColor: isDarkMode ? '#151F32' : '#ffffff', borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
            <div className="flex justify-between items-center mb-6 border-b pb-4" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
              <h3 className="text-xl font-bold">Simpan Dokumen Proses Bisnis</h3>
              <button onClick={() => setShowSaveModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
              <div className="space-y-4">
                <div className="mb-2">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Ekspor File</p>
                  <p className="text-xs text-slate-400">Unduh gambar ke komputer Anda.</p>
                </div>
                <button onClick={handleDownloadPDF} className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl flex items-center justify-center border border-red-200 transition-colors shadow-sm">
                  <FileText className="w-5 h-5 mr-2" /> Format PDF (A4)
                </button>
                <button onClick={handleDownloadSVG} className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-xl flex items-center justify-center border border-orange-200 transition-colors shadow-sm">
                  <ImageIcon className="w-5 h-5 mr-2" /> Format Gambar SVG
                </button>
              </div>

              <div className="space-y-4 flex flex-col border-l pl-8" style={{ borderColor: isDarkMode ? '#1e293b' : '#e5e7eb' }}>
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
                    onClick={() => executeSaveToDB('pending')} 
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
    </div>
  );
}

export default function BPMNStudioPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-slate-50 text-slate-500 font-medium">Memuat URL Parameter...</div>}>
      <BPMNStudioContent />
    </Suspense>
  );
} 