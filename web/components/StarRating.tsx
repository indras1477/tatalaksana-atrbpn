'use client';

import { Star } from 'lucide-react';

/** Deretan bintang 1–5. `onChange` kosong = hanya tampil (tidak bisa diklik). */
export default function StarRating({ value, onChange, size = 20, label }: {
  value: number; onChange?: (v: number) => void; size?: number; label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={label ? `${label}: ${value} dari 5` : `${value} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map(n => {
        const aktif = n <= Math.round(value);
        const bintang = <Star style={{ width: size, height: size }} className={aktif ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />;
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} bintang`}
            onClick={() => onChange(n)} className="p-0.5 rounded transition-transform hover:scale-110 active:scale-95">
            {bintang}
          </button>
        ) : <span key={n}>{bintang}</span>;
      })}
    </div>
  );
}
