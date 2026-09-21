'use client';

/* =============================================================================
   HALAMAN STUDIO STANDAR PELAYANAN
   -----------------------------------------------------------------------------
   Pembungkus SPBuilder: memuat/menyimpan naskah, simpan otomatis, serta
   menjembatani unduh PDF/Word dan impor Word ke API.

   Terbuka untuk superadmin, admin, dan user terbatas (viewer tanpa akses) —
   batas unit kerja dijaga server lewat assertModelAccess.
   ========================================================================== */

import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SPBuilder, { type SPBuilderRef } from '@/components/SPBuilder';
import { type SPDoc, type TautanDok } from '@/lib/spTemplate';

const BOLEH_STUDIO = ['superadmin', 'admin', 'user'];
const API_BASE = '/e-sop-atrbpn/api';
// Naskah terkunci: sedang diverifikasi/ditetapkan atau sudah terbit.
const STATUS_TERKUNCI = ['verifikasi', 'penetapan', 'terbit'];

function StudioSPContent() {
  const router = useRouter();
  const params = useSearchParams();
  const idAwal = params.get('id');
  const mode = params.get('mode');
  const judulAwal = params.get('title') || '';
  const l1Awal = params.get('l1') || '';
  const l2Awal = params.get('l2') || '';
  const klasifikasiAwal = params.get('klasifikasi') || '';

  const [idDok, setIdDok] = useState<string | null>(idAwal);
  const [dataAwal, setDataAwal] = useState<string | null>(null);
  // Identitas dokumen dari server — WAJIB jadi cadangan saat menyimpan naskah
  // yang dibuka lewat ?id= saja: tanpa ini, dokumen lama yang belum bernaskah
  // (sp_data kosong) kehilangan judul/unitnya begitu disimpan dari studio.
  const [metaAwal, setMetaAwal] = useState<{ judul: string; l1: string; l2: string; klasifikasi: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(!!idAwal);
  const [gagalMuat, setGagalMuat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersimpanPada, setTersimpanPada] = useState<string | null>(null);
  const [gagalOtomatis, setGagalOtomatis] = useState(false);
  const [ditolak, setDitolak] = useState(false);

  const builderRef = useRef<SPBuilderRef>(null);
  const terakhirRef = useRef<string | null>(null);
  const termuatRef = useRef(false);   // autosave baru boleh jalan setelah naskah benar-benar termuat
  const sedangSimpanRef = useRef(false);

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.replace('/e-sop-atrbpn/login?expired=1');
      throw new Error('Sesi berakhir, silakan login kembali');
    }
    return res;
  }, []);

  // ── Penjagaan peran ───────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const me = JSON.parse(localStorage.getItem('user') || '{}');
      if (!BOLEH_STUDIO.includes(me.role)) { setDitolak(true); return; }
    } catch { router.replace('/login'); }
  }, [router]);

  // ── Muat naskah ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (ditolak) return;
    if (!idDok) { termuatRef.current = true; return; }
    apiFetch(`/sp/models/${idDok}`)
      .then(async (res) => {
        if (!res.ok) {
          const e = await res.json().catch(() => ({} as { error?: string }));
          throw new Error(e.error || `Gagal memuat dokumen (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((d) => {
        if (d?.sp_data) setDataAwal(d.sp_data);
        if (d?.status) setStatus(d.status);
        setMetaAwal({
          judul: d?.process_title || '', l1: d?.unit_l1 || '', l2: d?.unit_l2 || '',
          klasifikasi: d?.klasifikasi_proses || '',
        });
        termuatRef.current = true;
      })
      // Jangan diam-diam menampilkan kanvas kosong: simpan otomatis bisa
      // menimpa naskah server dengan dokumen kosong (pelajaran dari SOP).
      .catch((e) => { if (!String(e.message).includes('Sesi berakhir')) setGagalMuat(e.message); })
      .finally(() => setMemuat(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDok, ditolak]);

  const hanyaLihat = mode === 'view' || STATUS_TERKUNCI.includes(status || '');

  // ── Simpan ────────────────────────────────────────────────────────────────
  const persist = useCallback(async (dataJson: string, statusBaru?: string): Promise<string> => {
    let judul = judulAwal || metaAwal?.judul || 'Standar Pelayanan';
    let unitL1 = l1Awal || metaAwal?.l1 || '';
    let unitL2 = l2Awal || metaAwal?.l2 || '';
    let klasifikasi = klasifikasiAwal || metaAwal?.klasifikasi || '';
    try {
      const d = JSON.parse(dataJson) as SPDoc;
      if (d.judul?.trim()) judul = d.judul.trim();
      if (d.unitKerja) unitL1 = d.unitKerja;
      if (d.subUnitKerja) unitL2 = d.subUnitKerja;
      if (d.klasifikasi) klasifikasi = d.klasifikasi;
    } catch { /* naskah rusak — pakai nilai dari URL */ }

    const payload: Record<string, unknown> = {
      process_title: judul, unit_l1: unitL1 || null, unit_l2: unitL2 || null,
      klasifikasi_proses: klasifikasi || null, sp_data: dataJson,
    };
    if (statusBaru) payload.status = statusBaru;
    else if (!idDok) payload.status = 'draft';

    const res = await apiFetch(idDok ? `/sp/models/${idDok}` : '/sp/models', {
      method: idDok ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(e.error || `Gagal menyimpan (HTTP ${res.status})`);
    }
    const hasil = await res.json();
    let id = idDok;
    if (!idDok && hasil.id) {
      id = String(hasil.id);
      setIdDok(id);
      window.history.replaceState(null, '', `/e-sop-atrbpn/sp/studio?id=${id}`);
    }
    if (hasil.status) setStatus(hasil.status);
    terakhirRef.current = dataJson;
    return id as string;
  }, [apiFetch, idDok, judulAwal, l1Awal, l2Awal, klasifikasiAwal, metaAwal]);

  // Patok baseline simpan-otomatis SEGERA setelah naskah termuat. Dulu patokan
  // diambil pada detak pertama (detik ke-25) — ketikan di 25 detik pertama ikut
  // terpatok sebagai "sudah tersimpan" dan tak pernah disimpan otomatis.
  useEffect(() => {
    if (memuat || ditolak || terakhirRef.current !== null || !builderRef.current) return;
    try { terakhirRef.current = builderRef.current.getSPData(); } catch { /* biar detak yang mematok */ }
  }, [memuat, ditolak]);

  // Simpan otomatis tiap 25 detik — hanya untuk dokumen yang sudah tersimpan.
  useEffect(() => {
    if (hanyaLihat || ditolak) return;
    const timer = setInterval(async () => {
      if (!idDok || !builderRef.current || !termuatRef.current || sedangSimpanRef.current) return;
      let data: string;
      try { data = builderRef.current.getSPData(); } catch { return; }
      if (terakhirRef.current === null) { terakhirRef.current = data; return; }
      if (data === terakhirRef.current) return;
      sedangSimpanRef.current = true;
      try {
        await persist(data);
        setTersimpanPada(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
        setGagalOtomatis(false);
      } catch { setGagalOtomatis(true); }
      finally { sedangSimpanRef.current = false; }
    }, 25000);
    return () => clearInterval(timer);
  }, [idDok, hanyaLihat, ditolak, persist]);

  const simpan = async (data: string) => {
    setMenyimpan(true);
    try {
      // Dokumen yang sudah lolos draft dipertahankan statusnya saat isinya disunting.
      await persist(data, ['pending', 'approved'].includes(status || '') ? undefined : 'draft');
      alert('✅ Naskah Standar Pelayanan berhasil disimpan.');
    } catch (e) {
      alert(`❌ ${e instanceof Error ? e.message : 'Gagal menyimpan.'}`);
    } finally { setMenyimpan(false); }
  };

  // Konfirmasi sudah ditampilkan modal di studio — di sini langsung dikirim.
  const kirim = async (data: string) => {
    try { JSON.parse(data); } catch { alert('❌ Naskah tidak valid.'); return; }
    setMenyimpan(true);
    try {
      await persist(data, 'pending');
      alert('🚀 Naskah terkirim ke Biro Ortala MR.');
      router.push('/sp');
    } catch (e) {
      alert(`❌ ${e instanceof Error ? e.message : 'Gagal mengirim.'}`);
    } finally { setMenyimpan(false); }
  };

  // ── Unduh: simpan dulu agar server merender versi terbaru ─────────────────
  const unduhBerkas = async (data: string, jenis: 'pdf' | 'docx') => {
    const id = STATUS_TERKUNCI.includes(status || '') ? idDok : await persist(data);
    if (!id) throw new Error('Dokumen belum tersimpan.');
    const res = await apiFetch(`/sp/models/${id}/${jenis}`);
    if (!res.ok) {
      const e = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(e.error || `Gagal mengunduh (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    let judul = 'Standar Pelayanan';
    try { judul = (JSON.parse(data) as SPDoc).judul || judul; } catch { /* abaikan */ }
    const aman = judul.replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Standar Pelayanan';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SP - ${aman}.${jenis}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Render PDF untuk mode "Pratinjau Halaman" di studio — simpan dulu supaya
  // yang dirender server adalah naskah terbaru.
  const renderPdf = async (data: string): Promise<Blob> => {
    const id = STATUS_TERKUNCI.includes(status || '') ? idDok : await persist(data);
    if (!id) throw new Error('Dokumen belum tersimpan.');
    const res = await apiFetch(`/sp/models/${id}/pdf`);
    if (!res.ok) {
      const e = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(e.error || `Gagal membuat pratinjau (HTTP ${res.status})`);
    }
    return res.blob();
  };

  // Pencarian dokumen untuk panel "Keterkaitan Dokumen". Dicari di SERVER
  // (registri Dashboard >1600 dokumen) dan menggabungkan dua sumber: tabel
  // `dokumen` (Dashboard) + naskah studio yang sudah ditetapkan.
  const cariDokumenTerkait = useCallback(async (kind: 'sop' | 'bpmn', q: string): Promise<TautanDok[]> => {
    try {
      const res = await apiFetch(`/sp/keterkaitan?kind=${kind}&q=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      return (await res.json()) as TautanDok[];
    } catch { return []; }
  }, [apiFetch]);

  const imporWord = async (base64: string) => {
    const res = await apiFetch('/sp/import-docx', { method: 'POST', body: JSON.stringify({ file_data: base64 }) });
    const d = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) throw new Error((d as { error?: string }).error || 'Gagal membaca berkas Word.');
    return d as { doc: SPDoc; jumlahKomponen: number };
  };

  if (ditolak) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-[#002855]">Studio Standar Pelayanan tidak tersedia</h2>
          <p className="text-sm text-slate-500 mt-2">
            Akun <b>viewer</b> hanya dapat melihat daftar dokumen. Penyusunan naskah Standar Pelayanan
            terbuka untuk akun superadmin, admin, dan user unit kerja.
          </p>
          <button onClick={() => router.push('/sp')}
            className="mt-5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
            Kembali ke Daftar SP
          </button>
        </div>
      </div>
    );
  }

  if (memuat) return <div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-sm font-bold text-slate-500">Memuat Studio…</div>;

  if (gagalMuat) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white border border-red-200 rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-bold text-red-600">Gagal memuat dokumen</h2>
          <p className="text-sm text-slate-500 mt-2">{gagalMuat}</p>
          <div className="flex gap-2 justify-center mt-5">
            <button onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Coba Lagi</button>
            <button onClick={() => router.push('/sp')} className="px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-bold">Kembali</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {gagalOtomatis && !hanyaLihat ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-100 px-3 py-1.5 rounded-full bg-red-600/95 text-white text-xs font-bold shadow-lg pointer-events-none">
          Gagal simpan otomatis — simpan manual!
        </div>
      ) : tersimpanPada && !hanyaLihat && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-100 px-3 py-1.5 rounded-full bg-emerald-600/90 text-white text-xs font-semibold shadow-lg pointer-events-none">
          Tersimpan otomatis {tersimpanPada}
        </div>
      )}
      <SPBuilder
        ref={builderRef}
        initialData={dataAwal}
        initialTitle={judulAwal || metaAwal?.judul || ''}
        initialL1={l1Awal || metaAwal?.l1 || ''}
        initialL2={l2Awal || metaAwal?.l2 || ''}
        initialKlasifikasi={klasifikasiAwal || metaAwal?.klasifikasi || ''}
        isViewOnly={hanyaLihat}
        saving={menyimpan}
        onSave={simpan}
        onSubmit={kirim}
        onBack={() => router.push('/sp')}
        onDownloadPdf={(d) => unduhBerkas(d, 'pdf')}
        onDownloadDocx={(d) => unduhBerkas(d, 'docx')}
        onImportDocx={imporWord}
        onRenderPdf={renderPdf}
        statusDokumen={status}
        bolehKeterkaitan
        cariDokumenTerkait={cariDokumenTerkait}
      />
    </>
  );
}

export default function StudioSPPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-sm font-bold text-slate-500">Menyiapkan Kanvas…</div>}>
      <StudioSPContent />
    </Suspense>
  );
}
