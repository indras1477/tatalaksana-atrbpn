'use client';

// Chat kotak masuk bersama: User (Terbatas) ↔ tim admin/superadmin. Pembaruan lewat polling
// (tanpa WebSocket) supaya tidak bergantung konfigurasi nginx/tunnel.
import { useCallback, useEffect, useState } from 'react';

export const API_CHAT = '/e-sop-atrbpn/api/chat';
export const EVENT_CHAT = 'simpel-chat-berubah';

export interface PesanChat {
  id: number;
  dariUser: boolean;
  saya: boolean;
  pengirim: string | null;
  peran: string;
  waktu: string;
  diedit: string | null;
  dihapus: boolean;
  isi: string;
  berkas: { nama: string; mime: string; ukuran: number } | null;
  balas: { id: number; pengirim: string | null; dihapus: boolean; isi: string; berkas: string | null } | null;
}
export interface RiwayatChat {
  lawan: { id: number; nama: string; unit: string; judul: string };
  baca: { staffSampai: number; staffOleh: string | null; userSampai: number };
  pesan: PesanChat[];
}
export interface BarisDaftar {
  id: number; judul: string; nama: string; unit: string; pesanTerakhir: string; dariUser: boolean; pengirim: string | null;
  waktu: string; menungguBalasan: boolean; belumDibaca: number;
}

export async function apiChat<T = unknown>(path: string, opt: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const r = await fetch(`${API_CHAT}${path}`, {
    method: opt.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(opt.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan');
  return j as T;
}

/** Beri tahu lencana (header/sidebar) agar segera memuat ulang. */
export const segarkanLencanaChat = () => window.dispatchEvent(new Event(EVENT_CHAT));

/** Angka lencana chat: staf = percakapan menunggu balasan; User = pesan staf belum dibaca. */
export function useLencanaChat(role?: string) {
  const [n, setN] = useState(0);
  const aktif = role === 'user' || role === 'admin' || role === 'superadmin';
  const muat = useCallback(async () => {
    if (!aktif || document.hidden) return;
    try { setN((await apiChat<{ badge: number }>('/ringkasan')).badge); } catch { /* abaikan — coba lagi di putaran berikut */ }
  }, [aktif]);
  useEffect(() => {
    if (!aktif) return;
    muat();
    const t = setInterval(muat, 12000);
    window.addEventListener(EVENT_CHAT, muat);
    document.addEventListener('visibilitychange', muat);
    return () => { clearInterval(t); window.removeEventListener(EVENT_CHAT, muat); document.removeEventListener('visibilitychange', muat); };
  }, [aktif, muat]);
  return n;
}

export const bacaBase64 = (f: File) => new Promise<string>((ok, gagal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => gagal(new Error('Gagal membaca berkas'));
  r.readAsDataURL(f);
});
