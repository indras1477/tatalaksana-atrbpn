#!/bin/bash
# Deploy SIMPEL ATR/BPN — build + restart + verifikasi.
# Pakai: ./deploy.sh            (build web + reload keduanya)
#        ./deploy.sh api        (hanya API, tanpa build)
#
# Mencegah "Bad gateway 502": setelah reload, skrip MENUNGGU aplikasi benar-benar
# siap sebelum menyatakan selesai (Next.js butuh beberapa detik untuk melayani).
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HANYA_API="${1:-}"

if [ "$HANYA_API" != "api" ]; then
  echo "▶ Membangun aplikasi web…"
  cd "$DIR/web"
  # PENTING: tanpa pipefail, kode keluar diambil dari `tail` sehingga build yang
  # GAGAL tetap dianggap sukses dan layanan ikut di-reload dengan kode lama.
  set -o pipefail
  if ! npx next build 2>&1 | tail -25; then
    echo "✗ BUILD GAGAL — perubahan TIDAK diterapkan (layanan lama tetap jalan)."
    exit 1
  fi
  set +o pipefail
fi

echo "▶ Memeriksa sintaks API…"
node --check "$DIR/api/server.js" || { echo "✗ server.js bermasalah — dibatalkan."; exit 1; }

echo "▶ Memuat ulang layanan…"
pm2 reload esop-api >/dev/null
[ "$HANYA_API" != "api" ] && pm2 reload web-esop >/dev/null

echo "▶ Menunggu layanan siap…"
tunggu() { # $1 = url, $2 = nama
  for i in $(seq 1 30); do
    kode=$(curl -s -o /dev/null -w "%{http_code}" "$1" --max-time 10 || echo 000)
    case "$kode" in 200|301|302|308|401) echo "  ✓ $2 siap (HTTP $kode)"; return 0;; esac
    sleep 2
  done
  echo "  ✗ $2 TIDAK merespons setelah 60 detik (HTTP $kode)"; return 1
}
tunggu "http://127.0.0.1:5001/api/sop/models" "API   :5001"
tunggu "http://127.0.0.1:5000/e-sop-atrbpn/" "Web   :5000"
tunggu "http://127.0.0.1/e-sop-atrbpn/sop/" "Nginx (publik)" || true

echo "▶ Status akhir:"
pm2 list | grep -E "web-esop|esop-api" || true
echo "✅ Selesai. Jangan lupa hard-refresh browser (Ctrl+Shift+R)."
