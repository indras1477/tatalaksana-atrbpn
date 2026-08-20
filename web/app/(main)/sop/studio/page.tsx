"use client";

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SOPBuilder, { type SOPBuilderRef } from '@/components/SOPBuilder';
import { useEditingPresence } from '@/lib/useEditingPresence';
import { getClientId } from '@/lib/clientId';
import { useConfirm } from '@/components/ConfirmDialog';

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
  // Berapa halaman cover yang discan unit kerja (umumnya 1 = halaman bertanda tangan);
  // sisanya tetap dipakai dari sistem agar halaman cover lanjutan tidak hilang.
  const [coverPages, setCoverPages] = useState(1);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string>('');
  const [editConflict, setEditConflict] = useState<{username: string; nama_lengkap: string}[]>([]);

  // Auto-save: aktif hanya setelah dokumen tersimpan pertama kali (punya currentId).
  const builderRef = useRef<SOPBuilderRef>(null);
  const lastSavedRef = useRef<string | null>(null);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Autosave hanya boleh berjalan bila dokumen benar-benar termuat (cegah menimpa
  // dokumen server dengan kanvas kosong saat fetch gagal).
  const loadedOkRef = useRef(false);
  const savingRef = useRef(false); // guard: jangan tumpang-tindih request autosave

  const [presenceToken, setPresenceToken] = useState('');
  useEffect(() => { setPresenceToken(localStorage.getItem('token') || ''); }, []);
  // Role utk tombol Setujui di mode lihat (superadmin diperlakukan sbg admin).
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    try { const me = JSON.parse(localStorage.getItem('user') || '{}'); setIsAdminUser(['admin', 'superadmin'].includes(me.role)); } catch { /* abaikan */ }
  }, []);
  const { confirm, confirmNode } = useConfirm();
  const [approving, setApproving] = useState(false);
  // Setujui langsung dari mode lihat (status pending) — tanpa kembali ke daftar.
  // Alur sama dgn handleApprove halaman daftar: pending → approved (pengesahan pimpinan).
  const approveFromView = async () => {
    if (!currentId) return;
    if (!(await confirm({ title: 'Setujui Dokumen SOP', message: `Setujui dokumen SOP \"${title || 'ini'}\"? Selanjutnya menunggu pengesahan pimpinan (unggah cover TTD).`, tone: 'success', confirmText: 'Ya, Setujui' }))) return;
    setApproving(true);
    try {
      const res = await apiFetch(`/sop/models/status/${currentId}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', catatan: '' }) });
      if (res.ok) { setDocStatus('approved'); alert('✅ Disetujui. Menunggu pengesahan pimpinan — unit kerja mengunggah cover ber-TTD.'); }
      else { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal menyetujui.'); }
    } catch (e) { console.error(e); alert('Gagal menyetujui.'); }
    finally { setApproving(false); }
  };
  const isViewOnlySop = mode === 'view' || ['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '');
  useEditingPresence('sop', (isViewOnlySop || !currentId) ? null : Number(currentId), presenceToken);

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
           if (!res.ok) throw new Error(`Gagal memuat dokumen (HTTP ${res.status})`);
           const text = await res.text();
           try { return JSON.parse(text); } catch { throw new Error('Respons server tidak valid'); }
        })
        .then((data) => {
           if (data && data.sop_data) setInitialData(data.sop_data);
           if (data && data.status) setDocStatus(data.status);
           if (data && data.cover_pages) setCoverPages(Math.max(1, Number(data.cover_pages) || 1));
           loadedOkRef.current = true; // izinkan autosave HANYA setelah dokumen benar termuat
           // Cek apakah perangkat lain sedang mengedit dokumen ini (termasuk akun sama beda perangkat).
           // Mode lihat / dokumen terkunci tidak perlu peringatan — pembaca tidak menimbulkan konflik.
           if (currentId && mode !== 'view' && !['terbit', 'verifikasi', 'penetapan'].includes(data?.status || '')) {
             const tok = localStorage.getItem('token');
             fetch(`/e-sop-atrbpn/api/editing-sessions/sop`, { headers: { Authorization: `Bearer ${tok}` } })
               .then(r => r.ok ? r.json() : [])
               .then((sessions: {model_id: number; user_id: number; client_id: string; username: string; nama_lengkap: string}[]) => {
                 const me = JSON.parse(localStorage.getItem('user') || '{}');
                 const others = sessions
                   .filter(s => s.model_id === Number(currentId) && s.client_id !== getClientId())
                   .map(s => s.user_id === me.id ? { ...s, nama_lengkap: `${s.nama_lengkap || s.username} (perangkat lain, akun sama)` } : s);
                 if (others.length) setEditConflict(others);
               })
               .catch(() => {});
           }
        })
        .catch((e) => {
          // JANGAN diam-diam merender kanvas kosong: pernah menyebabkan autosave menimpa
          // dokumen server dengan data kosong. Tampilkan error & blokir builder.
          if (!(e instanceof Error && e.message.includes('Sesi berakhir'))) setLoadError(e instanceof Error ? e.message : 'Gagal memuat dokumen');
        })
        .finally(() => setLoading(false));
    } else {
      loadedOkRef.current = true; // dokumen baru — tak ada yang perlu dimuat
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
    // Perbarui patokan auto-save agar tak menyimpan ulang data yang identik.
    lastSavedRef.current = dataJson;
    return id as string;
  };

  // AUTO-SAVE SOP tiap 25 detik. Hanya berjalan bila dokumen sudah pernah disimpan
  // (currentId ada) dan bukan mode lihat / status terkunci. Menyimpan diam-diam tanpa
  // mengubah status (persist tanpa argumen status → server mempertahankan status lama).
  useEffect(() => {
    if (isViewOnlySop) return;
    const timer = setInterval(async () => {
      if (!currentId || !builderRef.current) return;
      if (!loadedOkRef.current) return;      // dokumen belum termuat benar — jangan simpan apa pun
      if (savingRef.current) return;         // masih ada request berjalan — jangan tumpang tindih
      if (['terbit', 'verifikasi', 'penetapan'].includes(docStatus || '')) return;
      let data: string;
      try { data = builderRef.current.getSOPData(); } catch { return; }
      if (lastSavedRef.current === null) { lastSavedRef.current = data; return; } // patok baseline
      if (data === lastSavedRef.current) return; // tak ada perubahan
      savingRef.current = true;
      try {
        await persist(data); // pertahankan status
        setAutoSavedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
        setAutoSaveError(false);
      } catch {
        setAutoSaveError(true); // tunjukkan ke user — jangan bilang "aman" padahal gagal
      } finally {
        savingRef.current = false;
      }
    }, 25000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, docStatus, isViewOnlySop]);

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
    <>
    {/* Peringatan konflik editing */}
    {editConflict.length > 0 && (
      <div className="fixed inset-0 z-300 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl bg-white text-slate-800">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <div>
                <h3 className="font-bold text-base">Dokumen Sedang Diedit</h3>
                <p className="text-sm mt-1 text-slate-500">
                  {editConflict.map(u => u.nama_lengkap || u.username).join(', ')} sedang mengedit dokumen ini. Hubungi rekan/tim Anda yang sedang mengerjakan dokumen ini untuk berkoordinasi sebelum melanjutkan.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditConflict([]); window.location.search = window.location.search + '&mode=view'; }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Buka Mode Lihat
              </button>
              <button
                onClick={() => { setEditConflict([]); router.push('/sop'); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Kembali ke Daftar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* Indikator auto-save */}
    {autoSaveError && !isViewOnlySop ? (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-100 px-3 py-1.5 rounded-full bg-red-600/95 text-white text-xs font-bold shadow-lg flex items-center gap-1.5 pointer-events-none">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        Gagal simpan otomatis — simpan manual!
      </div>
    ) : autoSavedAt && !isViewOnlySop && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-100 px-3 py-1.5 rounded-full bg-emerald-600/90 text-white text-xs font-semibold shadow-lg flex items-center gap-1.5 pointer-events-none">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        Tersimpan otomatis {autoSavedAt}
      </div>
    )}
    {confirmNode}
    <SOPBuilder
      ref={builderRef}
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
      signedCoverPages={coverPages}
      onSaveTrigger={handleSave}
      onSubmitTrigger={handleSubmit}
      onBackTrigger={handleBack}
      onDownloadPdf={handleDownloadPdf}
      shareModelId={currentId ? Number(currentId) : null}
      toolbarExtra={isViewOnlySop && isAdminUser && docStatus === 'pending' && currentId ? (
        <button onClick={approveFromView} disabled={approving} title="Setujui dokumen ini (Review Ortala MR)"
          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-extrabold uppercase shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60">
          {approving ? 'Memproses…' : 'Setujui'}
        </button>
      ) : null}
    />
    </>
  );
}

export default function SOPStudioPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] flex items-center justify-center text-sm font-bold text-slate-500">Menyiapkan Kanvas...</div>}>
      <SOPStudioContent />
    </Suspense>
  );
}
