'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  dm: boolean;
}

export default function SearchableSelect({ options, value, onChange, placeholder, disabled, dm }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (v: string) => { onChange(v); setQuery(''); setOpen(false); };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange(''); setQuery(''); };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { if (!disabled) setOpen(true); }}
        className={`flex items-center border rounded-xl px-3 py-2.5 gap-2 cursor-pointer transition-all focus-within:ring-4
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${dm
            ? 'bg-[#0F172A] border-slate-700 focus-within:ring-blue-500/20 focus-within:border-blue-500'
            : 'bg-slate-50 border-slate-200 focus-within:ring-blue-100 focus-within:border-blue-400'}`}
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          disabled={disabled}
          value={open ? query : (value || '')}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          placeholder={value || placeholder}
          className={`flex-1 bg-transparent outline-none text-sm font-medium min-w-0
            ${value && !open
              ? (dm ? 'text-white' : 'text-slate-800')
              : (dm ? 'placeholder:text-slate-500 text-slate-300' : 'placeholder:text-slate-400 text-slate-500')}`}
        />
        {value && !open
          ? <button type="button" onClick={clear} className="text-slate-400 hover:text-red-400 transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
          : <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        }
      </div>
      {open && (
        <ul className={`absolute z-50 w-full mt-1 max-h-52 overflow-y-auto rounded-xl border shadow-xl text-sm
          ${dm ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          {filtered.length === 0
            ? <li className={`px-4 py-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Tidak ditemukan</li>
            : filtered.map(o => (
              <li
                key={o}
                onClick={() => select(o)}
                className={`px-4 py-2.5 cursor-pointer font-medium transition-colors
                  ${o === value
                    ? 'bg-blue-600 text-white'
                    : (dm ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50')}`}
              >
                {o}
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}
