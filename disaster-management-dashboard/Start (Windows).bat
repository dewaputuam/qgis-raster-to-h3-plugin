@echo off
setlocal
cd /d "%~dp0"

echo === Dashboard Monitoring - Sistem Informasi Kebencanaan ===
echo.

if exist "server\node_modules" if exist "client\node_modules" goto :skip_install
echo Menginstall dependencies (hanya diperlukan sekali, mohon tunggu)...
call npm run install:all
if errorlevel 1 (
  echo.
  echo Instalasi gagal. Pastikan Node.js sudah terinstall dari https://nodejs.org
  pause
  exit /b 1
)
echo.
:skip_install

echo Menjalankan server...
start "Disaster Dashboard Server" cmd /k "npm start"

echo Menunggu server siap di http://localhost:8787 ...
for /l %%i in (1,1,60) do (
  curl -s -o nul "http://localhost:8787" 2>nul && goto :ready
  timeout /t 1 >nul
)
:ready

start "" "http://localhost:8787"

echo.
echo Aplikasi berjalan di http://localhost:8787
echo Jendela server terpisah ("Disaster Dashboard Server") akan tetap berjalan -
echo tutup jendela itu untuk menghentikan aplikasi.
pause
