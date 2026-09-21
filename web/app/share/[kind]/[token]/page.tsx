'use client';

// Halaman PUBLIK view-only (tanpa login) — dibuka dari tautan "Bagikan".
// BPMN studio → viewer interaktif (pan/zoom, ramah HP). Dokumen manual → PDF/tautan.
// SOP & SP studio → PDF vektor yang sudah dirender saat dibagikan.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ExternalLink, FileText, Building2, AlertCircle, Loader2 } from 'lucide-react';
import KreditPengembang from '@/components/KreditPengembang';

const BPMNViewer = dynamic(() => import('@/components/BPMNViewer'), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Memuat diagram…</div>,
});

const API = '/e-sop-atrbpn/api';

interface ShareDoc {
  id: number; process_title: string; status: string;
  unit_l1?: string | null; unit_l2?: string | null;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
  is_manual?: boolean | null; manual_link?: string | null; manual_link_visio?: string | null;
  manual_file_name?: string | null; has_file?: boolean; has_pdf?: boolean;
  bpmn_xml?: string | null;
}

// Google Drive/Docs → mode /preview agar bisa disematkan.
function embedUrl(link: string): string | null {
  try {
    const u = new URL(link);
    if (u.hostname.includes('drive.google.com')) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
      const id = u.searchParams.get('id');
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
      return null;
    }
    if (u.hostname.includes('docs.google.com')) return link.replace(/\/(edit|view)([?#].*)?$/, '/preview');
    return link;
  } catch { return null; }
}

export default function SharePage() {
  const params = useParams();
  const kind = String(params.kind || '');
  const LABEL_JENIS: Record<string, string> = {
    bpmn: 'Proses Bisnis',
    sop: 'Standar Operasional Prosedur',
    sp: 'Standar Pelayanan',
  };
  const labelJenis = LABEL_JENIS[kind] || 'Dokumen';
  const token = String(params.token || '');
  const [doc, setDoc] = useState<ShareDoc | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!['bpmn', 'sop', 'sp'].includes(kind)) { setError('Jenis dokumen tidak dikenali.'); setLoading(false); return; }
    fetch(`${API}/public/${kind}/${token}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Tautan tidak ditemukan'); return r.json(); })
      .then(setDoc)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [kind, token]);

  const fileUrl = `${API}/public/${kind}/${token}/file`;
  const pdfUrl = `${API}/public/${kind}/${token}/pdf`;  // SOP & SP sama-sama menyajikan PDF hasil render

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 flex flex-col bg-slate-100">
      {/* Header */}
      <header className="shrink-0 bg-[#001F43] text-white px-4 py-3 flex items-center gap-3 shadow-lg">
        <div className="w-9 h-9 rounded-lg bg-white/10 grid place-items-center shrink-0 text-sm font-black">SI</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 leading-none mb-0.5">
            {labelJenis} · SIMPEL ATR/BPN
          </p>
          <h1 className="text-sm sm:text-base font-bold leading-snug wrap-break-word line-clamp-2">{doc?.process_title || 'Memuat…'}</h1>
          {doc && (doc.unit_l1 || doc.unit_l2) && (
            <p className="text-[11px] text-white/60 mt-0.5 flex items-center gap-1 wrap-break-word">
              <Building2 className="w-3 h-3 shrink-0" />{doc.unit_l1}{doc.unit_l2 ? ` › ${doc.unit_l2}` : ''}
            </p>
          )}
        </div>
      </header>
      {children}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-1.5 text-center text-[10px] text-slate-400">
        <span className="block sm:inline">Tampilan baca-saja · Sistem Informasi Manajemen Prosedur dan Pelayanan (SIMPEL) ATR/BPN</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">
          <KreditPengembang />
        </span>
      </footer>
    </div>
  );

  if (loading) return <Shell><div className="flex-1 flex items-center justify-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div></Shell>;
  if (error || !doc) return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-slate-600 font-semibold">{error || 'Dokumen tidak ditemukan'}</p>
        <p className="text-xs text-slate-400">Tautan mungkin salah atau berbagi sudah dicabut.</p>
      </div>
    </Shell>
  );

  // ---- Dokumen manual (PDF unggahan / tautan eksternal) ----
  if (doc.is_manual) {
    const link = doc.manual_link || '';
    const emb = link ? embedUrl(link) : null;
    const src = doc.has_file ? fileUrl : emb;
    return (
      <Shell>
        {src ? (
          <iframe src={src} title={doc.process_title} className="flex-1 w-full border-0 bg-white" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <FileText className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">Pratinjau tidak tersedia untuk tautan ini.</p>
          </div>
        )}
        <div className="shrink-0 bg-white border-t border-slate-200 p-2.5 flex flex-wrap gap-2 justify-center">
          {doc.has_file && <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"><FileText className="w-4 h-4" /> Buka PDF</a>}
          {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50"><ExternalLink className="w-4 h-4" /> Buka Tautan</a>}
          {doc.manual_link_visio && <a href={doc.manual_link_visio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-300 text-indigo-700 text-sm font-bold hover:bg-indigo-50"><ExternalLink className="w-4 h-4" /> File Sumber</a>}
        </div>
      </Shell>
    );
  }

  // ---- BPMN studio → viewer interaktif ----
  if (kind === 'bpmn') {
    return (
      <Shell>
        <div className="flex-1 relative min-h-0">
          {doc.bpmn_xml
            ? <BPMNViewer xml={doc.bpmn_xml} />
            : <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Diagram belum tersedia.</div>}
        </div>
      </Shell>
    );
  }

  // ---- SOP studio → PDF vektor hasil render saat dibagikan ----
  return (
    <Shell>
      {doc.has_pdf
        ? <iframe src={pdfUrl} title={doc.process_title} className="flex-1 w-full border-0 bg-white" />
        : <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center"><FileText className="w-10 h-10 text-slate-300" /><p className="text-slate-500 text-sm">Dokumen belum siap dibagikan. Minta pemilik untuk membagikan ulang.</p></div>}
    </Shell>
  );
}
