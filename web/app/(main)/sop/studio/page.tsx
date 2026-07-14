"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SOPBuilder from '@/components/SOPBuilder';

function SOPStudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const idFromUrl = searchParams.get('id');
  const mode = searchParams.get('mode');
  const title = searchParams.get('title') || '';
  const key = searchParams.get('key') || '';
  const l1 = searchParams.get('l1') || '';
  const l2 = searchParams.get('l2') || '';
  const jenis = searchParams.get('jenis') || '';
  const klasifikasi = searchParams.get('klasifikasi') || '';

  const [currentId, setCurrentId] = useState<string | null>(idFromUrl);
  const [initialData, setInitialData] = useState<string | null>(null);
  const [loading, setLoading] = useState(idFromUrl ? true : false);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string>('');

  const apiFetch = async (path: string, options?: RequestInit) => {
    const token = localStorage.getItem('token');
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const url = `/e-sop-atrbpn/api${safePath}`;

    const res = await fetch(url, {
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
  };

  useEffect(() => {
    if (currentId) {
      apiFetch(`/sop/models/${currentId}`)
        .then(async (res) => {
           if (!res.ok) throw new Error("Gagal");
           const text = await res.text();
           try { return JSON.parse(text); } catch { return {}; }
        })
        .then((data) => {
           if (data && data.sop_data) setInitialData(data.sop_data);
           if (data && data.status) setDocStatus(data.status);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [currentId]);

  // SOP terbit: ambil cover bertanda tangan untuk ditampilkan sebagai pratinjau di studio.
  useEffect(() => {
    if (!currentId || !['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '')) return;
    let active = true;
    let url: string | null = null;
    apiFetch(`/sop/models/${currentId}/cover`)
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        if (!active) return;
        url = URL.createObjectURL(blob);
        setCoverUrl(url);
        setCoverMime(blob.type);
      })
      .catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [currentId, docStatus]);

  // Simpan (POST baru / PUT update) dan kembalikan id dokumen.
  // status opsional: bila tidak diberikan pada update, server mempertahankan status lama
  // (dipakai saat simpan-untuk-ekspor PDF agar dokumen 'pending' tidak turun jadi 'draft').
  const persist = async (dataJson: string, status?: string): Promise<string> => {
    const parsedData = JSON.parse(dataJson);
    const rawKey = parsedData.nomor || key;
    const payload: Record<string, unknown> = {
      process_title: parsedData.judul || title || 'SOP',
      process_key: rawKey && rawKey.trim() ? rawKey.trim() : null,
      unit_l1: parsedData.unitKerja || l1,
      unit_l2: parsedData.subUnitKerja || l2,
      jenis_proses: parsedData.jenisSOP || jenis || null,
      klasifikasi_proses: parsedData.klasifikasiSOP || klasifikasi || null,
      sop_data: dataJson,
    };
    if (status) payload.status = status;
    else if (!currentId) payload.status = 'draft'; // dokumen baru wajib punya status

    const res = await apiFetch(currentId ? `/sop/models/${currentId}` : '/sop/models', {
      method: currentId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error: ${res.status}`);
    }
    const responseData = await res.json();
    let id = currentId;
    if (!currentId && responseData.id) {
      id = responseData.id.toString();
      setCurrentId(id);
      window.history.replaceState(null, '', `/e-sop-atrbpn/sop/studio?id=${id}`);
    }
    return id as string;
  };

  const handleSave = async (dataJson: string) => {
    try {
      // Dokumen yang sudah lolos draft (pending/approved) pertahankan statusnya saat menyimpan
      // perubahan konten — jangan turunkan ke 'draft'. Draft/rejected/usulan/baru → 'draft'.
      const keepStatus = ['pending', 'approved'].includes(docStatus || '');
      await persist(dataJson, keepStatus ? undefined : 'draft');
      alert("✅ Dokumen SOP Berhasil Disimpan!");
      localStorage.removeItem('e-sop-draft-local');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Kesalahan tidak dikenal";
      alert(`❌ Gagal menyimpan: ${errMsg}`);
    }
  };

  const handleSubmit = async (dataJson: string) => {
    try {
      await persist(dataJson, 'pending');
      alert("🚀 Berhasil dikirim ke Biro Ortala MR!");
      localStorage.removeItem('e-sop-draft-local');
      router.push('/sop');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Kesalahan tidak dikenal";
      alert(`❌ Gagal mengirim: ${errMsg}`);
    }
  };

  // Unduh PDF vektor F4: simpan dulu (pertahankan status) agar server merender versi terbaru,
  // lalu ambil PDF hasil render headless Chrome dari server dan unduh langsung.
  const handleDownloadPdf = async (dataJson: string) => {
    // SOP terbit terkunci (server menolak PUT) — jangan persist, langsung render dari data tersimpan.
    const id = ['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '') ? currentId : await persist(dataJson);
    if (!id) throw new Error('Dokumen belum tersimpan.');
    const res = await apiFetch(`/sop/models/${id}/pdf`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server Error: ${res.status}`);
    }
    const blob = await res.blob();
    let judul = 'Dokumen SOP';
    try { judul = JSON.parse(dataJson).judul || title || 'Dokumen SOP'; } catch { /* abaikan */ }
    // Nama file = "SOP - {judul}". Garis miring (/ atau \) → "_", karakter ilegal lain dibuang.
    const safe = judul.replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Dokumen SOP';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOP - ${safe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleBack = () => {
    router.push('/sop');
  };

  if (loading) return <div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-sm font-bold text-slate-500">Memuat Studio...</div>;

  return (
    <SOPBuilder
      initialData={initialData}
      initialTitle={title}
      initialKey={key}
      initialL1={l1}
      initialL2={l2}
      initialJenis={jenis}
      initialKlasifikasi={klasifikasi}
      isViewOnly={mode === 'view' || ['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '')}
      signedCoverUrl={coverUrl}
      signedCoverMime={coverMime}
      hasSignedCover={['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '')}
      onSaveTrigger={handleSave}
      onSubmitTrigger={handleSubmit}
      onBackTrigger={handleBack}
      onDownloadPdf={handleDownloadPdf}
    />
  );
}

export default function SOPStudioPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-sm font-bold text-slate-500">Menyiapkan Kanvas...</div>}>
      <SOPStudioContent />
    </Suspense>
  );
}
