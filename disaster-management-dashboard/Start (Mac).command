#!/bin/bash
cd "$(dirname "$0")"

echo "=== Dashboard Monitoring - Sistem Informasi Kebencanaan ==="
echo ""

if [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
  echo "Menginstall dependencies (hanya diperlukan sekali, mohon tunggu)..."
  npm run install:all
  if [ $? -ne 0 ]; then
    echo ""
    echo "Instalasi gagal. Pastikan Node.js sudah terinstall dari https://nodejs.org"
    read -p "Tekan Enter untuk menutup..."
    exit 1
  fi
  echo ""
fi

echo "Menjalankan server..."
npm start &
SERVER_PID=$!

echo "Menunggu server siap di http://localhost:8787 ..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:8787"; then
    break
  fi
  sleep 1
done

open "http://localhost:8787"

echo ""
echo "Aplikasi berjalan di http://localhost:8787"
echo "Biarkan jendela Terminal ini tetap terbuka selama memakai aplikasi."
echo "Tutup jendela ini (atau tekan Ctrl+C) untuk menghentikan server."
wait $SERVER_PID
