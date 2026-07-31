'use client';

// Dialog konfirmasi modern (pengganti window.confirm bawaan browser). Terpusat di
// tengah layar, mendukung mode gelap, ikon & warna sesuai jenis aksi, serta Enter
// (konfirmasi) / Esc (batal). Dipakai lewat hook useConfirm():
//   const { confirm, confirmNode } = useConfirm();
//   if (!(await confirm({ message: '...', tone: 'success' }))) return;
//   ...  render {confirmNode} sekali di dalam JSX halaman.
import { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Trash2, HelpCircle, X } from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

type Tone = 'default' | 'success' | 'danger' | 'warning';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

const TONE: Record<Tone, { ring: string; btn: string; iconWrap: string; icon: React.ReactNode; defaultTitle: string }> = {
  default: {
    ring: 'ring-blue-500/20',
    btn: 'bg-blue-600 hover:bg-blue-700',
    iconWrap: 'bg-blue-100 text-blue-600',
    icon: <HelpCircle className="w-6 h-6" />,
    defaultTitle: 'Konfirmasi',
  },
  success: {
    ring: 'ring-emerald-500/20',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    icon: <CheckCircle2 className="w-6 h-6" />,
    defaultTitle: 'Setujui Dokumen',
  },
  danger: {
    ring: 'ring-red-500/20',
    btn: 'bg-red-600 hover:bg-red-700',
    iconWrap: 'bg-red-100 text-red-600',
    icon: <Trash2 className="w-6 h-6" />,
    defaultTitle: 'Konfirmasi Tindakan',
  },
  warning: {
    ring: 'ring-amber-500/20',
    btn: 'bg-amber-500 hover:bg-amber-600',
    iconWrap: 'bg-amber-100 text-amber-600',
    icon: <AlertTriangle className="w-6 h-6" />,
    defaultTitle: 'Perhatian',
  },
};

export function useConfirm() {
  const { isDarkMode } = useAppContext();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions | string): Promise<boolean> => {
    const options = typeof o === 'string' ? { message: o } : o;
    setOpts(options);
    return new Promise<boolean>(resolve => { resolveRef.current = resolve; });
  }, []);

  const close = useCallback((val: boolean) => {
    resolveRef.current?.(val);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [opts, close]);

  const tone = TONE[opts?.tone || 'default'];

  const confirmNode = opts ? (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => close(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 fade-in duration-150 ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}
      >
        <div className="p-6 pb-5">
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${tone.iconWrap}`}>
              {tone.icon}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className={`text-base font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {opts.title || tone.defaultTitle}
              </h3>
              <p className={`text-sm mt-1.5 leading-relaxed whitespace-pre-wrap wrap-break-word ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {opts.message}
              </p>
            </div>
            <button
              onClick={() => close(false)}
              className={`shrink-0 p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-slate-500 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className={`flex items-center justify-end gap-2.5 px-6 py-4 border-t ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/40' : 'border-slate-100 bg-slate-50'}`}>
          <button
            onClick={() => close(false)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            {opts.cancelText || 'Batal'}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-colors focus:outline-none focus:ring-4 ${tone.btn} ${tone.ring}`}
          >
            {opts.confirmText || 'Ya, Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmNode };
}
