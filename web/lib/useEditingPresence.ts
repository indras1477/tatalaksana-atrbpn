'use client';
import { useEffect, useRef } from 'react';
import { getClientId } from './clientId';

const BASE = '/e-sop-atrbpn/api/editing-sessions';
const HEARTBEAT_MS = 60_000; // 60 detik

export function useEditingPresence(
  modelType: 'bpmn' | 'sop',
  modelId: number | string | null | undefined,
  token: string,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    if (!modelId || !token) return;

    const id = Number(modelId);
    const body = JSON.stringify({ model_type: modelType, model_id: id, client_id: getClientId() });
    const headers = () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenRef.current}`,
    });

    const ping = () =>
      fetch(BASE, { method: 'POST', headers: headers(), body })
        .then(r => {
          // Sesi mati — hentikan heartbeat (percuma terus mengirim POST yang ditolak).
          if (r.status === 401 && timerRef.current) clearInterval(timerRef.current);
        })
        .catch(() => {});

    const end = () =>
      fetch(BASE, { method: 'DELETE', headers: headers(), body, keepalive: true }).catch(() => {});

    ping();
    timerRef.current = setInterval(ping, HEARTBEAT_MS);

    const onUnload = () => end();
    window.addEventListener('beforeunload', onUnload);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('beforeunload', onUnload);
      end();
    };
  }, [modelType, modelId, token]);
}
