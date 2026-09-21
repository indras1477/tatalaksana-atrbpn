'use client';

/* =============================================================================
   STUDIO STANDAR PELAYANAN (SP)
   -----------------------------------------------------------------------------
   Penyusun naskah SP di atas kanvas F4 potret (210×330 mm) dengan margin
   atas 2,5 · kiri 2 · bawah 2 · kanan 2 cm dan huruf Bookman Old Style 12 pt —
   persis seperti hasil unduhan PDF/Word, sehingga yang terlihat di layar adalah
   yang tercetak.

   Naskah berupa tabel NO | KOMPONEN | URAIAN yang dikelompokkan menjadi
   "Komponen Service Delivery" dan "Komponen Manufacturing" (Permenpan RB
   15/2014); kelompok & komponen tambahan dapat disisipkan sesuai kebutuhan.

   Pemenggalan halaman diserahkan ke mesin cetak (sama seperti Word), jadi di
   layar naskah tampil sebagai satu lembar menerus dengan garis bantu batas
   halaman setiap 285 mm tinggi isi.
   ========================================================================== */

import React, {
  useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo,
  forwardRef, useImperativeHandle, Fragment,
} from 'react';
import {
  ArrowLeft, Save, Send, FileDown, FileUp, Plus, Trash2, ChevronUp, ChevronDown,
  Bold, Italic, Underline, List, ListOrdered, IndentIncrease, IndentDecrease,
  Loader2, Sparkles, FileText, Layers, ZoomIn, ZoomOut, Info, X, Undo2, Redo2, BookOpen, TableCellsMerge, Check,
  Link2, ExternalLink, Search,
} from 'lucide-react';
import PratinjauPdf from '@/components/PratinjauPdf';
import {
  type SPDoc, type SPItem, type TautanDok, SP_PAGE, SP_CONTENT_H, SP_COL,
  SEC_SERVICE, SEC_MANUFACTURING, KOMPONEN_TAMBAHAN, KLASIFIKASI_SP,
  spId, parseSPDoc, bersihkanUraian, uraianKosong, contohIsiUntuk, hitungBaris,
} from '@/lib/spTemplate';
import { pecahUraian, gabungUraian, jumlahButir, type BlokUraian } from '@/lib/spBlok';

export interface SPBuilderRef { getSPData: () => string }

interface Props {
  initialData?: string | null;
  initialTitle?: string;
  initialL1?: string;
  initialL2?: string;
  initialKlasifikasi?: string;
  isViewOnly?: boolean;
  saving?: boolean;
  onSave: (data: string) => void | Promise<void>;
  onSubmit: (data: string) => void | Promise<void>;
  onBack: () => void;
  onDownloadPdf: (data: string) => Promise<void>;
  onDownloadDocx: (data: string) => Promise<void>;
  onImportDocx: (base64: string) => Promise<{ doc: SPDoc; jumlahKomponen: number }>;
  /** Render naskah jadi PDF untuk mode "Pratinjau Halaman" (halaman terpisah). */
  onRenderPdf: (data: string) => Promise<Blob>;
  /** Status dokumen di server — ditampilkan di modal Simpan. */
  statusDokumen?: string | null;
  toolbarExtra?: React.ReactNode;
  /** Tampilkan bagian Keterkaitan Dokumen (SOP / Proses Bisnis) di panel properti. */
  bolehKeterkaitan?: boolean;
  /** Cari dokumen SOP / Proses Bisnis yang dapat dikaitkan (pencarian di server). */
  cariDokumenTerkait?: (kind: 'sop' | 'bpmn', q: string) => Promise<TautanDok[]>;
}

// =============================================================================
// Editor uraian (contentEditable) — HTML sederhana, sinkron dengan renderer PDF
// =============================================================================
const dalamDaftar = () => {
  const sel = window.getSelection();
  const n = sel?.anchorNode;
  if (!n) return false;
  const el = n.nodeType === 1 ? (n as HTMLElement) : n.parentElement;
  return !!el?.closest('li');
};

/** Blok terdekat (paragraf / butir daftar) tempat kursor berada. */
const blokTerdekat = (n: Node, akar: HTMLElement): HTMLElement | null => {
  let el: HTMLElement | null = n.nodeType === 1 ? (n as HTMLElement) : n.parentElement;
  while (el && el !== akar && !/^(P|DIV|LI)$/.test(el.tagName)) el = el.parentElement;
  // Baris pertama masih berupa teks lepas (belum dibungkus <p>) — akar editor
  // sendiri yang menjadi bloknya, kalau tidak awalan "1. " tak pernah terdeteksi.
  return el || akar;
};

/** Kedalaman daftar tempat kursor berada (0 = di luar daftar). */
const tingkatDaftar = (n: Node, akar: HTMLElement) => {
  let el: HTMLElement | null = n.nodeType === 1 ? (n as HTMLElement) : n.parentElement;
  let d = 0;
  while (el && el !== akar) {
    if (/^(OL|UL)$/.test(el.tagName)) d++;
    el = el.parentElement;
  }
  return d;
};

/**
 * Ubah awalan yang diketik menjadi daftar sungguhan — meniru Word:
 *   "1." / "1)" + spasi di paragraf biasa  → mulai daftar bernomor
 *   "-"  / "*"  + spasi di paragraf biasa  → mulai daftar butir
 *   "a." / "a)" + spasi di awal butir tingkat 1 → turun ke tingkat 2 (a.)
 *   "1)" + spasi di awal butir tingkat 2       → turun ke tingkat 3 (1))
 * Setelah itu Enter otomatis melanjutkan nomor berikutnya (bawaan peramban).
 * @returns true bila awalan tadi ditangani (penekanan spasi tidak diteruskan)
 */
function autoDaftar(akar: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return false;
  const blok = blokTerdekat(sel.anchorNode, akar);
  if (!blok) return false;

  // Teks dari awal blok sampai kursor — awalan hanya berlaku bila diketik paling depan.
  const jangkauan = document.createRange();
  jangkauan.selectNodeContents(blok);
  jangkauan.setEnd(sel.anchorNode, sel.anchorOffset);
  const awalan = jangkauan.toString();

  const tingkat = tingkatDaftar(sel.anchorNode, akar);
  let perintah: 'insertOrderedList' | 'insertUnorderedList' | 'indent' | null = null;

  if (tingkat === 0) {
    if (/^\s*\d+[.)]$/.test(awalan)) perintah = 'insertOrderedList';
    else if (/^\s*[-*•]$/.test(awalan)) perintah = 'insertUnorderedList';
  } else if (tingkat === 1 && /^\s*[a-z][.)]$/.test(awalan)) perintah = 'indent';
  else if (tingkat === 2 && /^\s*\d+\)$/.test(awalan)) perintah = 'indent';

  if (!perintah) return false;
  // Awalan dihapus lewat perintah 'delete' bawaan peramban (bukan
  // Range.deleteContents) supaya posisi kursor & pembatalan tetap konsisten —
  // menghapus lewat Range membuat execCommand berikutnya mengenai butir yang salah.
  for (let i = 0; i < awalan.length; i += 1) document.execCommand('delete');
  document.execCommand(perintah);
  return true;
}

/**
 * Kotak teks satu-baris yang tumbuh mengikuti isinya.
 * Tingginya diukur ulang setiap nilai berubah DAN setelah Bookman Old Style
 * selesai dimuat — tanpa itu pengukuran memakai metrik huruf cadangan sehingga
 * nama komponen yang panjang terpotong ("Produk" alih-alih "Produk pelayanan").
 */
function AutoTextarea({ value, onChange, disabled, placeholder, className }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
  placeholder?: string; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ukurUlang = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(ukurUlang, [value, ukurUlang]);
  useEffect(() => {
    if (!document.fonts?.ready) return;
    let batal = false;
    document.fonts.ready.then(() => { if (!batal) ukurUlang(); }).catch(() => {});
    return () => { batal = true; };
  }, [ukurUlang]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

function RichText({ value, onChange, disabled, onFokus, placeholder, beku }: {
  value: string; onChange: (html: string) => void; disabled?: boolean;
  onFokus?: (el: HTMLDivElement | null) => void; placeholder?: string;
  /** Bekukan sinkronisasi isi — dipakai potongan lain dari baris yang sedang
   *  diketik; rentang bloknya baru sah lagi setelah penataan ulang. */
  beku?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const terakhir = useRef<string>('');

  // Isi awal dipasang sekali; setelah itu DOM dikelola peramban agar kursor
  // tidak melompat saat mengetik. WAJIB useLayoutEffect: efek layout anak
  // berjalan sebelum efek layout induk, sehingga saat penataan halaman
  // mengukur tinggi blok, editor hasil remount SUDAH berisi — dengan useEffect
  // biasa pengukuran membaca div kosong dan pembagian lembar berosilasi.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = value || '';
    terakhir.current = value || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Perubahan dari luar (mis. impor Word / sisip contoh isi) baru diterapkan
  // ketika editor TIDAK sedang difokuskan — menimpa saat mengetik = kursor kacau.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || beku || document.activeElement === el) return;
    if ((value || '') !== terakhir.current) {
      el.innerHTML = value || '';
      terakhir.current = value || '';
    }
  }, [value, beku]);

  const commit = (html: string) => { terakhir.current = html; onChange(html); };

  return (
    <div
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder || 'Ketik uraian komponen…'}
      className={`sp-editable ${uraianKosong(value) ? 'sp-kosong' : ''} ${disabled ? '' : 'sp-bisa-edit'}`}
      onInput={(e) => commit((e.target as HTMLDivElement).innerHTML)}
      onFocus={() => onFokus?.(ref.current)}
      onBlur={(e) => {
        const bersih = bersihkanUraian((e.target as HTMLDivElement).innerHTML);
        if (ref.current) ref.current.innerHTML = bersih;
        commit(bersih);
        onFokus?.(null);
      }}
      onPaste={(e) => {
        // Tempelan dari Word membawa gaya MSO yang merusak tata letak — ambil
        // strukturnya saja (daftar, tebal/miring), buang sisanya.
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        const teks = e.clipboardData.getData('text/plain');
        const isi = html
          ? bersihkanUraian(html)
          : teks.split(/\r?\n/).filter(Boolean).map(b => `<p>${b.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))}</p>`).join('');
        document.execCommand('insertHTML', false, isi);
        if (ref.current) commit(ref.current.innerHTML);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Tab') {
          if (!dalamDaftar()) return;  // di luar daftar, Tab tetap pindah sel
          e.preventDefault();
          document.execCommand(e.shiftKey ? 'outdent' : 'indent');
          if (ref.current) commit(ref.current.innerHTML);
          return;
        }
        // Ketik "1." / "a." lalu SPASI atau ENTER → langsung jadi daftar
        // bernomor / turun tingkat, sama seperti Word. Enter ikut memicu karena
        // banyak yang mengetik "a." lalu langsung menekan Enter.
        if ((e.key === ' ' || e.key === 'Enter') && ref.current && autoDaftar(ref.current)) {
          e.preventDefault();
          commit(ref.current.innerHTML);
        }
      }}
    />
  );
}

// =============================================================================
// Studio
// =============================================================================
const SPBuilder = forwardRef<SPBuilderRef, Props>(function SPBuilder({
  initialData = null, initialTitle = '', initialL1 = '', initialL2 = '', initialKlasifikasi = '',
  isViewOnly = false, saving = false,
  onSave, onSubmit, onBack, onDownloadPdf, onDownloadDocx, onImportDocx, onRenderPdf,
  statusDokumen = null, toolbarExtra = null, bolehKeterkaitan = false, cariDokumenTerkait,
}, ref) {
  const [doc, setDoc] = useState<SPDoc>(() =>
    parseSPDoc(initialData, {
      judul: initialTitle, unitKerja: initialL1, subUnitKerja: initialL2, klasifikasi: initialKlasifikasi,
    }));
  const [zoom, setZoom] = useState(1);
  const [sibuk, setSibuk] = useState<'' | 'pdf' | 'docx' | 'impor'>('');
  const [pesan, setPesan] = useState<{ tone: 'ok' | 'err'; teks: string } | null>(null);
  // Panel properti di sisi kanan (dulu modal "Edit Info"): identitas naskah +
  // integrasi ke dokumen SOP/Proses Bisnis yang sudah ditetapkan.
  const [panelInfo, setPanelInfo] = useState(false);
  // Kandidat keterkaitan dicari di SERVER (registri Dashboard >1600 dokumen —
  // terlalu besar untuk dimuat seluruhnya), dengan jeda ketik 300 ms.
  const [kandidatTautan, setKandidatTautan] = useState<{ sop: TautanDok[]; bpmn: TautanDok[] }>({ sop: [], bpmn: [] });
  const [memuatKandidat, setMemuatKandidat] = useState<{ sop: boolean; bpmn: boolean }>({ sop: false, bpmn: false });
  const [cariTautan, setCariTautan] = useState<{ sop: string; bpmn: string }>({ sop: '', bpmn: '' });
  // "Simpan" membuka pilihan tindakan (draft / kirim ke Ortala) — pola yang sama
  // dengan studio BPMN & SOP, bukan dua tombol terpisah di bilah alat.
  const [barisAktif, setBarisAktif] = useState<string | null>(null);
  // Urungkan/Ulangi: tumpukan salinan naskah. Editor uraian tidak terkendali
  // saat diketik, jadi pemulihan dipaksakan lewat `versiKanvas` yang menjadi
  // bagian key — editornya dipasang ulang dengan isi hasil pemulihan.
  const [versiKanvas, setVersiKanvas] = useState(0);
  const [bisaUrung, setBisaUrung] = useState(false);
  const [bisaUlang, setBisaUlang] = useState(false);
  const riwayat = useRef<{ lalu: SPDoc[]; nanti: SPDoc[]; capMs: number }>({ lalu: [], nanti: [], capMs: 0 });
  const docRef = useRef(doc);
  // Mode "Pratinjau Halaman": menampilkan PDF hasil render, di mana tiap
  // halaman F4 benar-benar terpisah (kanvas penyuntingan sengaja menerus agar
  // satu komponen panjang tetap bisa disunting utuh).
  const [pratinjauUrl, setPratinjauUrl] = useState<string | null>(null);
  const [memuatPratinjau, setMemuatPratinjau] = useState(false);
  // Popup gabung sel: pilih pasangan baris + kolom mana yang disatukan.
  const [modalGabung, setModalGabung] = useState<{ arah: 'atas' | 'bawah'; kolom: Set<string> } | null>(null);
  const [modalSimpan, setModalSimpan] = useState(false);
  const [konfirmKirim, setKonfirmKirim] = useState(false);
  const editorFokus = useRef<HTMLDivElement | null>(null);
  const tundaTata = useRef(false);
  const pasTata = useRef(0);
  const tandaTata = useRef<{ doc: SPDoc; kunci: string } | null>(null);
  // Rentang blok potongan yang SEDANG diketik. Rentang dari state halaman
  // menjadi basi begitu ketikan pertama menambah/mengurangi blok; tanpa
  // pelacakan ini, ketikan berikutnya menyalin ulang ekor naskah (duplikasi).
  const rentangLive = useRef<{ item: string; awal: number; akhir: number } | null>(null);
  // Hasil pemecahan blok di-cache per string HTML — pecahUraian menyentuh DOM,
  // jadi jangan dijalankan ulang pada setiap render.
  const cacheBlok = useRef(new Map<string, BlokUraian[]>());
  const blokDari = useCallback((html: string): BlokUraian[] => {
    const c = cacheBlok.current;
    let b = c.get(html);
    if (!b) {
      b = pecahUraian(html);
      if (c.size > 400) c.clear();
      c.set(html, b);
    }
    return b;
  }, []);
  const inputBerkas = useRef<HTMLInputElement>(null);
  const kertasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { docRef.current = doc; }, [doc]);


  /**
   * Simpan keadaan naskah SEBELUM diubah.
   * @param gabung true untuk perubahan beruntun (mengetik) — perubahan dalam
   *        800 ms digabung jadi satu langkah agar Ctrl+Z tidak per-huruf.
   */
  const catatRiwayat = useCallback((gabung = false) => {
    const h = riwayat.current;
    const kini = Date.now();
    if (!gabung || kini - h.capMs > 800) {
      h.lalu.push(docRef.current);
      if (h.lalu.length > 80) h.lalu.shift();   // batasi pemakaian memori
      h.nanti = [];
      setBisaUrung(true);
      setBisaUlang(false);
    }
    h.capMs = kini;
  }, []);

  const urungkan = useCallback(() => {
    const h = riwayat.current;
    const sebelum = h.lalu.pop();
    if (!sebelum) return;
    h.nanti.push(docRef.current);
    h.capMs = 0;
    setDoc(sebelum);
    setVersiKanvas(v => v + 1);
    setBisaUrung(h.lalu.length > 0);
    setBisaUlang(true);
  }, []);

  const ulangi = useCallback(() => {
    const h = riwayat.current;
    const berikut = h.nanti.pop();
    if (!berikut) return;
    h.lalu.push(docRef.current);
    h.capMs = 0;
    setDoc(berikut);
    setVersiKanvas(v => v + 1);
    setBisaUlang(h.nanti.length > 0);
    setBisaUrung(true);
  }, []);

  // Ctrl+Z / Ctrl+Y (atau Ctrl+Shift+Z). Harus dicegat: tanpa ini peramban
  // menjalankan undo bawaan contentEditable yang hanya tahu satu sel.
  useEffect(() => {
    if (isViewOnly) return;
    const tekan = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); urungkan(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); ulangi(); }
    };
    window.addEventListener('keydown', tekan, true);
    return () => window.removeEventListener('keydown', tekan, true);
  }, [isViewOnly, urungkan, ulangi]);

  const dataJson = useCallback(() => JSON.stringify(doc), [doc]);
  useImperativeHandle(ref, () => ({ getSPData: () => JSON.stringify(doc) }), [doc]);

  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* peramban lama */ }
  }, []);

  // Esc melepas pilihan baris (tombol aksinya ikut hilang).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBarisAktif(null); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Klik di mana pun di luar baris tabel juga melepas pilihan — tanpa ini
  // tombol aksi menetap walau penyusun sudah selesai menyunting baris itu.
  // Klik pada area kertas DI LUAR baris mana pun = lepas pilihan.
  // Penangan ini SENGAJA hanya dipasang di area kanvas, bukan di wadah studio:
  // mousedown terjadi sebelum click, jadi kalau bilah alat atau modal ikut
  // tercakup, keduanya lenyap sebelum kliknya mendarat — tombolnya jadi mati.
  const lepasPilihanBila = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[data-baris]')) setBarisAktif(null);
  };

  // Skala otomatis agar lebar kertas (210 mm ≈ 794 px) muat di layar sempit.
  useEffect(() => {
    const hitung = () => {
      const tersedia = (kertasRef.current?.parentElement?.clientWidth || window.innerWidth) - 32;
      const lebarKertas = (SP_PAGE.w / 25.4) * 96;
      setZoom(z => (tersedia < lebarKertas ? Math.max(0.4, tersedia / lebarKertas) : Math.min(z === 1 ? 1 : z, 1)));
    };
    hitung();
    window.addEventListener('resize', hitung);
    return () => window.removeEventListener('resize', hitung);
  }, []);

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  // ── Operasi naskah ────────────────────────────────────────────────────────
  const ubahItem = (secId: string, itemId: string, tambalan: Partial<SPItem>) => {
    // Mengetik digabung jadi satu langkah urungkan; perubahan lain berdiri sendiri.
    catatRiwayat('komponen' in tambalan || 'uraian' in tambalan);
    setDoc(d => ({
      ...d,
      sections: d.sections.map(s => s.id !== secId ? s : {
        ...s, items: s.items.map(it => it.id === itemId ? { ...it, ...tambalan } : it),
      }),
    }));
  };

  const sisipItem = (secId: string, indeks: number) => {
    catatRiwayat();
    setDoc(d => ({
      ...d,
      sections: d.sections.map(s => {
        if (s.id !== secId) return s;
        const items = [...s.items];
        items.splice(indeks + 1, 0, { id: spId(), komponen: '', uraian: '' });
        return { ...s, items };
      }),
    }));
  };

  const hapusItem = (secId: string, itemId: string) => {
    catatRiwayat();
    setDoc(d => ({
      ...d,
      sections: d.sections.map(s => s.id !== secId ? s : { ...s, items: s.items.filter(it => it.id !== itemId) }),
    }));
  };

  const geserItem = (secId: string, indeks: number, arah: -1 | 1) => {
    catatRiwayat();
    setDoc(d => ({
      ...d,
      sections: d.sections.map(s => {
        if (s.id !== secId) return s;
        const tujuan = indeks + arah;
        if (tujuan < 0 || tujuan >= s.items.length) return s;
        const items = [...s.items];
        [items[indeks], items[tujuan]] = [items[tujuan], items[indeks]];
        return { ...s, items };
      }),
    }));
  };

  // Gabung sel NO / KOMPONEN dengan baris di ATASNYA (rowspan). Baris pertama
  // tidak bisa digabung karena tak ada baris di atasnya.
  /**
   * Terapkan penggabungan sel antara sepasang baris bertetangga.
   * Penanda selalu disimpan di baris BAWAH dari pasangan itu: gabung "ke atas"
   * menandai baris ini, "ke bawah" menandai baris sesudahnya — hasil visualnya
   * sama, hanya sudut pandang penyusunnya yang beda.
   */
  const terapkanGabung = (secId: string, itemId: string, arah: 'atas' | 'bawah', kolom: Set<string>) => {
    catatRiwayat();
    setDoc(d => ({
      ...d,
      sections: d.sections.map(sec => {
        if (sec.id !== secId) return sec;
        const i = sec.items.findIndex(x => x.id === itemId);
        const sasaran = arah === 'atas' ? i : i + 1;
        if (sasaran <= 0 || sasaran >= sec.items.length) return sec;
        return {
          ...sec,
          items: sec.items.map((it, j) => j !== sasaran ? it : {
            ...it,
            gabungNo: kolom.has('no'),
            gabungKomponen: kolom.has('komponen'),
            gabungUraian: kolom.has('uraian'),
          }),
        };
      }),
    }));
  };

  const tambahSection = () => {
    catatRiwayat();
    setDoc(d => ({
      ...d,
      sections: [...d.sections, { id: spId('sec'), judul: 'KOMPONEN TAMBAHAN', items: [{ id: spId(), komponen: '', uraian: '' }] }],
    }));
  };

  const hapusSection = (secId: string) => {
    catatRiwayat();
    setDoc(d => ({ ...d, sections: d.sections.filter(s => s.id !== secId) }));
  };

  const ubahSection = (secId: string, judul: string) => {
    catatRiwayat(true);
    setDoc(d => ({ ...d, sections: d.sections.map(s => s.id === secId ? { ...s, judul } : s) }));
  };

  // ── Format teks (bekerja pada editor uraian yang sedang difokuskan) ───────
  const perintah = (cmd: string) => {
    const el = editorFokus.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd);
    // Simpan hasilnya: execCommand tidak memicu onInput di semua peramban.
    const secId = el.dataset.sec, itemId = el.dataset.item;
    if (secId && itemId) ubahItem(secId, itemId, { uraian: el.innerHTML });
  };
  const tombolFormat = (Ikon: typeof Bold, cmd: string, judul: string) => (
    <button
      key={cmd}
      type="button"
      title={judul}
      // preventDefault menjaga sorotan teks di editor tetap hidup saat tombol ditekan.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => perintah(cmd)}
      disabled={isViewOnly}
      className="p-2 rounded-lg text-slate-600 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <Ikon className="w-4 h-4" />
    </button>
  );

  const bukaPratinjau = async () => {
    setMemuatPratinjau(true);
    setPesan(null);
    try {
      const blob = await onRenderPdf(dataJson());
      setPratinjauUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (e) {
      setPesan({ tone: 'err', teks: e instanceof Error ? e.message : 'Gagal membuat pratinjau halaman.' });
    } finally { setMemuatPratinjau(false); }
  };
  const tutupPratinjau = () => setPratinjauUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  useEffect(() => () => { if (pratinjauUrl) URL.revokeObjectURL(pratinjauUrl); }, [pratinjauUrl]);

  // ── Unduh / impor ─────────────────────────────────────────────────────────
  const unduh = async (jenis: 'pdf' | 'docx') => {
    setSibuk(jenis);
    setPesan(null);
    try {
      await (jenis === 'pdf' ? onDownloadPdf(dataJson()) : onDownloadDocx(dataJson()));
    } catch (e) {
      setPesan({ tone: 'err', teks: e instanceof Error ? e.message : 'Gagal mengunduh berkas.' });
    } finally { setSibuk(''); }
  };

  const pilihBerkas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';                       // agar berkas sama bisa dipilih lagi
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setPesan({ tone: 'err', teks: 'Hanya berkas .docx (Word 2007 ke atas) yang didukung. Simpan ulang dokumen Anda sebagai .docx.' });
      return;
    }
    const pembaca = new FileReader();
    pembaca.onload = async () => {
      setSibuk('impor');
      setPesan(null);
      try {
        const hasil = await onImportDocx(String(pembaca.result || '').split(',').pop() || '');
        const lama = doc.sections.reduce((n, s) => n + s.items.filter(i => !uraianKosong(i.uraian)).length, 0);
        const lanjut = lama === 0 || window.confirm(
          `Naskah dari Word berisi ${hasil.jumlahKomponen} komponen.\n\n` +
          `Dokumen yang sedang terbuka sudah punya ${lama} komponen terisi dan akan DIGANTI.\n\nLanjutkan?`);
        if (!lanjut) return;
        setDoc(d => ({
          ...d,
          judul: hasil.doc.judul || d.judul,
          instansi: hasil.doc.instansi || d.instansi,
          sections: hasil.doc.sections.length ? hasil.doc.sections : d.sections,
        }));
        setPesan({ tone: 'ok', teks: `Berhasil mengimpor ${hasil.jumlahKomponen} komponen dari Word. Periksa isinya, lalu tekan Simpan.` });
      } catch (err) {
        setPesan({ tone: 'err', teks: err instanceof Error ? err.message : 'Gagal membaca berkas Word.' });
      } finally { setSibuk(''); }
    };
    pembaca.onerror = () => setPesan({ tone: 'err', teks: 'Berkas tidak dapat dibaca.' });
    pembaca.readAsDataURL(f);
  };

  // Baris yang sedang dipilih — dipakai bilah aksi kontekstual di bawah toolbar.
  const barisTerpilih = useMemo(() => {
    for (const sec of doc.sections) {
      const i = sec.items.findIndex(x => x.id === barisAktif);
      if (i >= 0) return { sec, i, it: sec.items[i] };
    }
    return null;
  }, [doc, barisAktif]);

  // ── Pengaliran isi ke lembar-lembar F4 ──────────────────────────────────
  // Daftar rata semua baris tabel (judul kelompok + komponen).
  const entri = useMemo(() => {
    const out: { kunci: string; tipe: 'sec' | 'item'; si: number; ii: number }[] = [];
    doc.sections.forEach((sec, si) => {
      out.push({ kunci: `sec-${sec.id}`, tipe: 'sec', si, ii: -1 });
      sec.items.forEach((it, ii) => out.push({ kunci: `it-${it.id}`, tipe: 'item', si, ii }));
    });
    return out;
  }, [doc]);

  // Blok atomik — tidak boleh dipisah antar-halaman: baris yang selnya menyatu
  // (rowspan) dan judul kelompok yang harus menempel pada komponen pertamanya.
  const blok = useMemo(() => {
    const out: number[][] = [];
    entri.forEach((e, idx) => {
      const it = e.tipe === 'item' ? doc.sections[e.si].items[e.ii] : null;
      const menyatu = !!(it && e.ii > 0 && (it.gabungNo || it.gabungKomponen || it.gabungUraian));
      const ikutJudul = idx > 0 && entri[idx - 1].tipe === 'sec';
      if (out.length && (menyatu || ikutJudul)) out[out.length - 1].push(idx);
      else out.push([idx]);
    });
    return out;
  }, [entri, doc]);

  /** Sepotong baris pada satu lembar. Satu komponen bisa terbagi ke beberapa
   *  lembar: potongan pertama membawa sel NO & KOMPONEN, potongan lanjutan
   *  menyisakan sel itu kosong — sama seperti naskah cetak. */
  type Potongan = { idx: number; blokAwal: number; blokAkhir: number; lanjutan: boolean; terpotong: boolean };
  const [halaman, setHalaman] = useState<Potongan[][]>([]);
  const [pemicuTata, setPemicuTata] = useState(0);
  const halamanTampil: Potongan[][] = halaman.length
    ? halaman
    : [entri.map((_, i) => ({ idx: i, blokAwal: 0, blokAkhir: Infinity, lanjutan: false, terpotong: false }))];

  const hitungHalaman = useCallback(() => {
    const kertas = kertasRef.current;
    if (!kertas) return;
    const pxmm = 96 / 25.4;
    // Penyangga 2mm — sama persis dengan skrip pemenggal PDF (lihat
    // api/spDocument.js): menutup selisih pembulatan garis tabel agar lembar
    // tidak pernah tersusun melebihi area cetak.
    const kapasitas = (SP_CONTENT_H - 2) * pxmm;
    // Tinggi diukur PECAHAN (getBoundingClientRect) lalu dibagi zoom — offsetHeight
    // membulatkan ke bilangan bulat, dan pembulatan yang menumpuk di puluhan baris
    // pernah menggeser titik pemenggalan satu butir dibanding PDF (yang mengukur
    // pecahan). Pembagian zoom mengembalikan ke ukuran tata letak asli.
    const skala = zoom || 1;
    const t = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().height / skala : 0);
    const kepala = t(kertas.querySelector('thead'));
    const blokJudul = t(kertas.querySelector('[data-blok-judul]'));

    // Tinggi tiap baris, tinggi sel komponen, dan tinggi tiap blok uraian.
    const tinggiBaris = new Map<string, number>();
    const tinggiKomponen = new Map<string, number>();
    const tinggiBlok = new Map<string, number[]>();
    kertas.querySelectorAll<HTMLElement>('tr[data-kunci]').forEach(tr => {
      const k = tr.dataset.kunci as string;
      tinggiBaris.set(k, Math.max(tinggiBaris.get(k) ?? 0, t(tr)));
      const komp = tr.querySelector<HTMLElement>('.sp-komponen');
      if (komp) tinggiKomponen.set(k, t(komp));
      const ed = tr.querySelector<HTMLElement>('.sp-editable');
      if (ed) {
        const mulai = Number(tr.dataset.blokAwal || 0);
        const daftar = tinggiBlok.get(k) ?? [];
        let n = mulai;
        Array.from(ed.children).forEach(el => {
          if (el.tagName === 'OL' || el.tagName === 'UL') {
            Array.from(el.children).forEach(li => {
              if (li.tagName === 'LI') { daftar[n] = t(li); n += 1; }
            });
          } else { daftar[n] = t(el); n += 1; }
        });
        tinggiBlok.set(k, daftar);
      }
    });
    if (!tinggiBaris.size) return;

    const isiSel = 2 * 1.5 * pxmm;            // padding atas+bawah sel
    const hasil: Potongan[][] = [];
    let kini: Potongan[] = [];
    let terpakai = blokJudul + kepala;
    const halamanBaru = () => { hasil.push(kini); kini = []; terpakai = kepala; };

    blok.forEach(grup => {
      // Blok atomik (judul kelompok + baris ber-rowspan) tidak boleh dipecah.
      const bolehDipecah = grup.length === 1 && entri[grup[0]].tipe === 'item';
      const tinggiGrup = grup.reduce((n, i) => n + (tinggiBaris.get(entri[i].kunci) ?? 0), 0);

      if (!bolehDipecah) {
        if (kini.length && terpakai + tinggiGrup > kapasitas) halamanBaru();
        grup.forEach(i => kini.push({ idx: i, blokAwal: 0, blokAkhir: Infinity, lanjutan: false, terpotong: false }));
        terpakai += tinggiGrup;
        return;
      }

      const i = grup[0];
      const e = entri[i];
      const bloks = tinggiBlok.get(e.kunci) ?? [];
      const html = docRef.current.sections[e.si]?.items[e.ii]?.uraian || '';
      const diharapkan = blokDari(html).length;
      const terukur = bloks.filter(t => t != null).length;
      // Pengukuran per-blok hanya dipercaya bila jumlahnya PAS dengan hasil
      // pemecahan HTML — DOM editor bisa berbeda sesaat dari naskahnya
      // (mis. baris pertama masih berupa teks lepas). Bila meleset, baris
      // diperlakukan utuh dulu; penataan berikutnya memecahnya dengan benar.
      const jml = terukur === diharapkan ? diharapkan : 0;
      if (!jml) {                                   // uraian kosong / ukur meleset — utuh
        if (kini.length && terpakai + tinggiGrup > kapasitas) halamanBaru();
        kini.push({ idx: i, blokAwal: 0, blokAkhir: Infinity, lanjutan: false, terpotong: false });
        terpakai += tinggiGrup;
        return;
      }

      let mulai = 0;
      let lanjutan = false;
      while (mulai < jml) {
        let sisa = kapasitas - terpakai - isiSel;
        // Potongan pertama juga harus memuat sel KOMPONEN.
        const minimalKomponen = lanjutan ? 0 : (tinggiKomponen.get(e.kunci) ?? 0);
        let akhir = mulai;
        let dipakai = 0;
        while (akhir < jml && dipakai + (bloks[akhir] || 0) <= sisa) { dipakai += bloks[akhir] || 0; akhir += 1; }
        // Tak ada satu blok pun yang muat → buka lembar baru dulu.
        if (akhir === mulai) {
          if (kini.length) { halamanBaru(); continue; }
          akhir = mulai + 1;                       // lembar kosong tapi blok tetap tak muat: paksa satu
          dipakai = bloks[mulai] || 0;
          sisa = kapasitas - terpakai - isiSel;
        }
        kini.push({ idx: i, blokAwal: mulai, blokAkhir: akhir, lanjutan, terpotong: akhir < jml });
        terpakai += isiSel + Math.max(dipakai, minimalKomponen);
        mulai = akhir;
        lanjutan = true;
        if (mulai < jml) halamanBaru();
      }
    });
    if (kini.length) hasil.push(kini);
    setHalaman(prev => (JSON.stringify(prev) === JSON.stringify(hasil) ? prev : hasil));
  }, [blok, entri, blokDari, zoom]);

  // Menata ulang saat naskah berubah — TAPI ditunda selama penyusun sedang
  // mengetik: baris yang pindah lembar akan dipasang ulang React dan kursornya
  // hilang. Penataan dijalankan lagi begitu editor kehilangan fokus.
  // `halaman` sengaja ikut jadi pemicu: pengukuran membaca DOM potongan yang
  // sedang dirender, jadi setelah pembagian berubah harus diukur ulang sampai
  // stabil (JSON-compare di setHalaman menghentikannya). `pasTata` membatasi
  // 5 pas per perubahan naskah — pengaman bila dua tata letak saling bergantian.
  useLayoutEffect(() => {
    if (pratinjauUrl) return;
    if (editorFokus.current) { tundaTata.current = true; return; }
    const kunci = `${pemicuTata}:${versiKanvas}`;
    if (tandaTata.current?.doc !== doc || tandaTata.current?.kunci !== kunci) {
      tandaTata.current = { doc, kunci };
      pasTata.current = 0;
    }
    if (pasTata.current >= 5) return;
    pasTata.current += 1;
    hitungHalaman();
  }, [doc, versiKanvas, pemicuTata, halaman, pratinjauUrl, hitungHalaman]);

  // Setelah Bookman Old Style termuat, minta penataan ulang SEKALI — lewat
  // pemicu yang melalui jalur terjaga (ditunda bila sedang mengetik). JANGAN
  // panggil hitungHalaman langsung di sini: identitasnya berganti tiap
  // perubahan naskah, sehingga efek ini ikut berjalan di tengah pengetikan
  // dan me-remount potongan (fokus hilang, halaman macet meluber).
  useEffect(() => {
    let batal = false;
    document.fonts?.ready?.then(() => { if (!batal) setPemicuTata(v => v + 1); }).catch(() => {});
    return () => { batal = true; };
  }, []);

  // Nomor & rentang gabung per kelompok — dihitung sekali, dipakai tiap lembar.
  const metaKelompok = useMemo(() => doc.sections.map(sec => hitungBaris(sec.items)), [doc]);

  /** Render satu POTONGAN baris pada sebuah lembar. Komponen yang uraiannya
   *  tidak muat akan tampil sebagai beberapa potongan di lembar berurutan. */
  const renderPotongan = (pot: Potongan) => {
    const e = entri[pot.idx];
    // Rentang halaman bisa basi sesaat setelah baris ditambah/dihapus (penataan
    // ulang berjalan pada layout-effect berikutnya) — jangan sampai crash.
    if (!e) return null;
    const sec = doc.sections[e.si];
    if (!sec) return null;

    if (e.tipe === 'sec') {
      return (
        <tr key={e.kunci} data-kunci={e.kunci} className="sp-sec">
          <td colSpan={3} style={{ position: 'relative' }}>
            <input value={sec.judul} disabled={isViewOnly}
              onChange={ev => ubahSection(sec.id, ev.target.value)} className="sp-input-polos" />
            {!isViewOnly && (
              <span className="sp-aksi-sec no-print absolute top-1 right-1 flex gap-1">
                <button onClick={() => sisipItem(sec.id, sec.items.length - 1)} title={`Tambah komponen di ${sec.judul || 'kelompok ini'}`}
                  className="p-1 rounded bg-white border border-teal-200 text-teal-600 hover:bg-teal-50 shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {doc.sections.length > 1 && (
                  <button onClick={() => hapusSection(sec.id)} title="Hapus kelompok ini beserta komponennya"
                    className="p-1 rounded bg-white border border-red-200 text-red-500 hover:bg-red-50 shadow-sm">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )}
          </td>
        </tr>
      );
    }

    const it = sec.items[e.ii];
    if (!it) return null;
    const { nomor, noSpan, kompSpan, uraianSpan } = metaKelompok[e.si][e.ii];
    const i = e.ii;
    // Tombol hanya pada potongan pertama baris terpilih — potongan lanjutan
    // (lembar berikutnya) cukup ikut tersorot.
    const terpilih = !isViewOnly && barisAktif === it.id && !pot.lanjutan;

    const bukaGabung = (pra?: 'no' | 'komponen') => setModalGabung({
      arah: i === 0 ? 'bawah' : 'atas',
      kolom: new Set([
        ...(it.gabungNo ? ['no'] : []),
        ...(it.gabungKomponen ? ['komponen'] : []),
        ...(it.gabungUraian ? ['uraian'] : []),
        ...(pra ? [pra] : []),
      ]),
    });

    // Ikon gabung kecil di pojok sel Nomor / Komponen (pra-centang kolomnya).
    const tombolGabungSel = (pra: 'no' | 'komponen', label: string) => (
      <button onClick={() => bukaGabung(pra)} title={`Gabungkan sel ${label} dengan baris di atas / bawah`}
        className="sp-gabung-sel no-print font-sans">
        <TableCellsMerge className="w-3 h-3" />
      </button>
    );

    // Bilah aksi horizontal di kanan baris — sengaja SATU BARIS ikon (tak lebih
    // tinggi dari barisnya) dan hanya pada baris terpilih, supaya tidak pernah
    // menindih baris lain seperti panel mengambang yang dulu.
    const ikonStrip = 'p-1.5 rounded-md text-slate-500 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-25 disabled:hover:bg-transparent transition-colors';
    const stripAksi = (
      <span className="sp-strip no-print font-sans">
        <button onClick={() => geserItem(sec.id, i, -1)} disabled={i === 0} title="Naikkan komponen" className={ikonStrip}><ChevronUp className="w-4 h-4" /></button>
        <button onClick={() => geserItem(sec.id, i, 1)} disabled={i === sec.items.length - 1} title="Turunkan komponen" className={ikonStrip}><ChevronDown className="w-4 h-4" /></button>
        <button onClick={() => sisipItem(sec.id, i)} title="Sisipkan baris baru di bawah baris ini" className={ikonStrip}><Plus className="w-4 h-4" /></button>
        <button onClick={() => { hapusItem(sec.id, it.id); setBarisAktif(null); }} title="Hapus baris ini"
          className={`${ikonStrip} text-red-500 hover:bg-red-50 hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
      </span>
    );
    // Strip menempel pada sel paling kanan yang masih dirender baris ini.
    const stripDi = uraianSpan > 0 ? 'uraian' : kompSpan > 0 ? 'komponen' : 'no';

    // Baris utuh (tidak terpotong) memakai HTML aslinya langsung — tanpa
    // memecah/menyusun ulang blok, supaya jalur umum tetap ringan & aman.
    const utuh = !pot.lanjutan && !pot.terpotong;
    const semuaBlok = utuh ? null : blokDari(it.uraian);
    const irisan = semuaBlok ? semuaBlok.slice(pot.blokAwal, pot.blokAkhir) : null;
    const nilaiUraian = utuh ? it.uraian : gabungUraian(irisan as BlokUraian[]);
    // Penomoran lembar lanjutan meneruskan angka sebelumnya.
    const butirSebelum = semuaBlok ? jumlahButir(semuaBlok.slice(0, pot.blokAwal)) : 0;

    const tulisBalik = (html: string) => {
      if (utuh) { ubahItem(sec.id, it.id, { uraian: html }); return; }
      const semua = blokDari(it.uraian);
      const baru = pecahUraian(html);
      const live = (rentangLive.current && rentangLive.current.item === it.id && rentangLive.current.awal === pot.blokAwal)
        ? rentangLive.current
        : { item: it.id, awal: pot.blokAwal, akhir: pot.blokAkhir };
      const gabung = [
        ...semua.slice(0, live.awal),
        ...baru,
        ...semua.slice(Math.min(live.akhir, semua.length)),
      ];
      // Setelah tersimpan, potongan ini "memiliki" blok sebanyak hasil ketikan.
      rentangLive.current = { item: it.id, awal: live.awal, akhir: live.awal + baru.length };
      ubahItem(sec.id, it.id, { uraian: gabungUraian(gabung) });
    };

    return (
      <tr key={`${e.kunci}-${pot.blokAwal}-${pot.blokAkhir === Infinity ? 'x' : pot.blokAkhir}`} data-kunci={e.kunci} data-baris={it.id}
        data-blok-awal={pot.blokAwal}
        // mousedown (bukan click) supaya baris terpilih lebih dulu daripada
        // fokus berpindah ke editor di dalamnya.
        onMouseDown={() => !isViewOnly && setBarisAktif(it.id)}
        className={`sp-baris ${isViewOnly ? '' : 'sp-baris-pilih'} ${barisAktif === it.id ? 'sp-baris-aktif' : ''}`}>
        {/* Potongan lanjutan menyisakan sel NO & KOMPONEN kosong — persis
            seperti komponen yang terbelah halaman pada naskah cetak. */}
        {noSpan > 0 && (
          <td className="sp-no" rowSpan={noSpan > 1 ? noSpan : undefined} style={{ position: 'relative' }}>
            {pot.lanjutan ? '' : `${nomor}.`}
            {terpilih && tombolGabungSel('no', 'Nomor')}
            {terpilih && stripDi === 'no' && stripAksi}
          </td>
        )}
        {kompSpan > 0 && (
          <td className="sp-komponen" rowSpan={kompSpan > 1 ? kompSpan : undefined} style={{ position: 'relative' }}>
            {pot.lanjutan ? null : (
              <AutoTextarea value={it.komponen} disabled={isViewOnly}
                onChange={v => ubahItem(sec.id, it.id, { komponen: v })}
                placeholder="Nama komponen" className="sp-input-polos" />
            )}
            {terpilih && tombolGabungSel('komponen', 'Komponen')}
            {terpilih && stripDi === 'komponen' && stripAksi}
          </td>
        )}
        {uraianSpan > 0 && (
          <td className="sp-uraian" rowSpan={uraianSpan > 1 ? uraianSpan : undefined}
            style={{ position: 'relative', ['--mulai' as string]: String(butirSebelum) }}>
            <RichText
              key={`${it.id}-${pot.blokAwal}-${pot.blokAkhir === Infinity ? 'x' : pot.blokAkhir}-${versiKanvas}`}
              value={nilaiUraian}
              disabled={isViewOnly}
              // Bekukan potongan lain dari baris yang sedang diketik — rentang
              // bloknya baru sah setelah penataan ulang saat editor blur.
              beku={!utuh && editorFokus.current?.dataset.item === it.id}
              onChange={tulisBalik}
              placeholder={pot.lanjutan ? 'Lanjutan uraian…' : undefined}
              onFokus={el => {
                if (el) { el.dataset.sec = sec.id; el.dataset.item = it.id; setBarisAktif(it.id); }
                editorFokus.current = el;
                if (!el) {
                  rentangLive.current = null;
                  if (tundaTata.current) { tundaTata.current = false; setPemicuTata(v => v + 1); }
                }
              }}
            />
            {terpilih && stripDi === 'uraian' && stripAksi}
            {!isViewOnly && utuh && uraianKosong(it.uraian) && contohIsiUntuk(it.komponen) && (
              <button onClick={() => ubahItem(sec.id, it.id, { uraian: contohIsiUntuk(it.komponen) })}
                title="Sisipkan contoh isi baku untuk komponen ini"
                className="sp-aksi-sec no-print absolute top-1 right-1 px-2 py-1 rounded-lg bg-white border border-teal-200 text-teal-700 text-[10px] font-bold flex items-center gap-1 shadow-sm hover:bg-teal-50">
                <Sparkles className="w-3 h-3" /> Contoh isi
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  const jumlahKomponen = useMemo(() => doc.sections.reduce((n, s) => n + s.items.length, 0), [doc]);
  const belumTerisi = useMemo(
    () => doc.sections.reduce((n, s) => n + s.items.filter(i => uraianKosong(i.uraian)).length, 0), [doc]);

  const tblKelas = 'px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-teal-500 bg-white border-slate-300 text-slate-800';
  const labelKelas = 'text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block';

  // ── Keterkaitan dokumen SOP / Proses Bisnis (panel properti) ────────────
  // Hasil HANYA muncul setelah pengguna mengetik: registri Dashboard berisi
  // ribuan dokumen, jadi menampilkan daftar bawaan tidak membantu — dan saat
  // kotak kosong server pun tidak dipanggil sama sekali.
  const jalankanPencarian = useCallback((kind: 'sop' | 'bpmn', kunci: string) => {
    if (!panelInfo || !bolehKeterkaitan || !cariDokumenTerkait) return undefined;
    const q = kunci.trim();
    if (!q) {
      setKandidatTautan(k => (k[kind].length ? { ...k, [kind]: [] } : k));
      setMemuatKandidat(m => (m[kind] ? { ...m, [kind]: false } : m));
      return undefined;
    }
    let batal = false;
    setMemuatKandidat(m => ({ ...m, [kind]: true }));
    const jeda = setTimeout(() => {
      cariDokumenTerkait(kind, q)
        .then(hasil => { if (!batal) setKandidatTautan(k => ({ ...k, [kind]: hasil })); })
        .catch(() => { if (!batal) setKandidatTautan(k => ({ ...k, [kind]: [] })); })
        .finally(() => { if (!batal) setMemuatKandidat(m => ({ ...m, [kind]: false })); });
    }, 300);
    return () => { batal = true; clearTimeout(jeda); };
  }, [panelInfo, bolehKeterkaitan, cariDokumenTerkait]);

  useEffect(() => jalankanPencarian('sop', cariTautan.sop), [jalankanPencarian, cariTautan.sop]);
  useEffect(() => jalankanPencarian('bpmn', cariTautan.bpmn), [jalankanPencarian, cariTautan.bpmn]);

  const daftarTautan = doc.tautan || [];
  // Nomor dokumen registri dan naskah studio berasal dari tabel berbeda, jadi
  // pembanding WAJIB menyertakan `sumber` — kalau tidak, dua dokumen berbeda
  // dengan id kebetulan sama akan dianggap satu.
  const tambahTautan = (t: TautanDok) => setDoc(d => {
    const ada = (d.tautan || []).some(x => kunciTautan(x) === kunciTautan(t));
    return ada ? d : { ...d, tautan: [...(d.tautan || []), t] };
  });
  const hapusTautan = (t: TautanDok) =>
    setDoc(d => ({ ...d, tautan: (d.tautan || []).filter(x => kunciTautan(x) !== kunciTautan(t)) }));
  // Dokumen registri (Dashboard) dibuka lewat tautan berkasnya; naskah studio
  // dibuka di studionya sendiri dalam mode hanya-lihat.
  const bukaTautan = (t: TautanDok) => {
    if (t.sumber === 'registri') {
      if (t.link) window.open(t.link, '_blank', 'noopener');
      return;
    }
    window.open(`/e-sop-atrbpn/${t.kind === 'sop' ? 'sop' : 'bpmn'}/studio?id=${t.id}&mode=view`, '_blank');
  };
  const bisaDibuka = (t: TautanDok) => t.sumber !== 'registri' || !!t.link;
  const kunciTautan = (t: TautanDok) => `${t.sumber || 'studio'}:${t.kind}:${t.id}`;

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-auto bg-slate-200 flex flex-col items-center p-3 sm:p-5 gap-4">
      <style>{`
        /* Kanvas naskah — nilai di sini WAJIB sama dengan api/spDocument.js. */
        .sp-paper {
          width: ${SP_PAGE.w}mm; min-height: ${SP_PAGE.h}mm;
          padding: ${SP_PAGE.mTop}mm ${SP_PAGE.mRight}mm ${SP_PAGE.mBottom}mm ${SP_PAGE.mLeft}mm;
          background: #fff; color: #000; position: relative;
          font-family: ${SP_PAGE.fontStack}; font-size: ${SP_PAGE.fontSize};
          /* 1.2 persis — BUKAN 'normal' — agar tinggi baris kanvas identik
             dengan renderer PDF (pemenggalan halamannya harus sama titik). */
          line-height: 1.2;
        }
        /* Garis bantu batas halaman: tinggi isi tiap halaman F4 = 285 mm. */
        /* Nomor lembar — hanya penanda di layar, tidak ikut tercetak.
           Hurufnya mengikuti naskah (Bookman Old Style) agar menyatu dengan lembar. */
        /* Tahan margin bawah anak agar terhitung dalam tinggi blok judul —
           cermin [data-kepala-naskah] di renderer PDF. */
        [data-blok-judul] { display: flow-root; }
        .sp-nomor-hal {
          position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center;
          font-family: ${SP_PAGE.fontStack}; font-size: 9pt;
          letter-spacing: .02em; color: #94a3b8;
        }
        .sp-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .sp-table th, .sp-table td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top; text-align: left; }
        /* Tanpa cetak tebal bawaan — sama dengan renderer PDF/DOCX. Hanya isi
           uraian yang boleh ditebalkan penyusun lewat tombol Format. */
        .sp-table thead th { text-align: center; font-weight: normal; }
        .sp-no { width: ${SP_COL.no}mm; text-align: center; }
        /* Panel aksi diposisikan terhadap BARIS, supaya tetap muncul walau sel
           NO/KOMPONEN baris itu menyatu ke baris di atasnya. */
        .sp-komponen { width: ${SP_COL.komponen}mm; }
        .sp-uraian { width: ${SP_COL.uraian}mm; }
        /* min-height = SATU baris teks (bukan 6mm): tinggi baris kanvas harus
           sama dengan sel PDF agar titik pemenggalan halamannya identik. */
        .sp-editable { outline: none; min-height: 1.2em; }
        .sp-bisa-edit:hover { background: rgba(13,148,136,.05); }
        .sp-bisa-edit:focus { background: rgba(13,148,136,.08); box-shadow: inset 0 0 0 1px rgba(13,148,136,.45); }
        .sp-kosong.sp-bisa-edit::before {
          content: attr(data-placeholder); color: #a3adba; font-style: italic; pointer-events: none;
        }
        /* Daftar bernomor bertingkat gaya naskah dinas: 1. → a. → 1) */
        .sp-editable p { margin: 0; text-align: justify; }
        .sp-editable ol, .sp-editable ul { margin: 0; padding: 0; list-style: none; counter-reset: butir; }
        /* Lembar lanjutan meneruskan angka lembar sebelumnya — hanya daftar
           PERTAMA potongan (yang memang terbelah) yang melanjut; daftar lain
           dan sub-daftar tetap mulai dari awal (a., 1)). */
        .sp-editable > ol:first-child { counter-reset: butir var(--mulai, 0); }
        .sp-editable li { position: relative; padding-left: 7mm; margin: 0; text-align: justify; }
        .sp-editable ol > li::before { counter-increment: butir; content: counter(butir) "."; position: absolute; left: 0; }
        .sp-editable ol ol > li::before { content: counter(butir, lower-alpha) "."; }
        .sp-editable ol ol ol > li::before { content: counter(butir) ")"; }
        .sp-editable ul > li::before { content: "\\2022"; position: absolute; left: 1.5mm; }
        /* Tiap tingkat menjorok ke kanan — sama dengan renderer PDF/DOCX. */
        .sp-editable ol ol, .sp-editable ol ul, .sp-editable ul ol, .sp-editable ul ul { padding-left: 7mm; }
        .sp-input-polos {
          width: 100%; border: 0; outline: none; background: transparent; resize: none; overflow: hidden;
          font: inherit; line-height: inherit; color: inherit; padding: 0; display: block;
        }
        /* <input> punya tinggi intrinsik lebih dari satu baris — kunci ke satu
           baris supaya baris judul kelompok setinggi baris PDF-nya. */
        input.sp-input-polos { height: 1.2em; }
        .sp-input-polos:hover:not(:disabled) { background: rgba(13,148,136,.05); }
        .sp-input-polos:focus { background: rgba(13,148,136,.08); box-shadow: inset 0 0 0 1px rgba(13,148,136,.45); }
        /* Tombol aksi baris TIDAK lagi mengambang di atas kanvas: panelnya
           menindih tabel, melawan zoom, dan sulit dijangkau. Sekarang muncul
           sebagai bilah kontekstual di bawah bilah alat, yang ikut melipat
           mengikuti lebar layar. Kanvas hanya menyorot baris terpilih. */
        .sp-baris-pilih:hover > td { background: rgba(13,148,136,.04); cursor: pointer; }
        .sp-baris-aktif > td { background: rgba(13,148,136,.08); box-shadow: inset 0 0 0 1px rgba(13,148,136,.35); }
        /* Aksi kelompok tetap berbasis hover — letaknya di dalam barisnya sendiri
           sehingga tidak pernah menabrak baris lain. */
        /* Bilah aksi di samping kanan baris terpilih — horizontal (setinggi
           satu baris ikon) supaya tidak menindih baris di bawahnya. */
        .sp-strip {
          position: absolute; left: calc(100% + 8px); top: 0; z-index: 20;
          display: flex; align-items: center; gap: 2px; padding: 2px;
          background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
          box-shadow: 0 4px 10px rgba(15,23,42,.12); white-space: nowrap;
        }
        /* Ikon gabung kecil di pojok sel Nomor / Komponen baris terpilih. */
        .sp-gabung-sel {
          position: absolute; top: 2px; right: 2px; z-index: 20;
          display: flex; align-items: center; justify-content: center;
          width: 18px; height: 18px; border-radius: 6px;
          background: #0d9488; color: #fff; box-shadow: 0 2px 6px rgba(13,148,136,.4);
        }
        .sp-gabung-sel:hover { background: #0f766e; }
        .sp-aksi-sec { opacity: 0; transition: opacity .12s; }
        tr:hover .sp-aksi-sec, .sp-aksi-sec:focus-within { opacity: 1; }
        @media print { .no-print { display: none !important; } .sp-guides { display: none !important; } }
      `}</style>

      {/* ── Bilah alat ───────────────────────────────────────────────────── */}
      <div data-bilah-alat className="w-full max-w-[220mm] bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-col gap-3 sticky top-0 z-40 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onBack} title="Kembali ke daftar Standar Pelayanan"
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold flex items-center gap-1.5 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {!isViewOnly && (
            <div className="flex items-center rounded-xl border border-slate-200">
              <button onClick={urungkan} disabled={!bisaUrung} title="Urungkan (Ctrl+Z)"
                className="p-2 rounded-l-xl text-slate-600 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <Undo2 className="w-4 h-4" />
              </button>
              <button onClick={ulangi} disabled={!bisaUlang} title="Ulangi (Ctrl+Y)"
                className="p-2 rounded-r-xl text-slate-600 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {!isViewOnly && (
            <button onClick={() => setModalSimpan(true)} disabled={saving}
              title="Simpan naskah — pilih simpan sebagai draft atau sekaligus kirim ke Biro Ortala MR"
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
            </button>
          )}

          <button onClick={() => (pratinjauUrl ? tutupPratinjau() : bukaPratinjau())} disabled={memuatPratinjau}
            title="Lihat naskah sebagai halaman F4 terpisah, persis seperti hasil cetak"
            className={`px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${pratinjauUrl ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {memuatPratinjau ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            {pratinjauUrl ? 'Tutup Pratinjau' : 'Pratinjau Halaman'}
          </button>

          <button onClick={() => setPanelInfo(v => !v)}
            title="Panel properti dokumen: identitas naskah & integrasi SOP/Proses Bisnis"
            className={`px-3 py-2 rounded-xl border text-sm font-bold flex items-center gap-1.5 transition-colors ${panelInfo ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <FileText className="w-4 h-4" /> Edit Info
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Ekspor PDF & Word pindah ke dalam modal Simpan (pola Proses Bisnis). */}
          {isViewOnly && (<>
            <button onClick={() => unduh('pdf')} disabled={!!sibuk}
              className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors">
              {sibuk === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
            </button>
            <button onClick={() => unduh('docx')} disabled={!!sibuk}
              className="px-3 py-2 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors">
              {sibuk === 'docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Word
            </button>
          </>)}
          {!isViewOnly && (
            <button onClick={() => inputBerkas.current?.click()} disabled={!!sibuk}
              title="Ambil naskah dari berkas Word (.docx) yang sudah ada"
              className="px-3 py-2 rounded-xl border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors">
              {sibuk === 'impor' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} Impor Word
            </button>
          )}
          <input ref={inputBerkas} type="file" accept=".docx" className="hidden" onChange={pilihBerkas} />

          {toolbarExtra && <div className="ml-auto flex items-center gap-2">{toolbarExtra}</div>}
        </div>

        {/* Format uraian + ringkasan */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <div className="flex items-center rounded-xl border border-slate-200">
            {tombolFormat(Bold, 'bold', 'Tebal (Ctrl+B)')}
            {tombolFormat(Italic, 'italic', 'Miring (Ctrl+I)')}
            {tombolFormat(Underline, 'underline', 'Garis bawah (Ctrl+U)')}
            <div className="w-px h-5 bg-slate-200" />
            {tombolFormat(ListOrdered, 'insertOrderedList', 'Daftar bernomor — tingkat 1 = 1., tingkat 2 = a., tingkat 3 = 1)')}
            {tombolFormat(List, 'insertUnorderedList', 'Daftar butir')}
            <div className="w-px h-5 bg-slate-200" />
            {tombolFormat(IndentIncrease, 'indent', 'Turunkan tingkat daftar: 1. → a. → 1)  (Tab)')}
            {tombolFormat(IndentDecrease, 'outdent', 'Naikkan tingkat daftar: 1) → a. → 1.  (Shift+Tab)')}
          </div>
          {/* Petunjuk boleh menyusut/terpotong; pencacah komponen TIDAK — ia
              yang harus tetap sebaris dengan bilah Format Uraian. */}
          <span className="hidden xl:block min-w-0 flex-1 truncate text-[11px] text-slate-400"
            title="Buat daftar bernomor lalu tekan Tab untuk turun tingkat (1. → a. → 1)), Shift+Tab untuk naik.">
            Bertingkat: <b className="text-slate-500">Tab</b> turun tingkat (1. → a. → 1)), <b className="text-slate-500">Shift+Tab</b> naik.
          </span>
          <span className="ml-auto shrink-0 text-[11px] font-bold text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <Layers className="w-3.5 h-3.5" /> {jumlahKomponen} komponen
            {belumTerisi > 0 && <span className="text-amber-600">· {belumTerisi} belum terisi</span>}
          </span>
        </div>

        {/* ── Baris ketiga: konteks baris terpilih (kiri) + skala kanvas (kanan).
               Selalu tampil supaya kendali perbesar/perkecil tidak ikut hilang
               saat tak ada baris yang dipilih. ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2 text-slate-600">
          {!isViewOnly && barisTerpilih ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-700 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
              <span className="truncate">Baris {barisTerpilih.i + 1} dipilih — tombol aksi di samping kanan barisnya; ikon gabung di sel Nomor &amp; Komponen.</span>
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 truncate min-w-0">
              {isViewOnly ? 'Mode hanya lihat — naskah tidak dapat diubah.' : 'Klik satu baris untuk memindahkan, menyisipkan, menghapus, atau menggabung selnya.'}
            </span>
          )}

          <div className="ml-auto shrink-0 flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
            <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Perkecil tampilan"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition-colors"><ZoomOut className="w-4 h-4" /></button>
            <span className="text-[11px] font-bold text-slate-500 w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(2)))} title="Perbesar tampilan"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition-colors"><ZoomIn className="w-4 h-4" /></button>
          </div>
        </div>

        {pesan && (
          <div className={`text-xs font-semibold rounded-xl px-3 py-2 border ${pesan.tone === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700'}`}>
            {pesan.teks}
          </div>
        )}
      </div>

      {/* ── Pratinjau halaman: PDF hasil render, tiap halaman F4 terpisah ── */}
      {pratinjauUrl && (
        <div className="w-full max-w-[220mm] flex flex-col gap-2">
          <div className="flex items-start gap-2 text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-xl p-2.5 no-print">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Inilah tata letak akhirnya: tiap halaman <b>F4 {SP_PAGE.w}×{SP_PAGE.h} mm</b> terpisah dan kepala tabel
              (NO · KOMPONEN · URAIAN) berulang di setiap halaman. Tekan <b>Tutup Pratinjau</b> untuk kembali menyunting.
            </span>
          </div>
          {/* Dirender pdf.js ke kanvas beresolusi layar — pas lebar dan tetap
              tajam di semua peramban (penampil PDF tersemat tiap peramban
              berbeda perilaku zoom-nya). */}
          <div className="w-full overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-lg" style={{ height: '75vh' }}>
            <PratinjauPdf url={pratinjauUrl} className="p-3" />
          </div>
        </div>
      )}

      {/* ── Kanvas naskah: LEMBAR F4 TERPISAH ─────────────────────────────
             Isi dialirkan otomatis; begitu satu lembar penuh, sisanya pindah ke
             lembar berikutnya dengan kepala tabel diulang (Repeat Header Row) —
             pola yang sama dengan kanvas Cover SOP. ────────────────────────── */}
      <div className={`w-full flex justify-center ${pratinjauUrl ? 'hidden' : ''}`} onMouseDown={lepasPilihanBila}>
        <div ref={kertasRef} style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          className="flex flex-col items-center gap-6">
          {halamanTampil.map((idxHalaman, hal) => (
            <div key={hal} className="sp-paper shadow-2xl border border-slate-300">
              {hal === 0 && (
                <div data-blok-judul>
                  {doc.lampiran && (
                    <div style={{ width: '50%', marginLeft: '50%', marginBottom: '4mm', whiteSpace: 'pre-wrap' }}>{doc.lampiran}</div>
                  )}
                  {(doc.nomor || doc.tanggal) && (
                    <div style={{ marginLeft: '50%', marginBottom: '6mm' }}>
                      <div>Nomor&nbsp;&nbsp;&nbsp;: {doc.nomor}</div>
                      <div>Tanggal : {doc.tanggal}</div>
                    </div>
                  )}
                  {doc.instansi && (
                    <div style={{ textAlign: 'center', marginBottom: '6mm', whiteSpace: 'pre-wrap', lineHeight: 1.35 }}>{doc.instansi}</div>
                  )}
                  <div style={{ display: 'flex', marginBottom: '4mm' }}>
                    <span style={{ width: '38mm' }}>Nama Pelayanan</span>
                    <span style={{ width: '4mm' }}>:</span>
                    <span style={{ flex: 1 }}>{doc.judul || <span className="text-slate-400 italic">(belum diisi)</span>}</span>
                  </div>
                </div>
              )}

              <table className="sp-table">
                <thead>
                  <tr>
                    <th style={{ width: `${SP_COL.no}mm` }}>NO</th>
                    <th style={{ width: `${SP_COL.komponen}mm` }}>KOMPONEN</th>
                    <th style={{ width: `${SP_COL.uraian}mm` }}>URAIAN</th>
                  </tr>
                </thead>
                <tbody>{idxHalaman.map(pot => renderPotongan(pot))}</tbody>
              </table>

              <div className="sp-nomor-hal no-print">Halaman {hal + 1} dari {halamanTampil.length}</div>
            </div>
          ))}

          {!isViewOnly && (
            <div className="no-print font-sans w-full" style={{ maxWidth: `${SP_PAGE.w}mm` }}>
              <button onClick={tambahSection}
                className="text-[11px] font-bold text-slate-500 hover:text-teal-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Tambah kelompok komponen (mis. Peringatan / Keterangan)
              </button>
              <p className="text-[10px] text-slate-400 mt-1">
                Komponen tambahan yang lazim: {KOMPONEN_TAMBAHAN.join(' · ')}.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="h-16 shrink-0" aria-hidden />

      {/* ── Panel Properti (kanan): identitas naskah + integrasi dokumen ──
             Menggantikan modal "Edit Info". Di layar lebar panel menempel di
             kanan tanpa penutup gelap sehingga kanvas tetap bisa disunting;
             di layar sempit ia menjadi laci dengan penutup. ─────────────── */}
      {panelInfo && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] xl:hidden no-print" onClick={() => setPanelInfo(false)} />
          <aside className="fixed right-0 top-16 bottom-0 z-50 w-87.5 max-w-[92vw] bg-white border-l border-slate-200 shadow-2xl flex flex-col no-print font-sans">
            <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" /> Properti Dokumen
              </h3>
              <button onClick={() => setPanelInfo(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Identitas naskah */}
              <div className="space-y-3">
                <div>
                  <label className={labelKelas}>Nama Pelayanan *</label>
                  <input value={doc.judul} disabled={isViewOnly}
                    onChange={e => setDoc(d => ({ ...d, judul: e.target.value }))}
                    placeholder="mis. Pemberian Peta Analisis Penatagunaan Tanah"
                    className={`${tblKelas} w-full font-bold`} />
                </div>
                <div>
                  <label className={labelKelas}>Klasifikasi SP</label>
                  <select value={doc.klasifikasi} disabled={isViewOnly}
                    onChange={e => setDoc(d => ({ ...d, klasifikasi: e.target.value }))}
                    className={`${tblKelas} w-full`}>
                    <option value="">-- Pilih Klasifikasi --</option>
                    {KLASIFIKASI_SP.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelKelas}>Unit Kerja</label>
                  <input value={doc.unitKerja} disabled className={`${tblKelas} w-full opacity-70`}
                    placeholder="(mengikuti data dokumen)" />
                </div>
              </div>

              {/* Keterkaitan dokumen SOP / Proses Bisnis — semua peran penyusun */}
              {bolehKeterkaitan && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-teal-600" /> Keterkaitan Dokumen
                  </p>
                  <p className="text-[11px] text-slate-400 leading-snug mb-3">
                    Kaitkan SP ini dengan dokumen <b>SOP</b> atau <b>Proses Bisnis</b> — termasuk seluruh dokumen
                    yang tercatat di <b>Dashboard</b>. Keterkaitan tersimpan bersama naskah (tidak ikut tercetak).
                  </p>
                  {(['sop', 'bpmn'] as const).map(kind => {
                    const label = kind === 'sop' ? 'SOP' : 'Proses Bisnis';
                    const terpaut = daftarTautan.filter(t => t.kind === kind);
                    const q = cariTautan[kind].trim();
                    // Penyaringan & pembatasan dilakukan server; di sini cukup
                    // membuang yang sudah terkait.
                    const hasil = kandidatTautan[kind]
                      .filter(k => !terpaut.some(t => kunciTautan(t) === kunciTautan(k)));
                    const sedangCari = memuatKandidat[kind];
                    return (
                      <div key={kind} className="mb-4">
                        <p className="text-[11px] font-bold text-slate-600 mb-1.5">{label}</p>
                        {terpaut.length === 0 && (
                          <p className="text-[11px] text-slate-300 italic mb-1.5">Belum ada {label} terkait.</p>
                        )}
                        {terpaut.map(t => (
                          <div key={kunciTautan(t)} className="flex items-center gap-1.5 mb-1.5 rounded-xl border border-teal-200 bg-teal-50/60 px-2.5 py-2">
                            {/* Judul MELIPAT (bukan dipotong titik-titik) supaya
                                penyusun bisa membaca nama dokumen selengkapnya. */}
                            <span className="min-w-0 flex-1">
                              <button onClick={() => bukaTautan(t)} disabled={!bisaDibuka(t)}
                                title={bisaDibuka(t) ? `Buka ${label} di tab baru` : 'Dokumen ini belum punya tautan berkas'}
                                className="w-full text-left text-[11px] font-bold text-teal-800 leading-snug wrap-break-word enabled:hover:underline disabled:cursor-default">
                                {t.judul || `${label} #${t.id}`}
                              </button>
                              <span className="block text-[10px] text-teal-600/80 mt-0.5 wrap-break-word">
                                {t.sumber === 'registri' ? 'Dashboard' : 'Naskah studio'}
                                {t.tahun ? ` · ${t.tahun}` : ''}{t.unit ? ` · ${t.unit}` : ''}
                              </span>
                            </span>
                            {bisaDibuka(t) && (
                              <button onClick={() => bukaTautan(t)} title="Buka di tab baru"
                                className="p-1 rounded-md text-teal-600 hover:bg-teal-100 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></button>
                            )}
                            {!isViewOnly && (
                              <button onClick={() => hapusTautan(t)} title="Lepas keterkaitan"
                                className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        ))}
                        {!isViewOnly && (
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input value={cariTautan[kind]} placeholder={`Ketik untuk mencari ${label}…`}
                              onChange={e => setCariTautan(c => ({ ...c, [kind]: e.target.value }))}
                              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-[11px] outline-none focus:ring-2 focus:ring-teal-500 bg-white text-slate-700" />
                          </div>
                        )}
                        {!isViewOnly && sedangCari && (
                          <p className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Mencari…</p>
                        )}
                        {!isViewOnly && !!q && !sedangCari && (
                          hasil.length ? (
                            <div className="mt-1.5 rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-72 overflow-y-auto">
                              {hasil.map(k => (
                                <button key={kunciTautan(k)} title={k.judul}
                                  onClick={() => { tambahTautan(k); setCariTautan(c => ({ ...c, [kind]: '' })); }}
                                  className="w-full text-left px-2.5 py-2 hover:bg-teal-50 group flex items-start gap-1.5">
                                  <Plus className="w-3 h-3 text-teal-600 shrink-0 mt-0.5" />
                                  {/* Nama dokumen ditampilkan UTUH (melipat) — nama SOP/Probis
                                      kerap panjang, dan dipotong titik-titik membuatnya sulit dibedakan. */}
                                  <span className="min-w-0">
                                    <span className="block text-[11px] leading-snug text-slate-600 group-hover:text-teal-800 wrap-break-word">{k.judul}</span>
                                    <span className="block text-[10px] text-slate-400 mt-0.5 wrap-break-word">
                                      {k.sumber === 'registri' ? 'Dashboard' : 'Naskah studio'}
                                      {k.tahun ? ` · ${k.tahun}` : ''}{k.unit ? ` · ${k.unit}` : ''}
                                    </span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1.5 text-[11px] text-slate-400 italic">
                              Tidak ada {label} yang cocok dengan &ldquo;{q}&rdquo;.
                            </p>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Spesifikasi kertas */}
              <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <Info className="w-4 h-4 shrink-0 text-teal-600 mt-px" />
                <span>
                  Kertas <b>F4 potret {SP_PAGE.w}×{SP_PAGE.h} mm</b>, margin atas {SP_PAGE.mTop / 10} · kiri {SP_PAGE.mLeft / 10} · bawah {SP_PAGE.mBottom / 10} · kanan {SP_PAGE.mRight / 10} cm,
                  huruf <b>Bookman Old Style 12</b>, spasi baris <b>1 (single)</b> tanpa jarak antar-paragraf.
                </span>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ── Popup Gabung Sel: pilih pasangan baris + kolom yang disatukan ── */}
      {modalGabung && barisTerpilih && (() => {
        const { sec, i } = barisTerpilih;
        const { arah, kolom } = modalGabung;
        const pasangan = arah === 'atas' ? [i - 1, i] : [i, i + 1];
        const sahArah = (a: 'atas' | 'bawah') => a === 'atas' ? i > 0 : i + 1 < sec.items.length;
        const namaBaris = (k: number) => sec.items[k] ? `Baris ${k + 1}${sec.items[k].komponen ? ` · ${sec.items[k].komponen}` : ''}` : '—';
        const KOLOM = [
          { id: 'no', label: 'Nomor', ket: 'Baris bawah kehilangan nomornya; nomor di bawahnya menyesuaikan.' },
          { id: 'komponen', label: 'Komponen', ket: 'Satu nama komponen dipakai bersama kedua baris.' },
          { id: 'uraian', label: 'Uraian', ket: 'Satu uraian dipakai bersama kedua baris.' },
        ];
        // Minimal satu kolom harus tetap terpisah, kalau tidak barisnya lenyap.
        const semuaTergabung = kolom.size === 3;
        const alih = (id: string) => setModalGabung(m => {
          if (!m) return m;
          const baru = new Set(m.kolom);
          if (baru.has(id)) baru.delete(id); else baru.add(id);
          return { ...m, kolom: baru };
        });
        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 no-print font-sans"
            onClick={() => setModalGabung(null)}>
            <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <TableCellsMerge className="w-5 h-5 text-teal-600" /> Gabungkan Sel
                </h3>
                <button onClick={() => setModalGabung(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Dua baris yang digabung</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['atas', 'bawah'] as const).map(a => (
                      <button key={a} onClick={() => setModalGabung(m => m && { ...m, arah: a })} disabled={!sahArah(a)}
                        className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${arah === a ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {a === 'atas' ? 'Dengan baris di atas' : 'Dengan baris di bawah'}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 space-y-0.5">
                    <p className="truncate">{namaBaris(pasangan[0])}</p>
                    <p className="truncate">{namaBaris(pasangan[1])}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Kolom yang disatukan</p>
                  <div className="space-y-1.5">
                    {KOLOM.map(k => {
                      const pilih = kolom.has(k.id);
                      return (
                        <button key={k.id} onClick={() => alih(k.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex items-start gap-2.5 ${pilih ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <span className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${pilih ? 'bg-teal-600 border-teal-600' : 'border-slate-300'}`}>
                            {pilih && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className="min-w-0">
                            <span className={`block text-xs font-bold ${pilih ? 'text-teal-800' : 'text-slate-700'}`}>{k.label}</span>
                            <span className="block text-[11px] text-slate-400 leading-snug">{k.ket}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {semuaTergabung && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      Minimal satu kolom harus tetap terpisah — kalau ketiganya digabung, baris bawah tidak menyisakan sel apa pun.
                    </p>
                  )}
                  {kolom.size === 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">Tidak ada kolom terpilih — menerapkan ini akan <b>memisahkan kembali</b> seluruh sel pasangan baris tersebut.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
                <button onClick={() => setModalGabung(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold">Batal</button>
                <button onClick={() => { terapkanGabung(sec.id, barisTerpilih.it.id, arah, kolom); setModalGabung(null); }}
                  disabled={semuaTergabung}
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold">
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modal Simpan: kiri ekspor berkas, kanan simpan ke server —
             susunan yang sama dengan studio Proses Bisnis. ─────────────── */}
      {modalSimpan && (
        <div className="fixed inset-0 z-60 flex items-start sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-4">
              <h3 className="text-xl font-bold text-[#002855]">Simpan Dokumen Standar Pelayanan</h3>
              <button onClick={() => setModalSimpan(false)} className="p-2.5 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Ekspor Berkas</p>
                  <p className="text-xs text-slate-400">Unduh naskah ke komputer Anda.</p>
                </div>
                <button onClick={() => unduh('pdf')} disabled={!!sibuk}
                  className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl flex items-center justify-center gap-2 border border-red-200 transition-colors shadow-sm disabled:opacity-60">
                  {sibuk === 'pdf' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />} Format PDF (F4)
                </button>
                <button onClick={() => unduh('docx')} disabled={!!sibuk}
                  className="w-full px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-2 border border-blue-200 transition-colors shadow-sm disabled:opacity-60">
                  {sibuk === 'docx' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />} Format Word (.docx)
                </button>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Keduanya memakai kertas F4 {SP_PAGE.w}×{SP_PAGE.h} mm, huruf Bookman Old Style 12, dan kepala tabel
                  yang berulang di tiap halaman. Berkas Word dapat disunting kembali lalu diimpor lewat <b>Impor Word</b>.
                </p>
              </div>

              <div className="space-y-4 flex flex-col md:border-l md:border-slate-200 md:pl-8">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Simpan ke Server</p>
                  <p className="text-xs text-slate-400">Pilih tindakan untuk sistem.</p>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm">
                  <p className="font-bold text-[#002855] mb-1 truncate">{doc.judul || '(Nama Pelayanan belum diisi)'}</p>
                  <div className="flex items-center text-xs mt-2">
                    <span className="text-slate-500">Status Sistem:</span>
                    <span className="ml-2 px-2 py-0.5 rounded uppercase font-bold border bg-slate-200 text-slate-700 border-slate-300">
                      {statusDokumen || 'BELUM TERSIMPAN'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    {jumlahKomponen} komponen{belumTerisi > 0 ? ` · ${belumTerisi} belum terisi` : ' · semua terisi'}
                  </p>
                </div>
                <div className="flex flex-col gap-3 mt-auto">
                  <button onClick={() => { setModalSimpan(false); onSave(dataJson()); }} disabled={saving}
                    className="w-full px-4 py-3 bg-teal-100 hover:bg-teal-200 text-teal-800 font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    <Save size={18} /> Simpan sebagai Draft
                  </button>
                  <button onClick={() => { setModalSimpan(false); setKonfirmKirim(true); }} disabled={saving}
                    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                    <Send size={18} className="shrink-0" />
                    {/* Dipenggal tetap agar tidak melipat di tempat yang janggal. */}
                    <span className="text-center leading-tight">Simpan &amp; Kirim<br />ke Biro Ortala MR</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-right">
              <button onClick={() => setModalSimpan(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Batal</button>
            </div>
          </div>
        </div>
      )}

      {konfirmKirim && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Send size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Ajukan ke Biro Ortala MR?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Naskah Standar Pelayanan ini akan disimpan lalu <b>dikirim ke Biro Ortala MR</b> untuk ditinjau.
                  {belumTerisi > 0 && <> Saat ini masih ada <b>{belumTerisi} komponen yang belum terisi</b>.</>}
                </p>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setKonfirmKirim(false); setModalSimpan(true); }}
                className="px-5 py-2.5 text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
              <button onClick={() => { setKonfirmKirim(false); onSubmit(dataJson()); }}
                className="px-6 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95">
                <Send size={16} /> Ya, Ajukan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default SPBuilder;
export { SEC_SERVICE, SEC_MANUFACTURING };
