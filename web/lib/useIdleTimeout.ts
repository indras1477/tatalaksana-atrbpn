'use client';
import { useEffect, useRef, useCallback } from 'react';

const IDLE_MS  = 4 * 60 * 60 * 1000; // 4 jam tidak aktif (diperpanjang dari 2 jam)
const WARN_MS  = 5 * 60 * 1000;       // peringatan 5 menit sebelum logout

// 'input' & 'keydown' menangkap ketikan di kanvas SOP (contentEditable) & isian;
// 'wheel'/'pointerdown' menangkap interaksi di kanvas BPMN.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'input', 'scroll', 'touchstart', 'click', 'wheel', 'pointerdown'] as const;

export function useIdleTimeout(onWarn: () => void, onTimeout: () => void) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned    = useRef(false);

  const reset = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warned.current = false;
    warnTimer.current = setTimeout(() => { warned.current = true; onWarn(); }, IDLE_MS - WARN_MS);
    idleTimer.current = setTimeout(onTimeout, IDLE_MS);
  }, [onWarn, onTimeout]);

  useEffect(() => {
    const handler = () => { if (!warned.current) reset(); };
    // capture:true → aktivitas tetap terdeteksi walau bpmn-js/komponen kanvas
    // memanggil stopPropagation di fase bubbling (penyebab logout saat sedang bekerja).
    const opts = { passive: true, capture: true } as const;
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handler, opts));
    reset();
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handler, opts));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
    };
  }, [reset]);

  return reset;
}
