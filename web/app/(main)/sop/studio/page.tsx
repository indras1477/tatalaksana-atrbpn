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

  const [currentId, setCurrentId] = useState<string | null>(idFromUrl);
  const [initialData, setInitialData] = useState<string | null>(null);
  const [loading, setLoading] = useState(idFromUrl ? true : false);

  const apiFetch = async (path: string, options?: RequestInit) => {
    const token = localStorage.getItem('token');
    const safePath = path.startsWith('/') ? path : `/${path}`;
    const url = `/e-sop-atrbpn/api${safePath}`;

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {}),
      },
    });
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
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [currentId]);

  const handleSave = async (dataJson: string) => {
    try {
      const parsedData = JSON.parse(dataJson);
      const payload = {
        process_title: parsedData.judul || title || 'SOP',
        process_key: parsedData.nomor || key || `SOP-${Date.now()}`,
        unit_l1: parsedData.unitKerja || l1,
        unit_l2: parsedData.subUnitKerja || l2,
        sop_data: dataJson,
        status: 'draft'
      };

      const res = await apiFetch(currentId ? `/sop/models/${currentId}` : '/sop/models', {
        method: currentId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || `Server Error: ${res.status}`);
      }

      const responseData = await res.json();

      if (!currentId && responseData.id) {
         setCurrentId(responseData.id.toString());
         window.history.replaceState(null, '', `/e-sop-atrbpn/sop/studio?id=${responseData.id}`);
      }

      alert("✅ Dokumen SOP Berhasil Disimpan!");
      localStorage.removeItem('e-sop-draft-local');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Kesalahan tidak dikenal";
      alert(`❌ Gagal menyimpan: ${errMsg}`);
    }
  };

  const handleSubmit = async (dataJson: string) => {
    try {
      const parsedData = JSON.parse(dataJson);
      const payload = {
        process_title: parsedData.judul || title || 'SOP',
        process_key: parsedData.nomor || key || `SOP-${Date.now()}`,
        unit_l1: parsedData.unitKerja || l1,
        unit_l2: parsedData.subUnitKerja || l2,
        sop_data: dataJson,
        status: 'pending'
      };

      const res = await apiFetch(currentId ? `/sop/models/${currentId}` : '/sop/models', {
        method: currentId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || `Server Error: ${res.status}`);
      }

      alert("🚀 Berhasil dikirim ke Biro Ortala!");
      localStorage.removeItem('e-sop-draft-local');
      router.push('/sop');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Kesalahan tidak dikenal";
      alert(`❌ Gagal mengirim: ${errMsg}`);
    }
  };

  const handleBack = () => {
    router.push('/sop');
  };

  if (loading) return <div className="h-[calc(100vh-4rem)] flex items-center justify-center font-bold text-slate-500">Memuat Studio...</div>;

  return (
    <SOPBuilder
      initialData={initialData}
      initialTitle={title}
      initialKey={key}
      initialL1={l1}
      initialL2={l2}
      isViewOnly={mode === 'view'}
      onSaveTrigger={handleSave}
      onSubmitTrigger={handleSubmit}
      onBackTrigger={handleBack}
    />
  );
}

export default function SOPStudioPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-4rem)] flex items-center justify-center font-bold text-slate-500">Menyiapkan Kanvas...</div>}>
      <SOPStudioContent />
    </Suspense>
  );
}
