@echo off
REM Script untuk menjalankan aplikasi Price Engine di port tertentu
REM Gunakan untuk menghindari bentrok dengan aplikasi lain

REM Simpan current directory
cd /d "%~dp0"

set PORT=8080
set HOST=localhost

REM Jika ingin mengubah port, edit nilai PORT di atas
REM Contoh: set PORT=3000

echo ========================================
echo  Price Engine - HTTP Server
echo ========================================
echo.
echo Working directory: %CD%
echo Menjalankan server di: http://%HOST%:%PORT%
echo.
echo Tekan Ctrl+C untuk menghentikan server
echo ========================================
echo.

REM Cek apakah Node.js tersedia
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js tidak ditemukan!
    echo.
    echo Silakan install Node.js dari https://nodejs.org/
    echo Atau gunakan opsi lain:
    echo   1. Live Server extension di VS Code
    echo   2. Python: python -m http.server %PORT%
    echo.
    pause
    exit /b 1
)

echo Node.js ditemukan, menjalankan server...
echo.

REM Jalankan http-server dengan error handling
npx --yes http-server -p %PORT% -a %HOST% --cors
set SERVER_ERROR=%ERRORLEVEL%

if %SERVER_ERROR% NEQ 0 (
    echo.
    echo ERROR: Server gagal dijalankan (Error code: %SERVER_ERROR%)
    echo.
    pause
    exit /b %SERVER_ERROR%
)

REM Jika sampai sini berarti server dihentikan normal
echo.
echo Server dihentikan.
pause

