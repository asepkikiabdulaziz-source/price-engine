#!/bin/bash
# Script untuk menjalankan aplikasi Price Engine di port tertentu
# Gunakan untuk menghindari bentrok dengan aplikasi lain

PORT=8080
HOST=localhost

# Jika ingin mengubah port, edit nilai PORT di atas
# Contoh: PORT=3000

echo "========================================"
echo " Price Engine - HTTP Server"
echo "========================================"
echo ""
echo "Menjalankan server di: http://${HOST}:${PORT}"
echo ""
echo "Tekan Ctrl+C untuk menghentikan server"
echo "========================================"
echo ""

# Cek apakah Node.js tersedia
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js tidak ditemukan!"
    echo ""
    echo "Silakan install Node.js dari https://nodejs.org/"
    echo "Atau gunakan opsi lain:"
    echo "  1. Live Server extension di VS Code"
    echo "  2. Python: python -m http.server ${PORT}"
    echo ""
    exit 1
fi

# Jalankan http-server
npx http-server -p ${PORT} -a ${HOST} --cors

