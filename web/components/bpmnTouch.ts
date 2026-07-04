// Dukungan layar sentuh untuk bpmn-js (tablet/iPad/laptop touur).
//
// Masalah: diagram-js 14 memulai drag dari event `mousedown`. Pada perangkat sentuh,
// gerakan jari (touchmove) TIDAK menghasilkan mousedown/mousemove, sehingga menarik/
// menggeser elemen tidak berfungsi. Selain itu tanpa `touch-action: none`, browser
// merebut gestur untuk scroll/zoom halaman.
//
// Solusi: terjemahkan event sentuh → event mouse sintetis yang dikonsumsi diagram-js:
//   touchstart → mousedown, touchmove → mousemove, touchend → mouseup (+ click / dblclick
//   untuk tap & double-tap). Gestur satu jari saja; multi-jari dilewati (mis. cubit).
//
// Pakai: enableTouchInteraction(container) di editor & viewer; panggil fungsi cleanup
// yang dikembalikan saat unmount. Juga set `touch-action: none` pada container (dilakukan
// oleh CSS komponen).

const TAP_MOVE_TOL = 10;   // px — gerak di bawah ini dianggap tap (bukan drag)
const DBLTAP_MS = 320;     // jeda maksimum antar tap untuk dianggap double-tap

function dispatchMouse(type: string, x: number, y: number, fallback: HTMLElement, detail = 0) {
  // Fallback ke container agar mouseup/mousemove SELALU terkirim (mengakhiri drag),
  // meski elementFromPoint null (mis. jari lepas di luar area).
  const target = document.elementFromPoint(x, y) || fallback;
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    detail,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: type === 'mouseup' || type === 'click' || type === 'dblclick' ? 0 : 1,
  });
  target.dispatchEvent(ev);
}

export function enableTouchInteraction(container: HTMLElement): () => void {
  let active = false;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) { active = false; return; } // biarkan multi-jari
    const t = e.touches[0];
    active = true;
    moved = false;
    startX = t.clientX;
    startY = t.clientY;
    dispatchMouse('mousedown', t.clientX, t.clientY, container);
    e.preventDefault(); // cegah compat-mouse ganda & scroll
  };

  const onMove = (e: TouchEvent) => {
    if (!active || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > TAP_MOVE_TOL || Math.abs(t.clientY - startY) > TAP_MOVE_TOL) {
      moved = true;
    }
    dispatchMouse('mousemove', t.clientX, t.clientY, container);
    e.preventDefault();
  };

  const onEnd = (e: TouchEvent) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const x = t ? t.clientX : startX;
    const y = t ? t.clientY : startY;
    // mouseup WAJIB terkirim agar diagram-js mengakhiri drag & siap drag berikutnya.
    dispatchMouse('mouseup', x, y, container);

    if (!moved) {
      dispatchMouse('click', x, y, container, 1); // tap → seleksi / context-pad
      const now = Date.now();
      if (now - lastTapTime < DBLTAP_MS &&
          Math.abs(x - lastTapX) < TAP_MOVE_TOL &&
          Math.abs(y - lastTapY) < TAP_MOVE_TOL) {
        dispatchMouse('dblclick', x, y, container, 2); // double-tap → edit label
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = x;
        lastTapY = y;
      }
    }
    e.preventDefault();
  };

  const onCancel = () => {
    if (!active) return;
    active = false;
    dispatchMouse('mouseup', startX, startY, container); // pastikan drag berakhir
  };

  const opts = { passive: false } as AddEventListenerOptions;
  container.addEventListener('touchstart', onStart, opts);
  container.addEventListener('touchmove', onMove, opts);
  container.addEventListener('touchend', onEnd, opts);
  container.addEventListener('touchcancel', onCancel, opts);

  return () => {
    container.removeEventListener('touchstart', onStart, opts);
    container.removeEventListener('touchmove', onMove, opts);
    container.removeEventListener('touchend', onEnd, opts);
    container.removeEventListener('touchcancel', onCancel, opts);
  };
}
